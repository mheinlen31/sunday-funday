#!/usr/bin/env python3
"""Refresh Sunday Funday keeper data.

Reads rosters from 'Sunday Funday Stuff.xlsx' (2026 Keeper Values sheet),
fetches current ESPN Live Draft Results average auction values, recomputes
keeper prices per the Manifesto, and writes js/data.js for the site.

Pricing rules (Manifesto v5.1):
  - FA pickup ('-' draft cost): keeper price = current market value
  - Drafted/kept player: market up more than $10 -> prev cost + $10
                         otherwise -> (prev cost + market) / 2
  - Repeat keepers (Acquired Via "Keeper...") kept again sign 2-yr deals:
    next year = this year's price + $5
  - Rows whose price cell is hardcoded in the sheet are contract-locked
    (renewals at prev + $5, or year 2 marked CONTRACT); ESPN values ignored.

Run:  python3 scripts/refresh_data.py
"""
import json
import math
import re
import unicodedata
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parent.parent
XLSX = ROOT / "Sunday Funday Stuff.xlsx"
SHEET = "2026 Keeper Values"
SEASON = 2026
BAND_ROWS = (1, 21, 41, 61, 81)  # header row of each two-team band
BLOCK_COLS = (1, 9)              # first column of the left/right team block

ESPN_URL = (
    "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/"
    f"{SEASON}/segments/0/leaguedefaults/3?view=kona_player_info"
)
ESPN_FILTER = {"players": {"limit": 2500, "sortDraftRanks": {
    "sortPriority": 100, "sortAsc": True, "value": "STANDARD"}}}
POS_IDS = {1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "D/ST"}
SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "v"}
# sheet spelling -> ESPN spelling
ALIASES = {
    "rickey pearsall": "ricky pearsall",
    "kenneth gainwell": "kenny gainwell",
    "jason meyers": "jason myers",
}
# Budgets-sheet team name -> Keeper Values sheet team name
TEAM_ALIASES = {"Chovies": "The Chovies", "HopefulChovies": "The Chovies",
                "AFRESHAYPEPPER ASAYWHEN": "Pep", "Gorlock": "Loser"}
# 2026 purses confirmed by Matt 2026-07-10; win over the Budgets sheet.
# Delete once the sheet is updated to match.
PURSE_OVERRIDES = {
    "The Chovies": 197, "Pep": 201, "Bom Bers": 199, "Centersup": 201,
    "Chance": 202, "Juice": 200, "Loser": 196, "Magic Rats": 208,
    "Paw": 196, "Silent Pugios": 200,
}
# NFL team name -> ESPN logo abbreviation (for D/ST images)
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
HEADSHOT = "https://a.espncdn.com/i/headshots/nfl/players/full/{}.png"
TEAM_LOGO = "https://a.espncdn.com/i/teamlogos/nfl/500/{}.png"


def norm_name(name):
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z ]", "", s.lower().replace(".", " ").replace("'", ""))
    parts = [p for p in s.split() if p not in SUFFIXES]
    return " ".join(parts)


def fetch_espn():
    req = urllib.request.Request(ESPN_URL, headers={
        "X-Fantasy-Filter": json.dumps(ESPN_FILTER),
        "User-Agent": "Mozilla/5.0",
    })
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
        name = p.get("fullName", "")
        if pos == "D/ST":
            name = name.replace(" D/ST", "")
        key = (norm_name(name), pos)
        # keep the highest AAV if a name collides
        if key not in market or aav > market[key]["aav"]:
            market[key] = {"aav": aav, "id": p.get("id")}
    return market


def lookup(market, name, pos):
    """Return (entry, espn_pos) matching by name+pos, then alias, then name only."""
    n = norm_name(name)
    n = ALIASES.get(n, n)
    if (n, pos) in market:
        return market[(n, pos)], pos
    for (mn, mp), entry in market.items():
        if mn == n:
            return entry, mp
    return None, pos


def player_img(name, pos, espn_id):
    if pos == "D/ST":
        abbr = NFL_ABBR.get(norm_name(name))
        return TEAM_LOGO.format(abbr) if abbr else None
    return HEADSHOT.format(espn_id) if espn_id else None


def fmt_money(x):
    return int(x) if x == int(x) else x


def keeper_price(draft_cost, market_val):
    if draft_cost is None:  # FA pickup
        return market_val
    if market_val - draft_cost > 10:
        return draft_cost + 10
    return (draft_cost + market_val) / 2


def read_rosters():
    wb_vals = load_workbook(XLSX, data_only=True)
    wb_forms = load_workbook(XLSX)
    wsv, wsf = wb_vals[SHEET], wb_forms[SHEET]
    teams = []
    for band in BAND_ROWS:
        for col in BLOCK_COLS:
            name = wsv.cell(band, col).value
            if not name:
                continue
            players = []
            for r in range(band + 1, band + 20):
                pname = wsv.cell(r, col).value
                if pname is None:
                    break
                raw_cost = wsv.cell(r, col + 3).value
                price_cell = wsf.cell(r, col + 5).value
                players.append({
                    "name": str(pname).strip(),
                    "pos": wsv.cell(r, col + 1).value,
                    "acquired": wsv.cell(r, col + 2).value,
                    "draftCost": None if raw_cost in ("-", None) else float(raw_cost),
                    "sheetMarket": wsv.cell(r, col + 4).value,
                    "sheetPrice": wsv.cell(r, col + 5).value,
                    "priceLocked": not (isinstance(price_cell, str) and price_cell.startswith("=")),
                    "contractCell": wsv.cell(r, col + 6).value,
                })
            teams.append({"name": str(name).strip(), "players": players})
    return teams


def read_history_slots(wb):
    """Per year sheet, the roster of each franchise slot (stable grid position).

    Team names change year to year, but every sheet keeps the same 5x2 grid of
    franchises, so slot index (band-then-block order) identifies the franchise.
    Returns {year: [set(norm player names), ...10 slots...]}.
    """
    history = {}
    for year in range(2019, SEASON + 1):
        ws = wb[f"{year} Keeper Values"]
        headers = []  # (row, name_col) per slot, row-major
        for row in ws.iter_rows(min_row=1, max_row=140):
            for c in row:
                if c.value == "Position" and c.column > 1:
                    headers.append((c.row, c.column - 1))
        slots = []
        for hrow, col in headers:
            names = set()
            for r in range(hrow + 1, hrow + 20):
                v = ws.cell(r, col).value
                if v is None:
                    break
                names.add(norm_name(str(v)))
            slots.append(names)
        if len(slots) != 10:
            print(f"warning: {year} sheet has {len(slots)} team blocks, expected 10")
        history[year] = slots
    return history


def tenure(history, slot, player_name):
    """Consecutive year-sheets (through SEASON) this player appears in this slot."""
    n = norm_name(player_name)
    streak = 1  # present on the SEASON sheet by definition
    for year in range(SEASON - 1, 2018, -1):
        slots = history.get(year, [])
        if slot < len(slots) and n in slots[slot]:
            streak += 1
        else:
            break
    return streak


def read_purses():
    """Auction purse per team from the '{SEASON} Auction Money' budget section."""
    ws = load_workbook(XLSX, data_only=True)["Sunday Funday Budgets"]
    purses, in_section = {}, False
    for row in ws.iter_rows(max_col=2):
        label, val = row[0].value, row[1].value
        if isinstance(label, str) and label.strip().startswith(str(SEASON)):
            in_section = True
            continue
        if in_section:
            if not isinstance(label, str) or not label.strip():
                break
            name = label.strip()
            purses[TEAM_ALIASES.get(name, name)] = float(val)
    for name, purse in PURSE_OVERRIDES.items():
        if purses.get(name) != purse:
            print(f"purse override: {name} ${purses.get(name)} (sheet) -> ${purse} (confirmed)")
        purses[name] = float(purse)
    return purses


def main():
    teams = read_rosters()
    market = fetch_espn()
    purses = read_purses()
    history = read_history_slots(load_workbook(XLSX, data_only=True))
    for slot, team in enumerate(teams):
        team["purse"] = purses.get(team["name"])
        if team["purse"] is None:
            print(f'warning: no {SEASON} auction purse found for {team["name"]}')
        for p in team["players"]:
            streak = tenure(history, slot, p["name"])
            p["seasons"] = streak            # seasons with the franchise, incl. upcoming decision
            p["since"] = SEASON - streak     # first NFL season on this roster
    unmatched = []

    for team in teams:
        for p in team["players"]:
            entry, espn_pos = lookup(market, p["name"], p["pos"])
            if entry is None:
                unmatched.append(f'{p["name"]} ({p["pos"]}, {team["name"]})')
                mval = float(p["sheetMarket"] or 1)
                p["img"] = player_img(p["name"], p["pos"], None)
            else:
                mval = max(1, round(entry["aav"]))
                if espn_pos != p["pos"]:
                    print(f'note: {p["name"]} listed as {p["pos"]} in sheet, '
                          f'{espn_pos} on ESPN — using ESPN position')
                    p["pos"] = espn_pos
                p["img"] = player_img(p["name"], p["pos"], entry["id"])
            p["market"] = fmt_money(mval)

            is_repeat = str(p["acquired"] or "").startswith("Keeper")
            locked_yr2 = str(p["contractCell"] or "").strip().upper() == "CONTRACT"

            # league convention: fractional prices round down
            if p["priceLocked"]:
                price = math.floor(float(p["sheetPrice"]))
                p["status"] = "contract-yr2" if locked_yr2 else "contract-renewal"
                contract = p["contractCell"] if not locked_yr2 else None
                if isinstance(contract, (int, float)):
                    contract = math.floor(float(contract))
            else:
                price = math.floor(keeper_price(p["draftCost"], mval))
                p["status"] = "market"
                contract = price + 5 if is_repeat else None

            p["price"] = fmt_money(price)
            p["nextYear"] = fmt_money(float(contract)) if isinstance(contract, (int, float)) else None
            p["surplus"] = fmt_money(round(mval - price))
            p["draftCost"] = fmt_money(p["draftCost"]) if p["draftCost"] is not None else None
            for k in ("sheetMarket", "sheetPrice", "priceLocked", "contractCell"):
                p.pop(k)

    out = {
        "season": SEASON,
        "priorSeason": SEASON - 1,
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "teams": teams,
    }
    (ROOT / "data").mkdir(exist_ok=True)
    (ROOT / "data" / "keepers.json").write_text(json.dumps(out, indent=2))
    js = "window.LEAGUE_DATA = " + json.dumps(out) + ";\n"
    (ROOT / "js").mkdir(exist_ok=True)
    (ROOT / "js" / "data.js").write_text(js)

    n = sum(len(t["players"]) for t in teams)
    print(f"{len(teams)} teams, {n} players. ESPN pool: {len(market)} players.")
    if unmatched:
        print("No ESPN match (kept sheet value):")
        for u in unmatched:
            print("  -", u)


if __name__ == "__main__":
    main()
