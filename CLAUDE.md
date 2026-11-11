# Sunday Funday — project guide for Claude sessions

**This file is the law** (what is generated, how to ship, the league rules as
the code encodes them). Sessions on this Mac also get the project memory at
`~/.claude/projects/-Users-mattheinlen-Claude-Projects-sunday-funday/memory/`
(loaded automatically; `MEMORY.md` is the index): machine setup, current
status, and how Matt likes to work. The old Mac mini was wiped in Oct 2026 and
took every earlier transcript with it. The diary that survived is the
hand-written commit history:
`git log --no-merges --invert-grep --grep='ESPN refresh' --format='%h %ad %s%n%b' --date=short`
(about 106 commits, 2026-07-10 → 10-25; the other ~400 are the bot's).

**Status (Nov 2026):** IN SEASON. `site.json` is `{"mode": "season", "season": 2026}`,
so the Roster Tracker is the home page and the keeper tools sit under the
"2026 Offseason" tab. The GitHub Action still refreshes the tracker six times a
day and commits as `sunday-funday-bot`. Keeper values locked Sept 2, keepers
were due Sept 4, the auction was Labor Day, Sept 7. Last hand-written commit:
2026-10-25 (iPhone share fix). Next big job: the season rollover (bottom).

## How to ship any change (natural-language requests land here)
1. **Pull first.** The bot commits up to six times a day, so a stale local
   copy gets its push rejected. Claude: `git pull --ff-only` (public repo, no
   login needed). Matt: Fetch origin in GitHub Desktop.
2. Make the edit. Never hand-edit a generated file (see Files below).
3. Touched the tab bar, or a home page (`tracker.html` / `keepers.html`)?
   Run `python3 scripts/site_mode.py` — it rewrites every page's nav and
   regenerates `index.html` as a copy of the mode's home page.
4. JS/CSS touched? **Bump the `?v=` stamp on EVERY page** — all twelve carry
   one identical stamp (`YYYYMMDDHHMM`). This is the line `scripts/publish.sh`
   uses; run it alone (the rest of publish.sh pushes, which can't run here):
   `STAMP=$(date +%Y%m%d%H%M); sed -i '' -E "s/\?v=[A-Za-z0-9]+/?v=$STAMP/g" ./*.html`
5. Verify in the browser preview — there is NO node/npm/gh on this Mac, and
   Python is 3.9.6 without openpyxl. `preview_start` name `sunday-funday`
   (python http.server on :8731, config in `.claude/launch.json`), wait for
   "● Live", check the console, click through the views you touched.
6. Commit on `main` (`git add -A && git commit`, clear subject + descriptive
   body like the existing history). **Do NOT `git push` from the shell — it
   has no GitHub login.** Tell Matt: "click Push origin in GitHub Desktop."
   GitHub Pages serves `main` at https://mheinlen31.github.io/sunday-funday/
   and picks the push up within a minute or two.

Static site for the 10-team Sunday Funday ESPN keeper league (ESPN league
66294, public). Broadcast / sports-media look since Oct 18: paper `#f3f4f1`,
ink `#12171a`, dark masthead `#11151c`, field green `#0d5c3f`, contract gold
`#a9842d`; Barlow Condensed (display) + Inter (text), from Google Fonts.

## Architecture (no build step — plain HTML/CSS/JS)
Twelve pages, identical `<nav class="pagetabs">` on all, `<body data-page>`
picks the board:
- `index.html` — **GENERATED** by `scripts/site_mode.py` (copy of the mode's
  home page; its line-2 comment says so). Never edit it.
- `tracker.html` — Roster Tracker, the season home: Rosters · Season Summary
  (results, standings, payout race, weekly highs, pick sixes, playoff odds
  from a 10,000-run sim, the "Funday" prediction model) · Moves · Stats ·
  Value · 2027 Contracts. Every card has a share-as-image button.
- `trades.html` (2026 trades, hand-graded A–F, plus the 2018–25 narrative
  log) / `block.html` (On the Block — Firebase board, closed since Sept 5) /
  `rosters.html` (Past Rosters 2019–25) / `drafts.html` (Draft History 2011–).
- `keepers.html` — the keeper planner, offseason home ($100 cap, $2-per-$1
  luxury tax, plans persist in localStorage), with sub-tabs `positions.html`,
  `adp.html`, `moves.html` (Price Moves), `budgets.html`, `pool.html`.
- `css/styles.css` — all styling.

Hand-written JS (`js/`): `app.js` (planner), `players.js` (the offseason
boards, switched by `data-page`), `tracker-page.js` (the whole tracker UI),
`playercard.js`, `share.js` (html2canvas), `drafts.js`, `deadline.js` (the
three offseason dates, hardcoded), `block.js` + `blockdata.js` (Firebase
Realtime DB — it borrows Pandy's project `pandy-open-2026`, room
`trips/sunday-funday-block-2026/entries`; leave that room and its rules alone).

**Generated / data files — never hand-edit:**
- `js/data.js` (`window.LEAGUE_DATA`) ← `scripts/refresh_data.py` locally
  (from the workbook) and `scripts/refresh_cloud.py` in the Action. Frozen
  since the Sept 2 lock (`locked: true`).
- `js/history.js` (`window.LEAGUE_HISTORY`, past rosters + trade log) ←
  `refresh_data.py` only.
- `js/tracker.js` (`window.ROSTER_TRACKER`) ← `scripts/track_moves.py`,
  every Action run.
- `js/draftdata.js` (`window.DRAFT_HISTORY`, every draft since 2011) ←
  `export_draft_history.py` in the SIBLING folder
  `~/Claude Projects/sunday-funday-draft` (a Python/SQLite project, no git).
- `tracker/*.json` — the bot's working data: `baseline-2026` (draft-day
  rosters, built once by `build_tracker_baseline.py`), `ledger-2026` (raw
  ESPN transactions + latest snapshot), `players-2026`, `stats-2026`,
  `history-2026` (weekly snapshots for the ▲▼ arrows), `picksix-2026`,
  `predictions-2026`. Two ARE hand-edited: `note-manual.json` (the League
  Manager's note: 2025 payouts, side bets) and `payouts-2026.json` (the
  payout table).

Local-only, gitignored: `Sunday Funday Stuff.xlsx` (sheet "2026 Keeper
Values" is the roster source of truth; the scripts only read it), the
Manifesto v5.1 `.doc` (the league rules), `data/keepers.json`, `.claude/`.

Scripts (`scripts/`): `refresh_data.py` (workbook → data.js/history.js;
needs openpyxl, NOT installed on this Mac), `refresh_cloud.py` (stdlib),
`track_moves.py` (stdlib; `--offline` rebuilds from the ledger, `--warnings`
exits 1 when the tracker flagged something), `site_mode.py`,
`build_tracker_baseline.py` (ran once, Sept 18), `publish.sh` (refresh →
site_mode → restamp → commit → push; the push half is dead here).

The Action (`.github/workflows/refresh.yml`): six crons 6:07am–5:19pm
Central (one right after waivers clear, 11am Wed/Thu/Sat/Sun) plus a manual
"Run workflow" button. `refresh_cloud.py` → `track_moves.py` → commit
`js/data.js js/tracker.js tracker/` → then `track_moves.py --warnings` fails
the run so GitHub emails Matt while the page has still updated. The bot never
touches HTML (restamping collided with unpushed local commits once).

## Hard rules
1. **Pull before editing. Bump the `?v=` stamp on all twelve pages on every
   JS/CSS change. Never `git push` from the shell.**
2. **Never hand-edit generated files** (`index.html`, `js/data.js`,
   `js/history.js`, `js/tracker.js`, `js/draftdata.js`, `tracker/*.json`
   other than `note-manual.json` and `payouts-2026.json`). Fix the generator
   or the workbook, then regenerate.
3. **Fail loudly, never half-apply.** The pipelines stop on an unmatched trade
   name, a missing `FINAL_KEEPERS` name, purses that don't reconcile to
   `BASE_PURSES`, a wrong ESPN team abbreviation, a short stats feed or
   roster. Keep those guards; don't "fix" a stop by skipping the row.
4. **Rounding:** never Python `round()` on ESPN values (banker's rounding bit
   once) — `adp_round` rounds to one decimal, then half-up. Rounding DOWN
   applies only to the keeper average.
5. **Two copies to keep in sync:** the pricing rules and the `ALIASES` table
   live in both `refresh_data.py` and `refresh_cloud.py`; `norm()` in
   `track_moves.py` must match `match_points.norm` in the draft project.
6. **Never invent precision or history:** next year's prices show as a range,
   not an estimate; roster tenure is not computable from the sheets (don't
   show it); no keeper-plan intelligence in public trade notes before the
   deadline. League purses always total $2,000 — check after any trade or
   purse edit.
7. League rules come from the Manifesto v5.1, the workbook, and the commit
   history. Don't invent any.

## League rules as the code encodes them
- **Keeper price** (`refresh_data.py`, mirrored in `refresh_cloud.py`): FA
  pickup → current market value. Drafted/kept player → prior cost + $10 if
  the market rose more than $10, otherwise (cost + market) / 2 rounded down.
  Hardcoded sheet prices (renewals, rows marked `CONTRACT`) are used as-is.
  Repeat keepers sign 2-year deals: year 2 = price + $5, locked.
- **Cap:** $100 keeper budget, $2 luxury tax per $1 over, paid out of the
  $200 auction purse. FAAB is $100 per team per season; rosters 15 + 2 IR.
- **2027 contract logic in season** (`track_moves.py`): first-time keeper
  range = floor((cost+1)/2) … cost+10; a locked year-2 price counts even if
  the player is dropped (dead money); a contract that ends re-signs at +$5
  then +$10; a free-agent pickup resets the chain ("market · no cap"); a
  trade carries the locked price; your own drafted player re-added within
  7 days keeps his basis.
- **Payouts** (`tracker/payouts-2026.json`, Manifesto v5.1): entry $300;
  weekly high $15 (ties split evenly); points race $410/$250/$100; regular
  season $425/$225; 3 seed $80, 4 seed $40; championship-weekend loser $50;
  runner-up $350; champion $750. Six playoff teams, two byes, 18 regular
  weeks. Standings tiebreakers: record, points, head-to-head record,
  head-to-head points.
- **Pick six:** the commissioner applies the points by hand in ESPN; the
  tracker flags "Started by X, override due".
- **Owners** (ESPN team ids 1–10): Matt, Brian, Mark, Bob, Steve, Pat, Leo,
  John, AJ, Mike. Team names drift (`TEAM_RENAMES` maps workbook → current);
  past rosters keep their historical names on purpose.

## Season rollover (next July — not done yet)
Flip `site.json` to `offseason` and run `site_mode.py`; new lock dates in
three places (`js/deadline.js`, `VALUES_LOCK` in both refresh scripts); a new
`tracker/baseline-<year>.json` via `build_tracker_baseline.py` and a fresh
ledger; a new `FINAL_KEEPERS` block after the keeper deadline; then
`refresh_data.py` from the updated workbook (needs openpyxl).

## Known loose ends (Nov 2026)
- `README.md` describes the offseason planner and predates the tracker,
  `site.json`, and `track_moves.py` (the "7am daily" line is six runs now).
- `scripts/refresh_cloud.py` docstring still says it bumps HTML stamps; it
  deliberately does not.
- `js/drafts.js` header points at `~/sunday-funday-draft`; the real folder is
  `~/Claude Projects/sunday-funday-draft`.
- `assets/site.webmanifest` name and colours predate the Oct redesign.
- `scripts/publish.sh` never `git add`s `js/history.js` though
  `refresh_data.py` writes it.

## Related folders (siblings in `~/Claude Projects/`)
`sunday-funday-draft` (draft-history DB + `export_draft_history.py`),
`Sunday Funday Research` (per-year draft spreadsheets), `draft-board` and
`draft-guide` (git repos, Sept 2026 draft-night tools).
