#!/usr/bin/env python3
"""The 2026 draft-day rosters, as the roster tracker's starting point.

Joins three things:
  ESPN's week-1 DRAFT transactions  -- who had whom on draft night, by ESPN player id
  js/data.js (the keeper sheet)     -- contract status and locked 2027 prices for keepers
  js/draftdata.js (draft database)  -- what every roster spot cost (Walker at his $29)

Writes tracker/baseline-2026.json. Run once, locally, after the draft;
scripts/track_moves.py (the daily job) reads it and never needs the sheet.
"""
import json
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from track_moves import (API, BASELINE, EXPECT_ABBREV, POS_IDS, PRO_TEAM, ROOT, SEASON,  # noqa: E402
                         LEAGUE, TEAM_OWNER, TRACKER_DIR, get, kona_players, norm)


def load_js(path, prefix):
    txt = path.read_text()
    assert txt.startswith(prefix), f"{path} does not start with {prefix!r}"
    return json.loads(txt[len(prefix):].rstrip().rstrip(";"))


def main():
    league = get(API + "?view=mTeam")
    for t in league["teams"]:
        if t["abbrev"] != EXPECT_ABBREV.get(t["id"]):
            sys.exit(f"ESPN team {t['id']} is {t['abbrev']!r}, expected {EXPECT_ABBREV.get(t['id'])!r} -- check TEAM_OWNER")
    espn_name = {t["id"]: t["name"] for t in league["teams"]}

    wk1 = get(API + "?view=mTransactions2&scoringPeriodId=1")
    draft = [(tx["teamId"], it["playerId"], tx.get("processDate") or tx.get("proposedDate"))
             for tx in wk1["transactions"] if tx["type"] == "DRAFT" for it in tx["items"]]
    if len(draft) != 150:
        sys.exit(f"expected 150 draft-day roster spots from ESPN, got {len(draft)}")
    draft_date = min(d for _, _, d in draft)

    espn = kona_players([pid for _, pid, _ in draft])
    missing = [pid for _, pid, _ in draft if pid not in espn]
    if missing:
        sys.exit(f"ESPN did not return player info for ids {missing}")

    data = load_js(ROOT / "js" / "data.js", "window.LEAGUE_DATA = ")
    dh = load_js(ROOT / "js" / "draftdata.js", "window.DRAFT_HISTORY = ")
    ix = {f: i for i, f in enumerate(dh["fields"])}
    aliases = dh.get("aliases", {})
    rev_alias = {v: k for k, v in aliases.items()}
    site_team = dh["teams"]                       # owner -> site team name
    purses = dh.get("purses", {}).get(str(SEASON), {})

    db = {}                                        # this season's draft-database rows, by name key
    for r in dh["rows"]:
        if r[ix["year"]] == SEASON:
            db[r[ix["key"]]] = {"price": r[ix["price"]], "keeper": r[ix["keeper"]], "owner": r[ix["owner"]],
                                "name": r[ix["player"]], "pick": r[ix["pick"]], "nom": r[ix["nom"]]}

    sheet_by_id, sheet_by_name = {}, {}            # keeper sheet, by ESPN id (headshot url) and by name
    for t in data["teams"]:
        for p in t["players"]:
            rec = dict(p, team=t["name"])
            m = re.search(r"/full/(\d+)\.png", p.get("img") or "")
            if m:
                sheet_by_id[int(m.group(1))] = rec
            sheet_by_name[norm(p["name"])] = rec

    def find(table, n):
        for k in (n, aliases.get(n), rev_alias.get(n)):
            if k and k in table:
                return table[k]
        return None

    players, problems = [], []
    for team_id, pid, _ in draft:
        e = espn[pid]
        name, n = e["fullName"], norm(e["fullName"])
        pos = POS_IDS.get(e.get("defaultPositionId"), "?")
        owner = TEAM_OWNER[team_id]
        row = find(db, n)
        if not row:
            problems.append(f"no draft-database row for {name} ({owner})")
            continue
        if row["owner"] != owner:
            problems.append(f"{name}: ESPN has him on {owner}, draft database says {row['owner']}")
        sheet = sheet_by_id.get(pid) or find(sheet_by_name, n)
        kept = row["keeper"] == 1
        if sheet and bool(sheet.get("kept")) != kept:
            problems.append(f"{name}: sheet kept={sheet.get('kept')} but draft database keeper={row['keeper']}")
        if sheet and kept and sheet["price"] != row["price"]:
            problems.append(f"{name}: sheet price ${sheet['price']} vs draft database ${row['price']}")
        if kept and not sheet:
            problems.append(f"{name}: kept but not on the keeper sheet")

        # Where he stands in the contract chain going into 2026 (Manifesto,
        # "Repeat Keeper Value and Contracts"). locked2027 = the 2027 price is
        # already set and counts against the cap even if he is dropped.
        if kept:
            st = sheet.get("status") if sheet else None
            if st == "contract-yr2":
                cls, locked = "kept-yr2", None                 # deal ends after 2026
            elif st == "contract-renewal":
                cls, locked = "kept-renewal-yr1", sheet.get("nextYear")
            elif sheet and sheet.get("nextYear") is not None:
                cls, locked = "kept-deal-yr1", sheet.get("nextYear")
            else:
                cls, locked = "kept-first", None
        else:
            cls, locked = "bought", None
        players.append({
            "id": pid, "name": name, "pos": pos,
            "nfl": PRO_TEAM.get(e.get("proTeamId")) if pos != "D/ST" else None,
            "teamId": team_id, "owner": owner,
            "price": row["price"], "keeper": kept, "cls": cls, "locked2027": locked,
            "prior": (sheet or {}).get("draftCost") if kept else None,    # what he cost the year before
            "acquired": (sheet or {}).get("acquired") if sheet else "Draft",
            "pick": row.get("pick"), "nominatedBy": row.get("nom"),
        })

    if problems:
        print("PROBLEMS:")
        for p in problems:
            print("  -", p)
        sys.exit(1)

    out = {
        "season": SEASON, "leagueId": LEAGUE,
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "draftDate": draft_date,
        "teams": [{"id": tid, "owner": o, "name": site_team.get(o, espn_name[tid]),
                   "espnName": espn_name[tid], "purse": purses.get(o)} for tid, o in TEAM_OWNER.items()],
        "players": players,
    }
    TRACKER_DIR.mkdir(exist_ok=True)
    BASELINE.write_text(json.dumps(out, indent=1))
    print(f"baseline: {len(players)} players, ${sum(p['price'] for p in players):,} committed, "
          f"classes {dict(Counter(p['cls'] for p in players))}")
    print(f"locked 2027 money: ${sum(p['locked2027'] or 0 for p in players)} across "
          f"{sum(1 for p in players if p['locked2027'])} contracts")


if __name__ == "__main__":
    main()
