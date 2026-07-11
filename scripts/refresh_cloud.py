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
        market[key] = max(market.get(key, 0), aav)
    return market


def lookup(market, name, pos):
    n = ALIASES.get(norm_name(name), norm_name(name))
    if (n, pos) in market:
        return market[(n, pos)]
    for (mn, _), aav in market.items():
        if mn == n:
            return aav
    return None


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
    market = fetch_espn(d["season"])
    print(f"ESPN pool: {len(market)} players")
    if len(market) < MIN_POOL:
        sys.exit(f"abort: ESPN pool only {len(market)} players — feed looks broken")

    today = datetime.now(timezone.utc).date()
    log = list(d.get("changeLog", []))
    unmatched = []

    for t in d["teams"]:
        for p in t["players"]:
            aav = lookup(market, p["name"], p["pos"])
            if aav is None:
                unmatched.append(p["name"])
                mval = p["market"]
            else:
                mval = max(1, round(aav))
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
                                    "name": p["name"], "from": old_price, "to": p["price"]})
            p["surplus"] = fmt_money(round(p["market"] - p["price"]))

    changed_now = [e for e in log if e["d"] == today.isoformat()]
    if len(changed_now) > MAX_CHANGES:
        sys.exit(f"abort: {len(changed_now)} price changes in one refresh — "
                 "looks like an ESPN data reset, not publishing")

    cutoff = (today - timedelta(days=14)).isoformat()
    d["changeLog"] = [e for e in log if e["d"] >= cutoff]
    d["generated"] = datetime.now(timezone.utc).isoformat(timespec="seconds")

    DATA_JS.write_text("window.LEAGUE_DATA = " + json.dumps(d) + ";\n")

    # cache-bust so league browsers pick up the fresh data
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M")
    for page in ROOT.glob("*.html"):
        page.write_text(re.sub(r"\?v=[A-Za-z0-9]+", f"?v={stamp}", page.read_text()))

    changed_today = [e for e in d["changeLog"] if e["d"] == today.isoformat()]
    print(f"{len(changed_today)} price change(s) today")
    for e in changed_today:
        print(f'  {e["name"]} ({e["team"]}): ${e["from"]} -> ${e["to"]}')
    if unmatched:
        print("no ESPN match (kept prior value):", ", ".join(unmatched))


if __name__ == "__main__":
    main()
