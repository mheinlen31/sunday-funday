#!/usr/bin/env python3
"""Daily cloud refresh (GitHub Actions) — no workbook required.

Rosters, acquisition, and contract statuses come from the committed
js/data.js; this script only refreshes the market-driven numbers:
fetch current ESPN ADP (average auction value), recompute keeper
prices for non-contract players, log any price changes, and bump the
asset version stamps in index.html.

Pricing rules mirror scripts/refresh_data.py — keep them in sync.
Stdlib only, so the Action needs no pip installs.
"""
import json
import math
import re
import sys
import unicodedata
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_JS = ROOT / "js" / "data.js"

# Keeper values lock at Sept 2, 2026, noon Central (CDT = UTC-5) -> 17:00 UTC.
# After this, ESPN ADP changes no longer matter — values are FINAL, so the
# daily refresh stops touching prices.
VALUES_LOCK = datetime(2026, 9, 2, 17, 0, tzinfo=timezone.utc)

# sanity guards: abort (nonzero exit -> failed Action -> email) rather than
# auto-publish garbage if ESPN's feed looks broken or reset
MIN_POOL = 300        # fetched player pool smaller than this = broken feed
MAX_CHANGES = 60      # more simultaneous price changes than this = data reset

POS_IDS = {1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "D/ST"}
SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "v"}
ALIASES = {
    "rickey pearsall": "ricky pearsall",
    "kenneth gainwell": "kenny gainwell",
    "jason meyers": "jason myers",
}
PRO_TEAM = {
    1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN",
    8: "DET", 9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR",
    15: "MIA", 16: "MIN", 17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI",
    22: "ARI", 23: "PIT", 24: "LAC", 25: "SF", 26: "SEA", 27: "TB", 28: "WSH",
    29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU",
}


def norm_name(name):
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z ]", "", s.lower().replace(".", " ").replace("'", ""))
    return " ".join(p for p in s.split() if p not in SUFFIXES)


def fetch_espn(season):
    url = ("https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/"
           f"{season}/segments/0/leaguedefaults/3?view=kona_player_info")
    filt = {"players": {"limit": 2500, "sortDraftRanks": {
        "sortPriority": 100, "sortAsc": True, "value": "STANDARD"}}}
    req = urllib.request.Request(url, headers={
        "X-Fantasy-Filter": json.dumps(filt), "User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.load(r)
    market = {}
    for entry in data.get("players", []):
        p = entry.get("player") or {}
        own = p.get("ownership") or {}
        aav = own.get("auctionValueAverage")
        pos = POS_IDS.get(p.get("defaultPositionId"))
        if aav is None or pos is None:
            continue
        name = p.get("fullName", "").replace(" D/ST", "")
        key = (norm_name(name), pos)
        if key not in market or aav > market[key]["aav"]:
            market[key] = {"aav": aav, "id": p.get("id"), "name": name,
                           "nfl": PRO_TEAM.get(p.get("proTeamId"))}
    return market


def lookup(market, name, pos):
    n = ALIASES.get(norm_name(name), norm_name(name))
    if (n, pos) in market:
        return market[(n, pos)]
    for (mn, _), entry in market.items():
        if mn == n:
            return entry
    return None


NFL_ABBR = {
    "cardinals": "ari", "falcons": "atl", "ravens": "bal", "bills": "buf",
    "panthers": "car", "bears": "chi", "bengals": "cin", "browns": "cle",
    "cowboys": "dal", "broncos": "den", "lions": "det", "packers": "gb",
    "texans": "hou", "colts": "ind", "jaguars": "jax", "chiefs": "kc",
    "raiders": "lv", "chargers": "lac", "rams": "lar", "dolphins": "mia",
    "vikings": "min", "patriots": "ne", "saints": "no", "giants": "nyg",
    "jets": "nyj", "eagles": "phi", "steelers": "pit", "49ers": "sf",
    "seahawks": "sea", "buccaneers": "tb", "titans": "ten", "commanders": "wsh",
}


def player_img(name, pos, espn_id):
    if pos == "D/ST":
        abbr = NFL_ABBR.get(norm_name(name))
        return f"https://a.espncdn.com/i/teamlogos/nfl/500/{abbr}.png" if abbr else None
    return f"https://a.espncdn.com/i/headshots/nfl/players/full/{espn_id}.png" if espn_id else None


def build_pool(market, owned_ids, limit=300):
    """Unowned ESPN players worth showing on the ADP board."""
    pool = []
    for (_, pos), e in market.items():
        if e["id"] in owned_ids or e["aav"] < 0.5:
            continue
        pool.append({"name": e["name"], "pos": pos,
                     "market": max(1, round(e["aav"])),
                     "nfl": e.get("nfl") if pos != "D/ST" else None,
                     "img": player_img(e["name"], pos, e["id"])})
    pool.sort(key=lambda p: -p["market"])
    return pool[:limit]


def keeper_price(draft_cost, market_val):
    if draft_cost is None:  # FA pickup
        return market_val
    if market_val - draft_cost > 10:
        return draft_cost + 10
    return (draft_cost + market_val) / 2


def fmt_money(x):
    return int(x) if x == int(x) else x


def main():
    s = DATA_JS.read_text()
    d = json.loads(s[s.index("{"):s.rindex("}") + 1])

    # once values lock, freeze them: stop touching prices entirely
    if datetime.now(timezone.utc) >= VALUES_LOCK:
        if not d.get("locked"):
            d["locked"] = True
            d["generated"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
            DATA_JS.write_text("window.LEAGUE_DATA = " + json.dumps(d) + ";\n")
            print("values locked — froze final keeper values; no further ESPN updates")
        else:
            print("values already locked — nothing to do")
        return

    market = fetch_espn(d["season"])
    print(f"ESPN pool: {len(market)} players")
    if len(market) < MIN_POOL:
        sys.exit(f"abort: ESPN pool only {len(market)} players — feed looks broken")

    today = datetime.now(timezone.utc).date()
    log = list(d.get("changeLog", []))
    unmatched = []
    owned_ids = set()

    for t in d["teams"]:
        for p in t["players"]:
            entry = lookup(market, p["name"], p["pos"])
            if entry is None:
                unmatched.append(p["name"])
                mval = p["market"]
            else:
                owned_ids.add(entry["id"])
                mval = max(1, round(entry["aav"]))
                if p["pos"] != "D/ST" and entry.get("nfl"):
                    p["nfl"] = entry["nfl"]
            p["market"] = fmt_money(mval)
            if p["status"] == "market":
                old_price = p["price"]
                price = math.floor(keeper_price(p["draftCost"], mval))
                p["price"] = fmt_money(price)
                if str(p.get("acquired") or "").startswith("Keeper"):
                    p["nextYear"] = fmt_money(price + 5)
                if old_price != p["price"]:
                    same_day = next((e for e in log if e["d"] == today.isoformat()
                                     and e["team"] == t["name"] and e["name"] == p["name"]), None)
                    if same_day:
                        same_day["to"] = p["price"]
                        if same_day["from"] == same_day["to"]:
                            log.remove(same_day)
                    else:
                        log.append({"d": today.isoformat(), "team": t["name"],
                                    "name": p["name"], "pos": p["pos"],
                                    "from": old_price, "to": p["price"]})
            p["surplus"] = fmt_money(round(p["market"] - p["price"]))

    changed_now = [e for e in log if e["d"] == today.isoformat()]
    if len(changed_now) > MAX_CHANGES:
        sys.exit(f"abort: {len(changed_now)} price changes in one refresh — "
                 "looks like an ESPN data reset, not publishing")

    # keep the whole offseason, capped at the most recent 500 entries
    d["changeLog"] = log[-500:]
    d["pool"] = build_pool(market, owned_ids)
    d["generated"] = datetime.now(timezone.utc).isoformat(timespec="seconds")

    DATA_JS.write_text("window.LEAGUE_DATA = " + json.dumps(d) + ";\n")

    # NOTE: deliberately no html re-stamping here — GitHub Pages caches
    # data.js for only 10 minutes, and daily stamp edits to the html files
    # collide with unpushed local commits. Stamps are for code changes,
    # which only happen locally (publish.sh handles them).

    changed_today = [e for e in d["changeLog"] if e["d"] == today.isoformat()]
    print(f"{len(changed_today)} price change(s) today")
    for e in changed_today:
        print(f'  {e["name"]} ({e["team"]}): ${e["from"]} -> ${e["to"]}')
    if unmatched:
        print("no ESPN match (kept prior value):", ", ".join(unmatched))


if __name__ == "__main__":
    main()
