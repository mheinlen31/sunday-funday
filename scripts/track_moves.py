#!/usr/bin/env python3
"""Year-round roster tracker for the Sunday Funday keeper league.

Pulls the league's public ESPN feed -- every add, drop, waiver claim (with the
winning bid and the losing ones), and trade of the season, plus today's rosters.
Merges the raw transactions into tracker/ledger-2026.json so nothing is lost if
ESPN prunes old weeks, replays them from the draft-day baseline
(tracker/baseline-2026.json, built once by build_tracker_baseline.py), works
out where every player's contract stands under the Manifesto, and writes
js/tracker.js for the Roster Tracker page.

Runs in the daily GitHub Action (stdlib only) and locally:
    python scripts/track_moves.py             # fetch, merge, write if anything changed
    python scripts/track_moves.py --offline   # rebuild js/tracker.js from the ledger alone
"""
import json
import math
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEASON = 2026
LEAGUE = 66294
API = (f"https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{SEASON}"
       f"/segments/0/leagues/{LEAGUE}")
TRACKER_DIR = ROOT / "tracker"
BASELINE = TRACKER_DIR / f"baseline-{SEASON}.json"
LEDGER = TRACKER_DIR / f"ledger-{SEASON}.json"
PLAYERS = TRACKER_DIR / f"players-{SEASON}.json"
STATS = TRACKER_DIR / f"stats-{SEASON}.json"
HISTORY = TRACKER_DIR / f"history-{SEASON}.json"   # one snapshot per week, for the arrows
OUT_JS = ROOT / "js" / "tracker.js"

FAAB = 100                # free-agent budget per team, per season (Manifesto)
ROSTER_SPOTS = 15         # plus 2 IR
SLOT_IR = 21
REACQUIRE_WINDOW_MS = 7 * 86400 * 1000   # "a full week of free agency (4 auction periods)"

# ESPN team id -> owner. Fixed for the life of the league; team names drift, ids don't.
TEAM_OWNER = {1: "Matt", 2: "Brian", 3: "Mark", 4: "Bob", 5: "Steve",
              6: "Pat", 7: "Leo", 8: "John", 9: "AJ", 10: "Mike"}
EXPECT_ABBREV = {1: "MATT", 2: "DON", 3: "SKI", 4: "Chov", 5: "POLO",
                 6: "PEP", 7: "LEO", 8: "JOHN", 9: "AJ", 10: "MIKE"}
POS_IDS = {1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "D/ST"}
PRO_TEAM = {
    1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN",
    8: "DET", 9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR",
    15: "MIA", 16: "MIN", 17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI",
    22: "ARI", 23: "PIT", 24: "LAC", 25: "SF", 26: "SEA", 27: "TB", 28: "WSH",
    29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU",
}
NFL_ABBR = {  # D/ST nickname -> logo abbreviation
    "cardinals": "ari", "falcons": "atl", "ravens": "bal", "bills": "buf", "panthers": "car",
    "bears": "chi", "bengals": "cin", "browns": "cle", "cowboys": "dal", "broncos": "den",
    "lions": "det", "packers": "gb", "texans": "hou", "colts": "ind", "jaguars": "jax",
    "chiefs": "kc", "raiders": "lv", "chargers": "lac", "rams": "lar", "dolphins": "mia",
    "vikings": "min", "patriots": "ne", "saints": "no", "giants": "nyg", "jets": "nyj",
    "eagles": "phi", "steelers": "pit", "49ers": "sf", "seahawks": "sea", "buccaneers": "tb",
    "titans": "ten", "commanders": "wsh",
}
SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "v"}

# ESPN stat ids for the readable stat line (checked against 2025 totals when the
# War Room was built: Gibbs 1,223 rush yds = id 24, and so on). Fantasy points
# themselves come from ESPN's appliedTotal, which the league endpoint scores
# with THIS league's settings (6-point passing TDs and all).
STAT_IDS = {
    "QB":   {"py": 3, "ptd": 4, "int": 20, "ry": 24, "rtd": 25},
    "RB":   {"ra": 23, "ry": 24, "rtd": 25, "rec": 53, "recy": 42, "rectd": 43},
    "WR":   {"tgt": 58, "rec": 53, "recy": 42, "rectd": 43, "ry": 24, "rtd": 25},
    "TE":   {"tgt": 58, "rec": 53, "recy": 42, "rectd": 43},
    "K":    {"fgm": 83, "fga": 84, "xpm": 86},
    "D/ST": {"sack": 99, "int": 95, "fr": 96, "pa": 120},
}
DST_TD_IDS = (101, 102, 103, 104)      # return / interception / fumble touchdowns
STAT_SLOTS = [0, 2, 4, 6, 16, 17, 23]   # QB RB WR TE D/ST K FLEX
STAT_LIMIT = 600                       # ESPN's top scorers to rank against
POOL_TOP = 300                         # unrostered players carried onto the page


# ---------------------------------------------------------------- helpers
def norm(name):
    """Same key the draft database uses (match_points.norm): dots and
    apostrophes dropped, hyphens kept, a trailing Jr/Sr/II/III stripped."""
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\bd/st\b", "", s)
    s = re.sub(r"[.'`,]", "", s)
    s = re.sub(r"[^a-z0-9\- ]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return re.sub(r"\b(" + "|".join(SUFFIXES) + r")$", "", s).strip()


def get(url, filt=None, tries=3):
    hdr = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}
    if filt:
        hdr["X-Fantasy-Filter"] = json.dumps(filt)
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=hdr), timeout=60) as r:
                return json.load(r)
        except (urllib.error.URLError, TimeoutError) as e:
            if isinstance(e, urllib.error.HTTPError) and e.code in (400, 401, 403, 404):
                raise
            if attempt == tries - 1:
                raise
            time.sleep(3 * (attempt + 1))


def kona_players(ids):
    """Player name/position/team for arbitrary ESPN ids (50 per request)."""
    out = {}
    ids = sorted(set(ids))
    for i in range(0, len(ids), 50):
        chunk = ids[i:i + 50]
        d = get(API + "?view=kona_player_info", {"players": {"filterIds": {"value": chunk}}})
        for p in d.get("players", []):
            out[p["id"]] = p["player"]
    return out


def player_img(name, pos, pid):
    if pos == "D/ST":
        abbr = NFL_ABBR.get(norm(name))
        return f"https://a.espncdn.com/i/teamlogos/nfl/500/{abbr}.png" if abbr else None
    return f"https://a.espncdn.com/i/headshots/nfl/players/full/{pid}.png" if pid and pid > 0 else None


def meta_from_espn(p):
    pos = POS_IDS.get(p.get("defaultPositionId"), "?")
    return {"name": p["fullName"], "pos": pos,
            "nfl": PRO_TEAM.get(p.get("proTeamId")) if pos != "D/ST" else None,
            "pro": PRO_TEAM.get(p.get("proTeamId")),
            "img": player_img(p["fullName"], pos, p["id"])}


def load_json(path, default):
    return json.loads(path.read_text()) if path.exists() else default


def ts_of(tx):
    return tx.get("processDate") or tx.get("proposedDate") or 0


def slim(tx):
    return {
        "id": tx["id"], "type": tx.get("type"), "status": tx.get("status"),
        "teamId": tx.get("teamId"), "bidAmount": tx.get("bidAmount"),
        "scoringPeriodId": tx.get("scoringPeriodId"),
        "proposedDate": tx.get("proposedDate"), "processDate": tx.get("processDate"),
        "executionType": tx.get("executionType"),
        "items": [{k: it.get(k) for k in ("type", "playerId", "fromTeamId", "toTeamId",
                                          "fromLineupSlotId", "toLineupSlotId")}
                  for it in tx.get("items", [])],
    }


# ---------------------------------------------------------------- stats
def fetch_stats(latest, rostered):
    """Season-to-date points (league scoring), weekly points, games, last
    season, ESPN's season projection and a few raw stats -- for ESPN's top
    scorers plus every rostered player who is not among them (yet)."""
    periods = {"value": max(1, latest), "additionalValue": [f"00{SEASON}", f"10{SEASON}", f"00{SEASON - 1}"]}
    filt = {"players": {"filterSlotIds": {"value": STAT_SLOTS}, "filterStatsForTopScoringPeriodIds": periods,
                        "sortAppliedStatTotal": {"sortAsc": False, "sortPriority": 1, "value": f"00{SEASON}"},
                        "limit": STAT_LIMIT, "offset": 0}}
    d = get(API + f"?view=kona_player_info&scoringPeriodId={latest}", filt)
    entries = list(d.get("players", []))
    got = {e["id"] for e in entries}
    rest = sorted(set(rostered) - got)
    for i in range(0, len(rest), 50):
        d2 = get(API + f"?view=kona_player_info&scoringPeriodId={latest}",
                 {"players": {"filterIds": {"value": rest[i:i + 50]}, "filterStatsForTopScoringPeriodIds": periods}})
        entries += d2.get("players", [])
    out = {}
    for e in entries:
        p = e["player"]
        pos = POS_IDS.get(p.get("defaultPositionId"))
        if not pos:
            continue
        season = proj = prev = None
        weeks = {}
        for st in p.get("stats") or []:
            sid, src, split, per = st.get("seasonId"), st.get("statSourceId"), st.get("statSplitTypeId"), st.get("scoringPeriodId")
            if sid == SEASON and src == 0 and split == 0:
                season = st
            elif sid == SEASON and src == 1 and split == 0:
                proj = st
            elif sid == SEASON - 1 and src == 0 and split == 0:
                prev = st
            elif sid == SEASON and src == 0 and split == 1 and per and st.get("stats"):
                weeks[per] = round(st.get("appliedTotal") or 0, 1)
        raw = (season or {}).get("stats") or {}
        g = lambda i: raw.get(str(i), 0) or 0
        line = {k: round(g(i)) for k, i in STAT_IDS.get(pos, {}).items()}
        if pos == "D/ST":
            line["td"] = round(sum(g(i) for i in DST_TD_IDS))
        out[str(p["id"])] = {
            "meta": meta_from_espn(p), "team": e.get("onTeamId") or 0, "inj": p.get("injuryStatus"),
            "pts": round((season or {}).get("appliedTotal") or 0, 1),
            "proj": round(proj["appliedTotal"], 1) if proj and proj.get("appliedTotal") is not None else None,
            "prev": round(prev["appliedTotal"], 1) if prev and prev.get("appliedTotal") is not None else None,
            "w": [weeks.get(i) for i in range(1, latest + 1)],
            "gp": len(weeks), "line": line,
        }
    # positional rank among ESPN's top scorers; a rostered player with no points
    # yet sits below all of them and gets no number
    by_pos = defaultdict(list)
    for pid, r in out.items():
        if r["pts"] > 0:
            by_pos[r["meta"]["pos"]].append((r["pts"], pid))
    for lst in by_pos.values():
        lst.sort(key=lambda x: -x[0])
        for i, (_, pid) in enumerate(lst):
            out[pid]["rk"] = i + 1
    if len(out) < 200:
        sys.exit(f"ESPN stats feed returned only {len(out)} players -- not writing anything")
    return {"week": latest, "players": out}


# ---------------------------------------------------------------- fetch
def fetch(ledger, baseline):
    league = get(API + "?view=mTeam&view=mRoster&view=mSettings")
    if len(league.get("teams", [])) != 10:
        sys.exit(f"ESPN returned {len(league.get('teams', []))} teams -- not writing anything")
    for t in league["teams"]:
        if t["abbrev"] != EXPECT_ABBREV.get(t["id"]):
            sys.exit(f"ESPN team {t['id']} is {t['abbrev']!r}, expected {EXPECT_ABBREV.get(t['id'])!r}")
    status = league["status"]
    latest = status.get("latestScoringPeriod") or league.get("scoringPeriodId") or 1
    entries = sum(len(t["roster"]["entries"]) for t in league["teams"])
    if entries < 10 * (ROSTER_SPOTS - 2):
        sys.exit(f"only {entries} roster entries came back -- ESPN feed looks broken")

    seen = {tx["id"]: tx for tx in ledger.get("transactions", [])}
    new = 0
    for week in range(1, latest + 1):
        d = get(API + f"?view=mTransactions2&scoringPeriodId={week}")
        for tx in d.get("transactions", []):
            if all(it.get("type") == "LINEUP" for it in tx.get("items", [])):
                continue                      # lineup shuffles only
            if tx["id"] not in seen:
                new += 1
            seen[tx["id"]] = slim(tx)
    ledger["transactions"] = sorted(seen.values(), key=lambda t: (ts_of(t), t["id"]))
    ledger["snapshot"] = {
        "fetched": int(time.time() * 1000), "week": latest,
        "waiverLastExecutionDate": status.get("waiverLastExecutionDate"),
        "acquisitionBudget": league["settings"].get("acquisitionSettings", {}).get("acquisitionBudget", FAAB),
        "teams": [{
            "id": t["id"], "espnName": t["name"], "abbrev": t["abbrev"],
            "record": t.get("record", {}).get("overall", {}),
            "counter": t.get("transactionCounter", {}),
            "roster": [{
                "pid": e["playerId"], "slot": e.get("lineupSlotId"),
                "acq": e.get("acquisitionType"), "acqDate": e.get("acquisitionDate"),
                "inj": e.get("injuryStatus"),
                "meta": meta_from_espn(e["playerPoolEntry"]["player"]),
            } for e in t["roster"]["entries"]],
        } for t in league["teams"]],
    }
    # bye weeks (for the lineup-trouble panel) and the week's results (for the review)
    byes = {}
    season_url = f"https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{SEASON}?view=proTeamSchedules_wl"
    for pt in (get(season_url).get("settings") or {}).get("proTeams") or []:
        ab = PRO_TEAM.get(pt.get("id"))
        if ab and pt.get("byeWeek"):
            byes[ab] = pt["byeWeek"]
    matchups = []
    for m in get(API + "?view=mMatchupScore").get("schedule") or []:
        h, a = m.get("home") or {}, m.get("away") or {}
        if not h.get("teamId") or not a.get("teamId"):
            continue
        matchups.append({"week": m.get("matchupPeriodId"), "home": h["teamId"], "away": a["teamId"],
                         "hp": round(h.get("totalPoints") or 0, 1), "ap": round(a.get("totalPoints") or 0, 1),
                         "winner": m.get("winner"), "playoff": (m.get("playoffTierType") or "NONE") != "NONE"})
    ledger["snapshot"]["byes"] = byes
    ledger["snapshot"]["matchups"] = matchups
    ledger["snapshot"]["current"] = league.get("scoringPeriodId") or latest
    stats = fetch_stats(latest, [e["playerId"] for t in league["teams"] for e in t["roster"]["entries"]])
    print(f"ESPN: week {latest}, {entries} roster entries, {len(seen)} transactions on file ({new} new), "
          f"stats for {len(stats['players'])} players")
    return ledger, new, stats


# ---------------------------------------------------------------- model
def build(baseline, ledger, players, stats=None, weekly=None):
    snap = ledger.get("snapshot")
    if not snap:
        sys.exit("no roster snapshot yet -- run once online first")
    teams = {t["id"]: dict(t) for t in baseline["teams"]}
    for t in snap["teams"]:
        teams[t["id"]].update(espnName=t["espnName"], record=t["record"], counter=t["counter"])
    base_by_pid = {p["id"]: p for p in baseline["players"]}
    for p in baseline["players"]:
        players.setdefault(str(p["id"]), {"name": p["name"], "pos": p["pos"], "nfl": p["nfl"],
                                          "img": player_img(p["name"], p["pos"], p["id"])})
    for t in snap["teams"]:
        for e in t["roster"]:
            players[str(e["pid"])] = e["meta"]

    # ---- events: every executed move, oldest first
    txs = ledger.get("transactions", [])
    executed = [tx for tx in txs if tx["status"] == "EXECUTED" and tx["type"] != "DRAFT"]
    failed = [tx for tx in txs if tx["type"] == "WAIVER" and str(tx["status"]).startswith("FAILED")]
    warnings = []
    events = []
    for tx in sorted(executed, key=lambda t: (ts_of(t), t["id"])):
        ev = {"id": tx["id"], "ts": ts_of(tx), "week": tx.get("scoringPeriodId"),
              "kind": {"WAIVER": "waiver", "FREEAGENT": "free agent"}.get(tx["type"], "trade" if str(tx["type"]).startswith("TRADE") else str(tx["type"]).lower()),
              "team": tx.get("teamId"), "bid": tx.get("bidAmount") or 0,
              "adds": [], "drops": [], "trades": [], "rivals": []}
        for it in tx["items"]:
            frm, to, pid = it.get("fromTeamId") or 0, it.get("toTeamId") or 0, it.get("playerId")
            if it["type"] == "LINEUP":
                continue
            if frm and to:
                ev["trades"].append({"pid": pid, "from": frm, "to": to})
            elif it["type"] == "ADD" and to:
                ev["adds"].append({"pid": pid, "team": to})
            elif it["type"] == "DROP" and frm:
                ev["drops"].append({"pid": pid, "team": frm})
            else:
                warnings.append(f"unrecognized item in transaction {tx['id']}: {it}")
        if ev["trades"]:
            ev["kind"] = "trade"
        # losing waiver claims on the same player, processed in the same run
        for a in ev["adds"]:
            for f in failed:
                if abs(ts_of(f) - ev["ts"]) < 180_000 and any(
                        it["type"] == "ADD" and it.get("playerId") == a["pid"] for it in f["items"]):
                    ev["rivals"].append({"team": f["teamId"], "bid": f.get("bidAmount") or 0,
                                         "pid": a["pid"], "why": f["status"]})
        if ev["adds"] or ev["drops"] or ev["trades"]:
            events.append(ev)

    # ---- replay from the draft-day baseline
    roster = {tid: set() for tid in teams}
    for p in baseline["players"]:
        roster[p["teamId"]].add(p["id"])
    origin = {p["id"]: {"kind": "draft", "base": p} for p in baseline["players"]}
    history = defaultdict(list)          # pid -> what happened to him, oldest first
    last_drop = {}                       # pid -> (teamId, ts)
    added_since_drop = defaultdict(set)  # pid -> teams that picked him up after his last drop
    ever_dropped = set()
    for ev in events:
        for d in ev["drops"]:
            roster[d["team"]].discard(d["pid"])
            last_drop[d["pid"]] = (d["team"], ev["ts"])
            added_since_drop[d["pid"]] = set()
            ever_dropped.add(d["pid"])
            history[d["pid"]].append({"ts": ev["ts"], "what": "dropped", "team": d["team"], "week": ev["week"]})
        for tr in ev["trades"]:
            roster[tr["from"]].discard(tr["pid"])
            roster[tr["to"]].add(tr["pid"])
            history[tr["pid"]].append({"ts": ev["ts"], "what": "traded", "from": tr["from"], "to": tr["to"], "week": ev["week"]})
        for a in ev["adds"]:
            pid, team = a["pid"], a["team"]
            roster[team].add(pid)
            base = base_by_pid.get(pid)
            drop = last_drop.get(pid)
            others = added_since_drop[pid] - {team}
            added_since_drop[pid].add(team)
            o = {"kind": "added", "ts": ev["ts"], "team": team, "bid": ev["bid"], "via": ev["kind"], "week": ev["week"]}
            if base and base["teamId"] == team and drop and drop[0] == team:
                # his own drafted player, back again
                quick = (ev["ts"] - drop[1]) < REACQUIRE_WINDOW_MS and not others
                if base.get("locked2027"):
                    # re-acquired before the keeper deadline: the contract is his again
                    o = {"kind": "draft", "base": base, "reacquired": ev["ts"]}
                elif quick:
                    o["reAdd"] = {"basis": base["price"], "droppedOn": drop[1]}
                else:
                    o["reAddLate"] = {"droppedOn": drop[1], "others": sorted(others)}
            origin[pid] = o
            history[pid].append({"ts": ev["ts"], "what": "added", "team": team, "bid": ev["bid"], "via": ev["kind"], "week": ev["week"]})

    # ---- reconcile with what ESPN shows today
    espn_roster = {t["id"]: {e["pid"] for e in t["roster"]} for t in snap["teams"]}
    for tid in teams:
        if roster[tid] != espn_roster.get(tid, set()):
            only_replay = [players.get(str(p), {}).get("name", p) for p in roster[tid] - espn_roster.get(tid, set())]
            only_espn = [players.get(str(p), {}).get("name", p) for p in espn_roster.get(tid, set()) - roster[tid]]
            warnings.append(f"{teams[tid]['owner']}: replay differs from ESPN -- replay-only {only_replay}, ESPN-only {only_espn}")

    # ---- what 2027 looks like for each player.
    # Next summer's market is built on this season, so nothing today can price a
    # first-time keeper. What IS certain is the range: the Manifesto averages
    # this year's cost with the market (floor: a $1 market) and caps the jump at
    # cost + $10 -- so at least half the cost, at most cost + $10.
    def span(price):
        return math.floor((price + 1) / 2), price + 10

    def outlook(pid, holder):
        o = origin.get(pid) or {"kind": "unknown"}
        if o["kind"] == "draft":
            b = o["base"]
            cls, price = b["cls"], b["price"]
            traded = holder != b["teamId"]
            if cls in ("kept-deal-yr1", "kept-renewal-yr1"):
                return {"type": "locked", "price": b["locked2027"], "basis": price, "cls": cls, "traded": traded,
                        "text": f"Year 2 of his deal: ${b['locked2027']} in 2027, locked. Counts against the cap even if he is dropped."}
            if cls == "kept-yr2":
                return {"type": "resign", "price": price + 5, "price2": price + 10, "basis": price, "cls": cls, "traded": traded,
                        "text": f"His deal ends after 2026. Keep him for 2027 and he re-signs for two years: ${price + 5} in 2027, ${price + 10} in 2028."}
            lo, hi = span(price)
            rule = (f"the average of ${price} and his ESPN value next summer, or ${price + 10} if the market jumps by more than $10 "
                    f"-- so at least ${lo} and at most ${hi}. Where he lands depends on his season")
            if cls == "kept-first":
                return {"type": "formula", "lo": lo, "hi": hi, "basis": price, "cls": cls, "traded": traded,
                        "text": f"Kept once. Keeping him again signs his first two-year deal: 2027 is {rule}; 2028 is $5 more."}
            return {"type": "formula", "lo": lo, "hi": hi, "basis": price, "cls": "bought", "traded": traded,
                    "text": f"Bought at the auction for ${price}. First-time keeper in 2027 at {rule}."}
        if o["kind"] == "added":
            if o.get("reAdd"):
                b = o["reAdd"]["basis"]
                lo, hi = span(b)
                return {"type": "reAdd", "lo": lo, "hi": hi, "basis": b, "cls": "re-added",
                        "text": f"Drafted, dropped, and back within the week: the greater of the auction math against ${b} (${lo} to ${hi}) and his market value next summer."}
            note = (" Dropped and re-added, but after a week" + (" and after another team had him" if o.get("reAddLate", {}).get("others") else "") +
                    ", so he counts as a fresh pickup.") if o.get("reAddLate") else ""
            return {"type": "market", "cls": "pickup",
                    "text": "Free-agent pickup: keepable at his ESPN market value next summer, whatever his season makes it. No cap, no contract history." + note}
        return {"type": "unknown", "cls": "unknown", "text": "No record of how he got here."}

    out_teams = []
    for tid, t in sorted(teams.items()):
        snap_t = next(s for s in snap["teams"] if s["id"] == tid)
        rows = []
        for e in sorted(snap_t["roster"], key=lambda e: (e["slot"] == SLOT_IR, e["slot"])):
            pid = e["pid"]
            o = origin.get(pid, {"kind": "unknown"})
            row = {"pid": pid, "slot": e["slot"], "ir": e["slot"] == SLOT_IR, "inj": e.get("inj"),
                   "how": None, "outlook": outlook(pid, tid), "history": history.get(pid, [])}
            if o["kind"] == "draft":
                b = o["base"]
                row["how"] = {"kind": "kept" if b["keeper"] else "bought", "price": b["price"], "cls": b["cls"],
                              "prior": b.get("prior"), "acquired": b.get("acquired"), "pick": b.get("pick"),
                              "nominatedBy": b.get("nominatedBy"), "from": b["teamId"] if b["teamId"] != tid else None,
                              "reacquired": o.get("reacquired")}
            elif o["kind"] == "added":
                row["how"] = {"kind": "added", "ts": o["ts"], "bid": o["bid"], "via": o["via"], "week": o["week"],
                              "from": o["team"] if o["team"] != tid else None}
            rows.append(row)
        counter = t.get("counter", {})
        spent = counter.get("acquisitionBudgetSpent")
        if spent is None:
            spent = sum(ev["bid"] for ev in events if ev["team"] == tid and ev["kind"] in ("waiver", "free agent"))
        # 2027 cap charges for contract players this team let go
        dead = []
        for p in baseline["players"]:
            if p["teamId"] != tid or not p.get("locked2027") or p["id"] not in ever_dropped:
                continue
            o = origin.get(p["id"], {})
            if o.get("kind") == "draft" and o.get("reacquired"):
                continue                      # back on his roster: the contract is live again
            holder = next((h for h, s in roster.items() if p["id"] in s), None)
            dead.append({"pid": p["id"], "amount": p["locked2027"], "droppedOn": last_drop.get(p["id"], (None, None))[1],
                         "now": holder})
        out_teams.append({
            "id": tid, "owner": t["owner"], "name": t["name"], "espnName": t.get("espnName"), "purse": t.get("purse"),
            "record": t.get("record", {}), "faabSpent": spent, "faabLeft": snap.get("acquisitionBudget", FAAB) - spent,
            "moves": {"adds": sum(1 for ev in events for a in ev["adds"] if a["team"] == tid),
                      "drops": sum(1 for ev in events for d in ev["drops"] if d["team"] == tid),
                      "trades": sum(1 for ev in events if any(tr["from"] == tid or tr["to"] == tid for tr in ev["trades"]))},
            "roster": rows, "deadMoney": dead,
        })

    # season stats: onto every player we know, plus ESPN's top scorers who are
    # unowned (the free-agent pool the Stats view can show)
    sp = (stats or {}).get("players") or {}
    latest = snap["week"]
    def stat_block(rec):
        w = rec.get("w") or []
        gp = rec.get("gp") or 0
        return {"pts": rec["pts"], "gp": gp, "ppg": round(rec["pts"] / gp, 1) if gp else 0, "rk": rec.get("rk"),
                "wk": w[latest - 1] if len(w) >= latest else None, "w": w, "prev": rec.get("prev"),
                "proj": rec.get("proj"), "line": rec.get("line") or {}}
    rostered = {str(e["pid"]) for t in snap["teams"] for e in t["roster"]}
    pool = []
    top = sorted(sp.items(), key=lambda kv: -kv[1]["pts"])
    for pid, rec in top:
        if pid in rostered or pid in players:
            continue
        if len(pool) >= POOL_TOP:
            break
        players[pid] = dict(rec["meta"], fa=True)
        pool.append(pid)
    for pid in list(players):
        rec = sp.get(pid)
        if rec:
            players[pid]["s"] = stat_block(rec)
        else:
            players[pid].pop("s", None)

    # ---- worth so far. Inside a position the league's own draft-day prices are
    # the ladder: the RB whose production ranks 7th among the league's RBs was
    # worth what the 7th-priciest RB cost. Same yardstick as the Draft History
    # page, applied to the season in progress -- dollars, no market guessing.
    ladder = defaultdict(list)
    for p in baseline["players"]:
        ladder[p["pos"]].append(p["price"])
    for lst in ladder.values():
        lst.sort(reverse=True)
    universe = {str(p["id"]) for p in baseline["players"]} | rostered
    by_pos = defaultdict(list)
    for pid in universe:
        rec = players.get(pid)
        if rec:
            by_pos[rec["pos"]].append(((rec.get("s") or {}).get("pts") or 0, pid))
    for pos, lst in by_pos.items():
        lst.sort(key=lambda x: (-x[0], x[1]))
        lad = ladder.get(pos) or [1]
        for i, (_, pid) in enumerate(lst):
            sb = players[pid].setdefault("s", {"pts": 0, "gp": 0, "ppg": 0, "rk": None, "wk": None, "w": [], "prev": None, "proj": None, "line": {}})
            sb["worth"] = lad[i] if i < len(lad) else 1
            sb["lrk"] = i + 1                      # rank among the league's players at his position
    for p in baseline["players"]:
        sb = players[str(p["id"])]["s"]
        sb["paid"] = p["price"]
        sb["val"] = sb["worth"] - p["price"]
    # the scoreboard: what each roster's production would have cost at the
    # auction, against the money the team committed on draft day. A dropped bust
    # keeps his cost and loses his worth; a pickup brings worth for no auction money.
    scoreboard = []
    for tid, t in teams.items():
        mine = [p for p in baseline["players"] if p["teamId"] == tid]
        held = [players[str(pid)]["s"] for pid in roster[tid] if players.get(str(pid), {}).get("s")]
        paid = sum(p["price"] for p in mine)
        worth = sum(sb.get("worth") or 0 for sb in held)
        graded = [(p, players[str(p["id"])]["s"]) for p in mine]
        best = max(graded, key=lambda ps: ps[1]["val"])
        worst = min(graded, key=lambda ps: ps[1]["val"])
        scoreboard.append({"team": tid, "paid": paid, "worth": worth, "surplus": worth - paid,
                           "keeperSurplus": sum(sb["val"] for p, sb in graded if p["keeper"]),
                           "auctionSurplus": sum(sb["val"] for p, sb in graded if not p["keeper"]),
                           "best": {"pid": best[0]["id"], "val": best[1]["val"]},
                           "worst": {"pid": worst[0]["id"], "val": worst[1]["val"]}})
    scoreboard.sort(key=lambda r: -r["surplus"])
    # keeper watch: worth so far against the most he can cost to keep in 2027
    for t in out_teams:
        for row in t["roster"]:
            o, sb = row["outlook"], (players.get(str(row["pid"])) or {}).get("s") or {}
            # ceiling: the most he can cost (bargain test); floor: the least (bust test)
            if o.get("type") in ("locked", "resign"):
                hi = lo = o.get("price")
            elif o.get("type") == "formula":
                hi, lo = o.get("hi"), o.get("lo")
            else:
                hi = lo = None
            if hi is not None and sb.get("worth") is not None:
                row["keep"] = {"cost": hi, "floor": lo, "edge": sb["worth"] - hi, "edgeLo": sb["worth"] - lo}

    # ---- this week's snapshot, and movement against last week's
    wk = snap["week"]
    cur_snap = {"teams": {str(r["team"]): {"surplus": r["surplus"], "worth": r["worth"], "rank": i + 1} for i, r in enumerate(scoreboard)},
                "keep": {str(row["pid"]): row["keep"]["edge"] for t in out_teams for row in t["roster"] if row.get("keep")},
                "pts": {pid: (players[pid].get("s") or {}).get("pts", 0) for pid in players if players[pid].get("s")}}
    if weekly is not None:                     # (not `history` -- that name is the per-player log above)
        weekly[str(wk)] = cur_snap
    prev = (weekly or {}).get(str(wk - 1))
    if prev:
        for i, r in enumerate(scoreboard):
            was = prev["teams"].get(str(r["team"]))
            if was:
                r["dSurplus"] = r["surplus"] - was["surplus"]
                r["dRank"] = was["rank"] - (i + 1)
        for t in out_teams:
            for row in t["roster"]:
                k = row.get("keep")
                if not k:
                    continue
                if str(row["pid"]) in prev.get("keep", {}):
                    k["dEdge"] = k["edge"] - prev["keep"][str(row["pid"])]
                else:
                    k["new"] = True

    # names for anyone in an event who is no longer on a roster
    missing = {str(pid) for ev in events for pid in
               [a["pid"] for a in ev["adds"]] + [d["pid"] for d in ev["drops"]] + [t["pid"] for t in ev["trades"]] +
               [r["pid"] for r in ev["rivals"]]} - set(players)
    payload = {
        "season": SEASON, "leagueId": LEAGUE, "week": snap["week"], "asOf": snap["fetched"],
        "draftDate": baseline["draftDate"],
        "teams": out_teams,
        "events": sorted(events, key=lambda e: (-e["ts"], e["id"])),
        "players": {k: players[k] for k in sorted(players, key=lambda k: players[k]["name"])},
        "pool": sorted([k for k in players if players[k].get("s")], key=lambda k: -players[k]["s"]["pts"]),
        "statsWeek": (stats or {}).get("week"),
        "scoreboard": scoreboard,
        "prevWeek": wk - 1 if prev else None,
        # the last week with results in the books -- what the review is about
        "reviewWeek": max([m["week"] for m in (snap.get("matchups") or []) if m.get("winner") not in (None, "UNDECIDED")] or [None]),
        "matchups": snap.get("matchups") or [],
        "byes": snap.get("byes") or {},
        "current": snap.get("current") or wk,
        "noteManual": load_json(TRACKER_DIR / "note-manual.json", None),
        "payouts": load_json(TRACKER_DIR / f"payouts-{SEASON}.json", None),
        "stats": {
            "adds": sum(len(e["adds"]) for e in events), "drops": sum(len(e["drops"]) for e in events),
            "trades": sum(1 for e in events if e["trades"]),
            "faabSpent": sum(t["faabSpent"] for t in out_teams),
            "biggestBid": max(([e["bid"], e["adds"][0]["pid"], e["team"]] for e in events if e["adds"] and e["bid"]), default=None),
            "lockedMoney": sum(p["locked2027"] or 0 for p in baseline["players"]),
        },
        "warnings": warnings,
    }
    return payload, missing


def main():
    if "--warnings" in sys.argv:
        # the Action runs this AFTER committing, so the page still updates and
        # the job fails loudly enough to send an email
        txt = OUT_JS.read_text() if OUT_JS.exists() else ""
        try:
            warns = json.loads(txt[txt.index("=") + 1:].rstrip().rstrip(";")).get("warnings") or []
        except ValueError:
            warns = ["js/tracker.js is unreadable"]
        for w in warns:
            print("WARNING:", w)
        sys.exit(1 if warns else 0)
    offline = "--offline" in sys.argv
    if not BASELINE.exists():
        sys.exit(f"{BASELINE} missing -- run scripts/build_tracker_baseline.py first")
    baseline = json.loads(BASELINE.read_text())
    ledger = load_json(LEDGER, {"season": SEASON, "transactions": []})
    players = load_json(PLAYERS, {})
    new_tx = 0
    stats = load_json(STATS, None)
    history = load_json(HISTORY, {})
    if not offline:
        ledger, new_tx, stats = fetch(ledger, baseline)
    payload, missing = build(baseline, ledger, players, stats, history)
    if missing and not offline:
        for pid, p in kona_players([int(x) for x in missing]).items():
            players[str(pid)] = meta_from_espn(p)
        payload, missing = build(baseline, ledger, players, stats, history)
    if missing:
        payload["warnings"].append(f"no name on file for player ids {sorted(missing)}")

    for w in payload["warnings"]:
        print("WARNING:", w)

    prev = None
    if OUT_JS.exists():
        txt = OUT_JS.read_text()
        try:
            prev = json.loads(txt[txt.index("=") + 1:].rstrip().rstrip(";"))
        except ValueError:
            prev = None
    same = prev is not None and json.dumps({k: v for k, v in prev.items() if k not in ("generated", "asOf")}, sort_keys=True) == \
        json.dumps({k: v for k, v in payload.items() if k != "asOf"}, sort_keys=True)
    TRACKER_DIR.mkdir(exist_ok=True)
    if stats is not None:
        stats_txt = json.dumps(stats, separators=(",", ":"))
        if not STATS.exists() or STATS.read_text() != stats_txt:
            STATS.write_text(stats_txt)
    hist_txt = json.dumps(history, separators=(",", ":"), sort_keys=True)
    if not HISTORY.exists() or HISTORY.read_text() != hist_txt:
        HISTORY.write_text(hist_txt)
    # the cache keeps identities only -- stats and the free-agent flag are per run
    cache = {k: {f: v[f] for f in ("name", "pos", "nfl", "pro", "img") if f in v} for k, v in players.items() if not v.get("fa")}
    players_txt = json.dumps(cache, separators=(",", ":"), sort_keys=True)
    if not PLAYERS.exists() or PLAYERS.read_text() != players_txt:
        PLAYERS.write_text(players_txt)
    if not LEDGER.exists() or new_tx or not same:
        LEDGER.write_text(json.dumps(ledger, separators=(",", ":")))
    if same:
        print("tracker: no roster or transaction changes -- js/tracker.js left alone")
        return
    payload["generated"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    OUT_JS.write_text("window.ROSTER_TRACKER = " + json.dumps(payload, separators=(",", ":")) + ";\n")
    s = payload["stats"]
    print(f"tracker: wrote js/tracker.js -- week {payload['week']}, {s['adds']} adds, {s['drops']} drops, "
          f"{s['trades']} trades, ${s['faabSpent']} of FAAB spent, {len(payload['events'])} events")


if __name__ == "__main__":
    main()
