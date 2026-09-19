/* Player cards — tap a player for his whole Sunday Funday life: every draft he
   was kept or bought at, who picked him up or traded for him in between, what
   he scored, and where his contract stands now.

   Joins three sources, loaded on first open so the front page stays light:
     js/data.js       current keeper sheet (end of last season) — status, prices
     js/history.js    older keeper sheets = end-of-season rosters, 2018 on
     js/draftdata.js  the draft database — every draft-day roster since 2011
   Names run through the database's own normalizer + alias list so misspelled
   sheet names ("Puka Nakua") land on the right player. */
(function () {
  'use strict';
  var L = window.LEAGUE_DATA;
  if (!L) return;
  var SELF = document.currentScript && document.currentScript.src || '';
  var V = (SELF.match(/[?&]v=(\w+)/) || [])[1] || '';
  var FALLBACK_IMG = 'https://a.espncdn.com/combiner/i?img=/i/headshots/nophoto.png&w=120&h=88';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function money(v) { return v == null ? '—' : '$' + Math.round(v); }

  /* ---------- loading ---------- */
  function load(src, have) {
    if (have()) return Promise.resolve();
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src + (V ? '?v=' + V : '');
      s.onload = res;
      s.onerror = function () { rej(new Error('could not load ' + src)); };
      document.head.appendChild(s);
    });
  }
  var ready = null;
  function ensure() {
    if (!ready) {
      ready = Promise.all([
        load('js/draftdata.js', function () { return !!window.DRAFT_HISTORY; }),
        load('js/history.js', function () { return !!window.LEAGUE_HISTORY; }),
        // the in-season tracker is a bonus, not a requirement
        load('js/tracker.js', function () { return !!window.ROSTER_TRACKER; }).catch(function () { return null; })
      ]).then(buildIndex);
      ready.catch(function () { ready = null; });
    }
    return ready;
  }

  /* ---------- index ---------- */
  var SUFFIX = /\b(jr|sr|ii|iii|iv|v)\.?$/;
  var ALIASES = {};
  function norm(n) {
    n = String(n || '').trim().toLowerCase().replace(/[.'’`,]/g, '');
    n = n.replace(SUFFIX, '').trim();
    return n.replace(/\s+/g, ' ');
  }
  // Prefer the alias when it leads to a player the database knows; otherwise
  // the plain spelling (some aliases point at a Sleeper name the DB never used).
  function key(name) {
    var k = norm(name), a = ALIASES[k];
    if (a && (!drafts || drafts[a])) return a;
    if (drafts && drafts[k]) return k;
    return a || k;
  }

  var drafts, ends, ownerOf, ownerOfTeam, teamOfOwner;
  function buildIndex() {
    var DH = window.DRAFT_HISTORY, H = window.LEAGUE_HISTORY;
    ALIASES = DH.aliases || {};
    var IX = {}; DH.fields.forEach(function (f, i) { IX[f] = i; });
    drafts = {};
    DH.rows.forEach(function (r) {
      var k = r[IX.key] || key(r[IX.player]);
      (drafts[k] = drafts[k] || []).push({
        year: r[IX.year], player: r[IX.player], pos: r[IX.pos], owner: r[IX.owner], price: r[IX.price],
        keeper: r[IX.keeper], pts: r[IX.pts], rk: r[IX.rk], pick: r[IX.pick], nom: r[IX.nom]
      });
    });
    // franchise slot -> owner. Slots are stable across seasons (team names are not).
    teamOfOwner = DH.teams || {};
    var byTeam = {};
    Object.keys(teamOfOwner).forEach(function (o) { byTeam[teamOfOwner[o]] = o; });
    ownerOf = function (slot) { var t = L.teams[slot]; return t ? (byTeam[t.name] || t.name) : '?'; };
    ownerOfTeam = function (name) { return byTeam[name] || name; };
    // A keeper sheet for season Y is the roster at the END of season Y-1.
    ends = {};
    function add(sheetYear, slot, teamName, p) {
      var k = key(p.name);
      (ends[k] = ends[k] || {})[sheetYear - 1] = {
        slot: slot, team: teamName, acquired: String(p.acquired || '').trim(), draftCost: p.draftCost, price: p.price
      };
    }
    Object.keys(H.byYear).forEach(function (y) {
      H.byYear[y].forEach(function (t) { t.players.forEach(function (p) { add(+y, t.slot, t.name, p); }); });
    });
    L.teams.forEach(function (t, slot) { t.players.forEach(function (p) { add(L.season, slot, t.name, p); }); });
  }

  /* ---------- trades that mention him ---------- */
  function nameRe(name) {
    var toks = norm(name).split(' ');
    if (toks.length < 2) return null;            // D/ST: a bare nickname matches too much
    // first three letters + surname survives the trade log's typos ("Saquan
    // Barkley"); a long surname may also drop its last letters ("Ricky Pearsal")
    var lt = toks[toks.length - 1];
    var lastPat = lt.length > 5 ? lt.slice(0, lt.length - 2) + '[\\w-]*' : lt;
    var last = toks.slice(1, -1).concat([lastPat]).join('\\s+').replace(/-(?!\])/g, '[- ]?');
    return new RegExp('\\b' + toks[0].slice(0, 3) + '[\\w-]*\\s+' + last + '\\b');
  }
  /* Was he traded before the draft of season Y? The keeper sheet for Y already
     shows the new team; the trade logs say it was a trade. For the current
     season the structured trade list also says who gave him up. */
  function tradedBefore(name, Y) {
    var re = nameRe(name), k = key(name);
    if (Y === L.season) {
      var hit = null;
      (L.trades || []).forEach(function (tr) {
        Object.keys(tr.sides || {}).forEach(function (team) {
          (tr.sides[team].players || []).forEach(function (n) { if (key(n) === k) hit = { from: team }; });
        });
      });
      if (hit) return hit;
    }
    if (!re) return null;
    var blk = ((window.LEAGUE_HISTORY || {}).tradeHistory || []).filter(function (b) { return +b.year === Y; })[0];
    return blk && (blk.entries || []).some(function (e) { return re.test(norm(e)); }) ? { from: null } : null;
  }
  function tradesFor(name) {
    var re = nameRe(name);
    if (!re) return [];
    var out = [];
    (L.trades || []).forEach(function (tr) {
      if (re.test(norm(tr.summary))) out.push({ when: tr.date, text: tr.summary });
    });
    ((window.LEAGUE_HISTORY || {}).tradeHistory || []).forEach(function (blk) {
      (blk.entries || []).forEach(function (e) {
        if (re.test(norm(e))) out.push({ when: String(blk.year), text: e.replace(/^\s*[\d/]+\s*-\s*/, '') });
      });
    });
    out.sort(function (a, b) { return String(b.when).localeCompare(String(a.when)); });
    return out;
  }

  /* ---------- contract read-out ---------- */
  function contract(p, cur, S) {
    var ny = S + 1;
    if (cur && cur.keeper === 1) {
      if (p.status === 'contract-yr2') return {
        title: 'Final year of a two-year deal',
        ladder: [[S - 1, p.draftCost], [S, cur.price]],
        note: 'Runs out after the ' + S + ' season. Keep him for ' + ny + ' and he re-signs for two more years: ' +
          money(cur.price + 5) + ' in ' + ny + ', ' + money(cur.price + 10) + ' in ' + (ny + 1) + '.'
      };
      if (p.status === 'contract-renewal') return {
        title: 'Two-year deal through ' + ny + ' (renewal)',
        ladder: [[S, cur.price], [ny, p.nextYear]],
        note: 'Re-signed after his first contract ran out. Every contract season is last year’s price + $5, and year two counts against the cap even if he’s dropped.'
      };
      if (p.nextYear != null) return {
        title: 'Two-year deal through ' + ny,
        ladder: [[S, cur.price], [ny, p.nextYear]],
        note: 'His first contract: year one priced like any keeper, year two locked at + $5. It counts against the ' + ny + ' cap even if he’s dropped.'
      };
      return {
        title: 'First-time keeper',
        ladder: [[S, cur.price]],
        note: 'Kept for the first time in ' + S + ', no contract yet. Keep him again for ' + ny +
          ' and he has to sign a two-year deal: ' + ny + ' priced off the market, ' + (ny + 1) + ' at + $5.'
      };
    }
    if (cur) return {
      title: 'Bought at the ' + S + ' auction',
      ladder: [[S, cur.price]],
      note: 'No contract — going back to the auction wipes the slate. Kept for ' + ny + ', he’s a first-time keeper: the average of ' +
        money(cur.price) + ' and his ESPN value, or ' + money(cur.price + 10) + ' if the market jumps more than $10.'
    };
    return {
      title: 'Not on a roster',
      ladder: [],
      note: 'Released at the ' + S + ' keeper deadline and not bought at the auction — a free agent.'
    };
  }

  /* ---------- the live tracker, when it has him ---------- */
  function pidOf(p) {
    var m = (p.img || '').match(/\/full\/(\d+)\.png/);
    if (m) return +m[1];
    var T = window.ROSTER_TRACKER;
    if (!T) return null;
    var k = key(p.name), hit = null;
    Object.keys(T.players || {}).some(function (id) { if (key(T.players[id].name) === k) { hit = +id; return true; } return false; });
    return hit;
  }
  function trackerRow(pid) {
    var T = window.ROSTER_TRACKER;
    if (!T || pid == null) return null;
    var out = null;
    T.teams.forEach(function (t) { t.roster.forEach(function (r) { if (r.pid === pid) out = { row: r, team: t }; }); });
    return out;
  }
  /* contract box from the tracker: how he got here and what 2027 costs */
  function contractLive(tk, S) {
    var r = tk.row, h = r.how || {}, o = r.outlook || {}, ny = S + 1, ladder = [];
    if (h.kind === 'kept' || h.kind === 'bought') ladder.push([S, h.price]);
    if (o.type === 'locked') ladder.push([ny, o.price]);
    if (o.type === 'resign') ladder.push([ny, o.price], [ny + 1, o.price2]);
    if (o.est != null) ladder.push([ny, o.est, true]);           // an estimate, shown with \u2248
    var title = {
      locked: 'Two-year deal through ' + ny + (h.cls === 'kept-renewal-yr1' ? ' (renewal)' : ''),
      resign: 'Final year of a two-year deal',
      formula: h.cls === 'kept-first' ? 'Kept once \u2014 no contract yet' : 'Bought at the ' + S + ' auction',
      market: 'Free-agent pickup' + (h.ts ? ', ' + new Date(h.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + (h.bid ? ' for $' + h.bid : '') : ''),
      reAdd: 'His own drafted player, back within the week'
    }[o.type] || 'On a roster';
    return { title: title, ladder: ladder, note: o.text || '' };
  }

  /* ---------- the card ---------- */
  var overlay, lastFocus;
  function close() {
    if (!overlay) return;
    overlay.remove(); overlay = null;
    document.body.classList.remove('pc-open');
    document.removeEventListener('keydown', onKey);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function onKey(e) { if (e.key === 'Escape') close(); }

  function shell(inner) {
    close();
    lastFocus = document.activeElement;
    overlay = document.createElement('div');
    overlay.className = 'pc-overlay';
    overlay.innerHTML = '<div class="pc-card" role="dialog" aria-modal="true" aria-label="Player history">' +
      '<button class="pc-x" type="button" aria-label="Close">×</button>' + inner + '</div>';
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay || e.target.closest('.pc-x')) close();
    });
    document.body.appendChild(overlay);
    document.body.classList.add('pc-open');
    document.addEventListener('keydown', onKey);
    overlay.querySelector('.pc-x').focus();
  }

  function render(p, team) {
    var S = L.season;
    var k = key(p.name);
    var rows = (drafts[k] || []).slice().sort(function (a, b) { return b.year - a.year; });
    var endMap = ends[k] || {};
    var byYear = {}; rows.forEach(function (r) { byYear[r.year] = r; });
    var cur = byYear[S] || null;
    var T = window.ROSTER_TRACKER, pid = pidOf(p), tk = trackerRow(pid);
    var c, where;
    if (tk) {
      c = contractLive(tk, S);
      where = esc(tk.team.name) + ' <span class="pc-own">' + esc(tk.team.owner) + '</span>' + (tk.row.ir ? ' <span class="pc-dim">IR</span>' : '');
    } else if (T && pid != null && cur) {
      c = { title: 'Not on a roster', ladder: [[S, cur.price]],
            note: 'Dropped during the ' + S + ' season. Whoever picks him up gets a free-agent pickup at market value; if he was on a two-year deal, the locked price stays with the team that signed him.' };
      where = 'Not on a roster';
    } else {
      c = contract(p, cur, S);
      where = cur ? esc(teamOfOwner[cur.owner] || cur.owner) + ' <span class="pc-own">' + esc(cur.owner) + '</span>' : 'Free agent';
    }
    var head = '<header class="pc-head"><img class="pc-mug" src="' + esc(p.img || FALLBACK_IMG) + '" alt="" ' +
      'onerror="this.onerror=null;this.src=\'' + FALLBACK_IMG + '\'">' +
      '<div><h2 class="pc-name">' + esc(p.name) + '</h2>' +
      '<div class="pc-meta"><span class="pos pos-' + esc(String(p.pos).replace('/', '')) + '">' + esc(p.pos) + '</span>' +
      (p.nfl ? ' <span class="nfl">' + esc(p.nfl) + '</span>' : '') + '</div>' +
      '<div class="pc-where">' + where + '</div></div></header>';

    // contract
    var ladder = c.ladder.filter(function (x) { return x[1] != null; }).map(function (x, i) {
      return (i ? '<span class="pc-arrow">→</span>' : '') +
        '<span class="pc-rung' + (x[0] === S ? ' now' : '') + '"><b>' + (x[2] ? '\u2248' : '') + money(x[1]) + '</b><i>' + x[0] + (x[2] ? ' est.' : '') + '</i></span>';
    }).join('');
    var box = '<section class="pc-contract"><div class="pc-label">Contract</div>' +
      '<div class="pc-ctitle">' + esc(c.title) + '</div>' +
      (ladder ? '<div class="pc-ladder">' + ladder + '</div>' : '') +
      '<p class="pc-note">' + esc(c.note) + '</p></section>';

    // facts
    var kept = rows.filter(function (r) { return r.keeper === 1; }).map(function (r) { return r.year; }).sort();
    var owners = []; rows.slice().reverse().forEach(function (r) { if (owners.indexOf(r.owner) < 0) owners.push(r.owner); });
    Object.keys(endMap).forEach(function (y) { var o = ownerOf(endMap[y].slot); if (owners.indexOf(o) < 0) owners.push(o); });
    var spent = rows.reduce(function (t, r) { return t + (r.price || 0); }, 0);
    var best = rows.filter(function (r) { return r.rk; }).sort(function (a, b) { return a.rk - b.rk; })[0];
    function fact(big, small) { return '<div class="pc-fact"><b>' + big + '</b><span>' + small + '</span></div>'; }
    var facts = '<div class="pc-facts">' +
      fact(kept.length ? kept.length + '×' : '0', kept.length ? 'kept · ' + span(kept) : 'never kept') +
      fact(rows.length, rows.length === 1 ? 'draft on a roster' : 'drafts on a roster') +
      fact(money(spent), 'paid, all told') +
      fact(best ? esc(best.pos + best.rk) : '—', best ? 'best finish · ' + best.year : 'no finish yet') +
      '</div>';

    // timeline: one line per season, newest first
    var seasons = {};
    rows.forEach(function (r) { seasons[r.year] = 1; });
    Object.keys(endMap).forEach(function (y) { seasons[y] = 1; });
    var sheetYears = Object.keys(window.LEAGUE_HISTORY.byYear).map(Number).concat([S]);
    var covered = function (season) { return sheetYears.indexOf(season + 1) >= 0; };
    var order = Object.keys(seasons).map(Number).sort(function (a, b) { return a - b; });

    /* Where each keep sits in the contract chain. Kept once = first keep; after
       that, two-year deals: keeps 2-3 are the first deal, 4-5 a renewal, and so
       on. Trades carry the chain; going back to the auction or being picked up
       as a free agent starts it over. (This reproduces the keeper site's own
       contract statuses for every 2026 contract player.) */
    var chain = {};
    order.forEach(function (y) {
      var d = byYear[y];
      if (!d || d.keeper !== 1) return;
      var sheet = endMap[y - 1], prev = byYear[y - 1];
      if (sheet && /(^|\/)\s*fa\b/i.test(sheet.acquired)) chain[y] = 1;
      else if (prev && prev.keeper === 1 && chain[y - 1]) chain[y] = chain[y - 1] + 1;
      else if (prev && prev.keeper == null && prev.year === 2017) chain[y] = 0;   // 2017 flags unknown
      else chain[y] = 1;
    });
    function chainTag(n) {
      if (!n) return '';
      var t = n === 1 ? 'first keep' : (n < 4 ? '2-yr deal' : 'renewal') + ' · yr ' + (n % 2 === 0 ? 1 : 2);
      return ' <span class="pc-tag">' + t + '</span>';
    }

    var line = order.slice().reverse().map(function (y) {
      var d = byYear[y], e = endMap[y], ev = [];
      if (d) {
        var how = d.keeper === 1 ? 'Kept by <b>' + esc(d.owner) + '</b>'
          : (y === 2017 && d.keeper == null) ? 'On <b>' + esc(d.owner) + '</b>’s draft-day roster'
          : 'Bought by <b>' + esc(d.owner) + '</b>';
        var extra = [];
        if (d.pick) extra.push('pick ' + d.pick);
        if (d.nom) extra.push('nominated by ' + esc(d.nom));
        ev.push('<div>' + how + ' · ' + money(d.price) + chainTag(chain[y]) +
          (extra.length ? ' <span class="pc-dim">' + extra.join(' · ') + '</span>' : '') + '</div>');
      }
      // what the next keeper sheet (rosters at the next keeper deadline) says
      if (e) {
        var eo = ownerOf(e.slot);
        var tr = tradedBefore(p.name, y + 1);
        var fa = /(^|\/)\s*fa\b/i.test(e.acquired);
        var giver = tr && tr.from ? ownerOfTeam(tr.from) : null;
        if (tr || /trade/i.test(e.acquired)) {
          if (fa) ev.push('<div class="pc-mid">Picked up as a free agent' + (giver ? ' by <b>' + esc(giver) + '</b>' : '') +
            ', then traded to <b>' + esc(eo) + '</b> before the ' + (y + 1) + ' draft</div>');
          else if (!d || eo !== d.owner) ev.push('<div class="pc-mid">Traded to <b>' + esc(eo) + '</b> before the ' + (y + 1) + ' draft</div>');
        } else if (fa) {
          ev.push('<div class="pc-mid">Picked up as a free agent by <b>' + esc(eo) + '</b></div>');
        } else if (!d || eo !== d.owner) {
          ev.push('<div class="pc-mid">With <b>' + esc(eo) + '</b> at the ' + (y + 1) + ' keeper deadline</div>');
        }
      } else if (d && y < S && covered(y)) {
        ev.push('<div class="pc-mid">Dropped during the season</div>');
      }
      var res = d && d.rk ? esc(d.pos + d.rk) + '<span>' + Math.round(d.pts) + ' pts</span>'
        : (d && d.pts === 0 ? 'DNP' : '');
      return '<li><div class="pc-yr">' + y + '</div><div class="pc-ev">' + ev.join('') + '</div><div class="pc-res">' + res + '</div></li>';
    }).join('');
    var tl = '<section><div class="pc-label">Season by season</div>' +
      (line ? '<ol class="pc-line">' + line + '</ol>' : '<p class="pc-note">No draft-day or season-end roster on record.</p>') + '</section>';

    var trades = tradesFor(p.name);
    var tr = trades.length ? '<section><div class="pc-label">Trades</div><ul class="pc-trades">' +
      trades.map(function (t) { return '<li><span class="pc-dim">' + esc(t.when) + '</span> ' + esc(t.text) + '</li>'; }).join('') +
      '</ul></section>' : '';

    var season = seasonHtml(p);
    var foot = '<p class="pc-foot">' + (window.ROSTER_TRACKER ? '<a href="./">Roster Tracker \u2192</a> ' : '') + 'Points are Sunday Funday scoring; the finish is where he ranked at his position across the NFL.' +
      ' Draft-day rosters go back to 2011; season-end rosters (waiver pickups, in-season trades) to 2018.</p>';
    shell(head + box + facts + season + tl + tr + foot);
  }
  /* what the roster tracker has seen this season: the day he was added, for
     how much, who dropped him, where he sits today */
  function seasonHtml(p) {
    var T = window.ROSTER_TRACKER;
    if (!T) return '';
    var m = (p.img || '').match(/\/full\/(\d+)\.png/);
    var pid = m ? +m[1] : null;
    if (!pid) {
      var k = key(p.name);
      Object.keys(T.players || {}).some(function (id) { if (key(T.players[id].name) === k) { pid = +id; return true; } return false; });
    }
    if (!pid) return '';
    var teams = {}; T.teams.forEach(function (t) { teams[t.id] = t; });
    var own = function (tid) { return teams[tid] ? teams[tid].owner : '?'; };
    var holder = null, row = null;
    T.teams.forEach(function (t) { t.roster.forEach(function (r) { if (r.pid === pid) { holder = t; row = r; } }); });
    var hist = (row && row.history) || [];
    if (!hist.length) {
      T.events.forEach(function (e) {
        e.drops.forEach(function (d) { if (d.pid === pid) hist.push({ ts: e.ts, what: 'dropped', team: d.team, week: e.week }); });
        e.adds.forEach(function (a) { if (a.pid === pid) hist.push({ ts: e.ts, what: 'added', team: a.team, bid: e.bid, via: e.kind, week: e.week }); });
        e.trades.forEach(function (tr) { if (tr.pid === pid) hist.push({ ts: e.ts, what: 'traded', from: tr.from, to: tr.to, week: e.week }); });
      });
      hist.sort(function (a, b) { return a.ts - b.ts; });
    }
    var day = function (ts) { return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
    var lines = hist.slice().reverse().map(function (h) {
      if (h.what === 'added') return '<li><span class="pc-dim">' + day(h.ts) + '</span> Added by <b>' + esc(own(h.team)) + '</b>' + (h.bid ? ' for ' + money(h.bid) : '') + (h.via ? ' <span class="pc-dim">' + esc(h.via) + '</span>' : '') + '</li>';
      if (h.what === 'dropped') return '<li><span class="pc-dim">' + day(h.ts) + '</span> Dropped by <b>' + esc(own(h.team)) + '</b></li>';
      return '<li><span class="pc-dim">' + day(h.ts) + '</span> Traded, <b>' + esc(own(h.from)) + '</b> to <b>' + esc(own(h.to)) + '</b></li>';
    });
    if (!lines.length) return '';
    return '<section><div class="pc-label">This season <span class="pc-dim">week ' + T.week + '</span></div>' +
      '<ul class="pc-trades">' + lines.join('') + '</ul></section>';
  }
  function span(years) {
    if (!years.length) return '';
    var out = [], a = years[0], b = years[0];
    for (var i = 1; i <= years.length; i++) {
      if (years[i] === b + 1) { b = years[i]; continue; }
      out.push(a === b ? String(a) : a + '–' + String(b).slice(2));
      a = b = years[i];
    }
    return out.join(', ');
  }

  function open(p, team) {
    if (drafts) { render(p, team); return; }
    shell('<div class="pc-loading">Pulling his history…</div>');
    ensure().then(function () { if (overlay) render(p, team); }, function () {
      if (overlay) overlay.querySelector('.pc-card').insertAdjacentHTML('beforeend',
        '<p class="pc-note">Couldn’t load the history files. Check your connection and try again.</p>');
    });
  }

  window.PlayerCard = { open: open, close: close, _key: key, _ensure: ensure };
})();
