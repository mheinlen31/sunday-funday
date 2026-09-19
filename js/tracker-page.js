/* Roster Tracker — live rosters, every move, and where each contract stands.
   Data: js/tracker.js (window.ROSTER_TRACKER), written by scripts/track_moves.py
   from the league's ESPN feed several times a day. */
(function () {
  'use strict';
  var T = window.ROSTER_TRACKER;
  var main = document.getElementById('rt-main');
  if (!T || !main) return;

  var P = T.players || {};
  var TEAMS = {}; T.teams.forEach(function (t) { TEAMS[t.id] = t; });
  var COLORS = ['#0d5c3f', '#8b1a1a', '#1f4e79', '#7a5c00', '#4b2e83', '#b35c00',
                '#2a6f6f', '#5a3a1a', '#3d5a1a', '#6b2d5c'];
  var INJ = { QUESTIONABLE: 'Q', DOUBTFUL: 'D', OUT: 'OUT', INJURY_RESERVE: 'IR', SUSPENSION: 'SUSP', DAY_TO_DAY: 'DTD' };
  var FAAB = 100;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function money(n) { return n == null ? '—' : '$' + Math.round(n).toLocaleString(); }
  function meta(pid) {
    var m = P[String(pid)] || { name: 'Player #' + pid, pos: '?', nfl: null, img: null };
    // ESPN calls them "Broncos D/ST"; the position chip already says D/ST
    return m.pos === 'D/ST' ? Object.assign({}, m, { name: m.name.replace(/\s*D\/ST$/, '') }) : m;
  }
  function owner(tid) { return TEAMS[tid] ? TEAMS[tid].owner : '?'; }
  function color(tid) { return COLORS[(tid - 1) % COLORS.length]; }
  function day(ts) { return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  function dayFull(ts) { return new Date(ts).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }); }
  function clock(ts) { return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
  function posChip(pos) { return '<span class="pos pos-' + esc(String(pos).replace('/', '')) + '">' + esc(pos) + '</span>'; }
  function mug(pid) {
    var m = meta(pid);
    return m.img ? '<img class="mug" src="' + esc(m.img) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' : '<span class="mug rt-nomug"></span>';
  }

  function S(pid) { var p = P[String(pid)]; return p && p.s ? p.s : null; }
  function fmt1(n) { return n == null ? '\u2014' : (Math.round(n * 10) / 10).toFixed(1); }
  function lineText(pid) {
    var m = meta(pid), s = S(pid), l = s && s.line || {};
    switch (m.pos) {
      case 'QB': return l.py + ' pass yds, ' + l.ptd + ' TD, ' + l.int + ' INT \u00b7 ' + l.ry + ' rush yds, ' + l.rtd + ' TD';
      case 'RB': return l.ra + ' car, ' + l.ry + ' yds, ' + l.rtd + ' TD \u00b7 ' + l.rec + ' rec, ' + l.recy + ' yds, ' + l.rectd + ' TD';
      case 'WR': return l.rec + '/' + l.tgt + ' for ' + l.recy + ' yds, ' + l.rectd + ' TD' + (l.ry ? ' \u00b7 ' + l.ry + ' rush yds' + (l.rtd ? ', ' + l.rtd + ' TD' : '') : '');
      case 'TE': return l.rec + '/' + l.tgt + ' for ' + l.recy + ' yds, ' + l.rectd + ' TD';
      case 'K': return l.fgm + '/' + l.fga + ' FG, ' + l.xpm + ' XP';
      case 'D/ST': return l.sack + ' sacks, ' + l.int + ' INT, ' + l.fr + ' FR, ' + l.td + ' TD, ' + l.pa + ' pts allowed';
    }
    return '';
  }
  var WHERE = {};
  T.teams.forEach(function (t) { t.roster.forEach(function (r) { WHERE[r.pid] = { t: t, r: r }; }); });
  function statHtml(pid) {
    var s = S(pid);
    if (!s) return '<div class="rt-stat none"></div>';
    // rank stays on a phone; the per-game figure is desktop-only (it is in the tooltip)
    var sub = (s.rk ? '<i class="rk">' + esc(meta(pid).pos) + s.rk + '</i>' : '') +
      (s.gp ? '<i class="pg">' + (s.rk ? ' \u00b7 ' : '') + fmt1(s.ppg) + '/g</i>' : '');
    return '<div class="rt-stat" title="' + esc(lineText(pid)) + (s.gp ? ' (' + s.gp + (s.gp === 1 ? ' game' : ' games') + ', ' + fmt1(s.ppg) + ' per game)' : '') + '"><b>' + fmt1(s.pts) + '</b><span>' + sub + '</span></div>';
  }

  /* ---------- state ---------- */
  var LS = 'sf-tracker';
  var st = { view: 'rosters', team: 'all', pos: 'all', scope: 'rostered', ssort: 'pts' };
  try { Object.assign(st, JSON.parse(localStorage.getItem(LS) || '{}')); } catch (e) {}
  function save() { try { localStorage.setItem(LS, JSON.stringify(st)); } catch (e) {} }

  /* ---------- wording ---------- */
  var CLS = {
    'kept-first': 'first keep', 'kept-deal-yr1': '2-yr deal · yr 1', 'kept-yr2': '2-yr deal · yr 2',
    'kept-renewal-yr1': 'renewal · yr 1'
  };
  function howHtml(r, tid) {
    var h = r.how;
    if (!h) return '<span class="rt-how">on roster</span>';
    var s;
    if (h.kind === 'kept') s = 'Kept · ' + money(h.price) + (CLS[h.cls] ? ' <i>' + CLS[h.cls] + '</i>' : '');
    else if (h.kind === 'bought') s = 'Bought · ' + money(h.price) + (h.pick ? ' <i>pick ' + h.pick + '</i>' : '');
    else s = 'Added ' + day(h.ts) + ' · ' + money(h.bid) + ' <i>' + esc(h.via) + '</i>';
    if (h.from && h.from !== tid) s += ' <i>via trade from ' + esc(owner(h.from)) + '</i>';
    if (h.reacquired) s += ' <i>re-acquired ' + day(h.reacquired) + '</i>';
    return '<span class="rt-how">' + s + '</span>';
  }
  function nextHtml(o) {
    if (!o) return '';
    var big, small, cls;
    switch (o.type) {
      case 'locked': big = money(o.price); small = '2027 · locked'; cls = 'lock'; break;
      case 'resign': big = money(o.price); small = '2027 \u00b7 re-sign'; cls = 'resign'; break;
      case 'formula': big = '$' + o.lo + '\u2013' + o.hi; small = '2027 range'; cls = 'formula'; break;
      case 'reAdd': big = '$' + o.lo + '+'; small = '2027 \u00b7 re-add rule'; cls = 'formula'; break;
      case 'market': big = 'market'; small = 'pickup \u00b7 no cap'; cls = 'market'; break;
      default: big = '?'; small = ''; cls = '';
    }
    return '<div class="rt-next ' + cls + '" title="' + esc(o.text) + '"><b>' + big + '</b><span>' + small + '</span></div>';
  }
  function injTag(r) {
    var t = r.ir ? 'IR' : INJ[r.inj];
    return t ? ' <span class="rt-tag' + (r.ir ? ' ir' : '') + '">' + t + '</span>' : '';
  }

  /* ---------- tiles ---------- */
  function tile(label, big, sub) {
    return '<div class="dh-tile"><div class="dh-tile-l">' + label + '</div><div class="dh-tile-b">' + big + '</div><div class="dh-tile-s">' + (sub || '') + '</div></div>';
  }
  function tiles() {
    var s = T.stats || {};
    var dead = 0, deadN = 0, lockedOn = 0;
    T.teams.forEach(function (t) {
      (t.deadMoney || []).forEach(function (d) { dead += d.amount; deadN++; });
      t.roster.forEach(function (r) { if (r.outlook && r.outlook.type === 'locked') lockedOn += r.outlook.price; });
    });
    var bb = s.biggestBid;
    return '<div class="dh-tiles">' +
      tile('Moves', (s.adds + s.drops + s.trades).toLocaleString(), s.adds + ' adds · ' + s.drops + ' drops · ' + s.trades + (s.trades === 1 ? ' trade' : ' trades')) +
      tile('FAAB spent', money(s.faabSpent), 'of ' + money(FAAB * T.teams.length) + ' league-wide') +
      tile('Biggest bid', bb ? money(bb[0]) : '—', bb ? esc(meta(bb[1]).name) + ' · ' + esc(owner(bb[2])) : '') +
      (T.pool && T.pool.length ? tile('Top scorer', esc(meta(T.pool[0]).name), fmt1(S(T.pool[0]).pts) + ' pts \u00b7 ' + (WHERE[T.pool[0]] ? esc(WHERE[T.pool[0]].t.owner) : 'free agent')) : '') +
      tile('Locked for 2027', money(lockedOn + dead), (lockedOn + dead ? 'contract money already on the books' : '')) +
      tile('Dead money', money(dead), deadN ? deadN + (deadN === 1 ? ' dropped contract' : ' dropped contracts') : 'no dropped contracts') +
      '</div>';
  }

  /* ---------- rosters ---------- */
  function teamCard(t) {
    var rec = t.record || {};
    var dead = (t.deadMoney || []).reduce(function (a, d) { return a + d.amount; }, 0);
    var rows = t.roster.map(function (r) {
      var m = meta(r.pid);
      return '<div class="prow static rt-row' + (r.ir ? ' ir' : '') + '" data-pid="' + r.pid + '" title="Tap for his history">' + mug(r.pid) +
        '<div class="pinfo"><div class="pname">' + esc(m.name) + injTag(r) + '</div>' +
        '<div class="psub">' + posChip(m.pos) + (m.nfl ? '<span class="nfl">' + esc(m.nfl) + '</span>' : '') + howHtml(r, t.id) + '</div></div>' +
        statHtml(r.pid) + nextHtml(r.outlook) + '</div>';
    }).join('');
    var deadHtml = (t.deadMoney || []).length ? '<div class="rt-dead"><b>2027 dead money ' + money(dead) + '</b> — ' +
      t.deadMoney.map(function (d) {
        return esc(meta(d.pid).name) + ' ' + money(d.amount) + ' (dropped ' + day(d.droppedOn) + (d.now ? ', now with ' + esc(owner(d.now)) : ', unowned') + ')';
      }).join('; ') + '</div>' : '';
    return '<article class="team-card board-card rt-card" style="--tc:' + color(t.id) + '" id="rt-team-' + t.id + '">' +
      '<header class="team-head static"><div class="team-name">' + esc(t.owner) + ' <span class="rt-team">' + esc(t.name) + '</span></div>' +
      '<div class="team-meta">' +
      (rec.wins != null ? '<span class="stat"><strong>' + rec.wins + '–' + rec.losses + (rec.ties ? '–' + rec.ties : '') + '</strong></span>' : '') +
      (rec.pointsFor != null ? '<span class="stat"><strong>' + fmt1(rec.pointsFor) + '</strong> pts</span>' : '') +
      '<span class="stat">FAAB <strong>' + money(t.faabLeft) + '</strong> left</span>' +
      '<span class="stat">' + t.moves.adds + ' added · ' + t.moves.drops + ' dropped</span></div></header>' +
      '<div class="roster">' + rows + '</div>' + deadHtml + '</article>';
  }
  function rosters() {
    var list = T.teams.filter(function (t) { return st.team === 'all' || String(t.id) === String(st.team); });
    main.className = 'dh-main rt-grid';
    main.innerHTML = tiles() + '<div class="team-grid rt-teams">' + list.map(teamCard).join('') + '</div>';
  }

  /* ---------- moves ---------- */
  function eventHtml(e) {
    var who = '<b>' + esc(owner(e.team)) + '</b>';
    var parts = [];
    if (e.trades.length) {
      var by = {};
      e.trades.forEach(function (tr) { (by[tr.from + '>' + tr.to] = by[tr.from + '>' + tr.to] || []).push(tr.pid); });
      parts.push('Trade: ' + Object.keys(by).map(function (k) {
        var ft = k.split('>');
        return '<b>' + esc(owner(+ft[0])) + '</b> sends ' + by[k].map(function (pid) { return player(pid); }).join(', ') + ' to <b>' + esc(owner(+ft[1])) + '</b>';
      }).join('; '));
    }
    if (e.adds.length) {
      parts.push(who + ' added ' + e.adds.map(function (a) { return player(a.pid); }).join(', ') +
        (e.bid ? ' for <b>' + money(e.bid) + '</b>' : '') + (e.kind === 'waiver' ? ' off waivers' : e.kind === 'free agent' ? ' as a free agent' : ''));
    }
    if (e.drops.length) {
      parts.push((e.adds.length ? 'dropped ' : who + ' dropped ') + e.drops.map(function (d) { return player(d.pid); }).join(', '));
    }
    var rivals = '';
    if (e.rivals && e.rivals.length) {
      var r = e.rivals.slice().sort(function (a, b) { return b.bid - a.bid; });
      rivals = '<div class="rt-rivals">outbid ' + r.map(function (x) { return esc(owner(x.team)) + ' ' + money(x.bid); }).join(', ') + '</div>';
    }
    return '<li class="rt-ev" style="--tc:' + color(e.team) + '"><div class="rt-ev-time">' + clock(e.ts) + '<span>wk ' + e.week + '</span></div>' +
      '<div class="rt-ev-body">' + parts.join(' · ') + rivals + '</div></li>';
  }
  function player(pid) {
    var m = meta(pid);
    return '<span class="rt-pl">' + esc(m.name) + ' <em>' + esc(m.pos) + (m.nfl ? ' · ' + esc(m.nfl) : '') + '</em></span>';
  }
  function moves() {
    var evs = T.events.filter(function (e) {
      if (st.team === 'all') return true;
      var tid = +st.team;
      return e.team === tid || e.adds.some(function (a) { return a.team === tid; }) || e.drops.some(function (d) { return d.team === tid; }) ||
        e.trades.some(function (t) { return t.from === tid || t.to === tid; });
    });
    main.className = 'dh-main rt-moves';
    if (!evs.length) {
      main.innerHTML = tiles() + '<article class="team-card board-card"><div class="empty-note">No moves yet' + (st.team === 'all' ? '' : ' for this team') + '.</div></article>';
      return;
    }
    var days = [], byDay = {};
    evs.forEach(function (e) {
      var k = new Date(e.ts).toDateString();
      if (!byDay[k]) { byDay[k] = []; days.push(k); }
      byDay[k].push(e);
    });
    main.innerHTML = tiles() + '<div class="rt-log">' + days.map(function (k) {
      var list = byDay[k];
      return '<section class="rt-day"><h2>' + dayFull(list[0].ts) + '</h2><ol>' + list.map(eventHtml).join('') + '</ol></section>';
    }).join('') + '</div>';
  }

  /* ---------- stats ---------- */
  var POSES = ['QB', 'RB', 'WR', 'TE', 'K', 'D/ST'];
  function costOf(pid) {
    var w = WHERE[pid];
    if (!w) return { txt: '<span class="rt-fa">free agent</span>', n: 0 };
    var h = w.r.how;
    if (!h) return { txt: '', n: 0 };
    if (h.kind === 'kept') return { txt: 'Kept ' + money(h.price), n: h.price };
    if (h.kind === 'bought') return { txt: 'Bought ' + money(h.price), n: h.price };
    return { txt: 'Added ' + money(h.bid), n: h.bid };
  }
  function chips(id, opts, cur, key) {
    return '<span class="dh-ctl"><span class="dh-ctl-label">' + id + '</span><span class="dh-seg" data-key="' + key + '">' +
      opts.map(function (o) { return '<button class="dh-chip' + (o[0] === cur ? ' on' : '') + '" data-v="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</span></span>';
  }
  function statsView() {
    var wk = T.statsWeek || T.week;
    var rows = (T.pool || []).filter(function (pid) {
      var m = meta(pid);
      if (st.pos !== 'all' && m.pos !== st.pos) return false;
      if (st.scope === 'rostered' && !WHERE[pid]) return false;
      if (st.team !== 'all' && (!WHERE[pid] || String(WHERE[pid].t.id) !== String(st.team))) return false;
      return true;
    });
    rows.sort(function (a, b) {
      var A = S(a), B = S(b);
      if (st.ssort === 'ppg') return B.ppg - A.ppg || B.pts - A.pts;
      if (st.ssort === 'wk') return (B.wk || 0) - (A.wk || 0) || B.pts - A.pts;
      if (st.ssort === 'cost') return costOf(b).n - costOf(a).n || B.pts - A.pts;
      if (st.ssort === 'prev') return (B.prev || 0) - (A.prev || 0);
      return B.pts - A.pts;
    });
    var ctl = '<div class="rt-ctl">' +
      chips('Position', [['all', 'All']].concat(POSES.map(function (p) { return [p, p]; })), st.pos, 'pos') +
      chips('Show', [['rostered', 'Rostered'], ['all', 'Free agents too']], st.scope, 'scope') +
      chips('Sort', [['pts', 'Points'], ['ppg', 'Per game'], ['wk', 'Week ' + wk], ['cost', 'Cost'], ['prev', '2025']], st.ssort, 'ssort') + '</div>';
    var body = rows.slice(0, 400).map(function (pid) {
      var m = meta(pid), s = S(pid), w = WHERE[pid], c = costOf(pid);
      return '<tr data-pid="' + pid + '"><td class="dh-n">' + (s.rk ? esc(m.pos) + s.rk : '') + '</td>' +
        '<td class="dh-name">' + esc(m.name) + (w && w.r.ir ? ' <span class="rt-tag ir">IR</span>' : '') + '<small>' + esc(lineText(pid)) + '</small></td>' +
        '<td class="dh-p">' + posChip(m.pos) + '</td><td class="dh-own hide-m">' + (m.nfl ? esc(m.nfl) : '') + '</td>' +
        '<td class="dh-own">' + (w ? esc(w.t.owner) : '<span class="rt-fa">FA</span>') + '</td>' +
        '<td class="dh-own hide-m">' + c.txt + '</td>' +
        '<td class="dh-pts"><b>' + fmt1(s.pts) + '</b></td><td class="dh-pts">' + (s.gp ? fmt1(s.ppg) : '\u2014') + '</td>' +
        '<td class="dh-pts">' + (s.wk == null ? '\u2014' : fmt1(s.wk)) + '</td><td class="dh-pts hide-m">' + (s.prev == null ? '\u2014' : fmt1(s.prev)) + '</td></tr>';
    }).join('');
    main.className = 'dh-main rt-stats';
    main.innerHTML = tiles() + '<article class="team-card board-card dh-card"><header class="dh-head"><h2>Season stats</h2>' +
      '<span class="dh-sub">Sunday Funday scoring \u00b7 through week ' + wk + ' \u00b7 ' + rows.length + ' players</span></header>' +
      '<div style="padding:8px 14px 0">' + ctl + '</div>' +
      (rows.length ? '<div style="overflow-x:auto"><table class="dh-table"><thead><tr><th class="dh-n">Rank</th><th>Player</th><th class="dh-p"></th><th class="hide-m">NFL</th><th>Owner</th><th class="hide-m">Cost</th>' +
        '<th class="dh-pts">Points</th><th class="dh-pts">Per game</th><th class="dh-pts">Wk ' + wk + '</th><th class="dh-pts hide-m">2025</th></tr></thead><tbody>' + body + '</tbody></table></div>'
        : '<div class="empty-note">Nothing matches.</div>') + '</article>';
    main.querySelectorAll('.rt-ctl .dh-seg').forEach(function (seg) {
      seg.addEventListener('click', function (e) {
        var b = e.target.closest('.dh-chip'); if (!b) return;
        st[seg.dataset.key] = b.dataset.v; save(); render();
      });
    });
  }

  /* ---------- 2027 contracts ---------- */
  function cap() {
    var list = T.teams.filter(function (t) { return st.team === 'all' || String(t.id) === String(st.team); });
    main.className = 'dh-main rt-grid';
    main.innerHTML = tiles() + '<div class="team-grid rt-teams">' + list.map(function (t) {
      var locked = t.roster.filter(function (r) { return r.outlook && r.outlook.type === 'locked'; });
      var resign = t.roster.filter(function (r) { return r.outlook && r.outlook.type === 'resign'; });
      var first = t.roster.filter(function (r) { return r.how && r.how.kind === 'kept' && r.how.cls === 'kept-first'; });
      var pickups = t.roster.filter(function (r) { return r.outlook && (r.outlook.type === 'market' || r.outlook.type === 'reAdd'); });
      var dead = t.deadMoney || [];
      var committed = locked.reduce(function (a, r) { return a + r.outlook.price; }, 0) + dead.reduce(function (a, d) { return a + d.amount; }, 0);
      function line(r, right) {
        var m = meta(r.pid);
        return '<div class="rt-cl"><span class="rt-cl-name">' + esc(m.name) + ' ' + posChip(m.pos) + '</span><span class="rt-cl-val">' + right + '</span></div>';
      }
      function block(title, sub, rows) {
        return rows.length ? '<div class="rt-block"><div class="rt-block-h">' + title + '<span>' + sub + '</span></div>' + rows.join('') + '</div>' : '';
      }
      return '<article class="team-card board-card rt-card" style="--tc:' + color(t.id) + '">' +
        '<header class="team-head static"><div class="team-name">' + esc(t.owner) + ' <span class="rt-team">' + esc(t.name) + '</span></div>' +
        '<div class="team-meta"><span class="stat">already on the 2027 books <strong' + (committed > 100 ? ' class="over"' : '') + '>' + money(committed) + '</strong> of $100</span></div></header>' +
        '<div class="rt-cap">' +
        block('Locked', 'year two of a deal — counts whether he is kept, dropped or traded', locked.map(function (r) { return line(r, money(r.outlook.price)); })) +
        block('Dead money', 'contract players this team let go', dead.map(function (d) {
          return '<div class="rt-cl"><span class="rt-cl-name">' + esc(meta(d.pid).name) + ' <i>dropped ' + day(d.droppedOn) + (d.now ? ', now with ' + esc(owner(d.now)) : '') + '</i></span><span class="rt-cl-val">' + money(d.amount) + '</span></div>';
        })) +
        block('Deal ends after this season', 're-signing means two more years at +$5, +$10', resign.map(function (r) { return line(r, money(r.outlook.price) + ' <i>/ ' + money(r.outlook.price2) + '</i>'); })) +
        block('Kept once', 'keeping him again signs his first two-year deal, priced off the market', first.map(function (r) { return line(r, '$' + r.outlook.lo + '\u2013' + r.outlook.hi + ' <i>vs ' + money(r.how.price) + '</i>'); })) +
        block('Pickups', 'keepable at market value, no contract history', pickups.map(function (r) { return line(r, r.outlook.type === 'reAdd' ? '$' + r.outlook.lo + '+' : 'market'); })) +
        (locked.length + dead.length + resign.length + first.length + pickups.length ? '' : '<div class="empty-note">Everyone here was bought at the auction — all first-time keepers in 2027, priced off the market.</div>') +
        '</div></article>';
    }).join('') + '</div>';
  }

  /* ---------- chrome ---------- */
  function buildTeamPicker() {
    var sel = $('rt-team');
    sel.innerHTML = '<option value="all">Everyone</option>' + T.teams.map(function (t) {
      return '<option value="' + t.id + '">' + esc(t.owner) + ' — ' + esc(t.name) + '</option>';
    }).join('');
    sel.value = st.team;
    sel.addEventListener('change', function () { st.team = sel.value; save(); render(); });
  }
  function buildViews() {
    [].forEach.call(document.querySelectorAll('#rt-views .dh-view'), function (b) {
      b.classList.toggle('on', b.dataset.view === st.view);
      b.onclick = function () { st.view = b.dataset.view; save(); render(); };
    });
  }
  function header() {
    var el = $('rt-updated');
    var when = T.generated ? new Date(T.generated) : null;
    el.innerHTML = 'Live from ESPN · week ' + T.week + (when ? ' · last change ' + when.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '') +
      ((T.warnings || []).length ? ' · <span class="stale">' + T.warnings.length + ' item' + (T.warnings.length > 1 ? 's' : '') + ' to check</span>' : '');
  }
  function note() {
    var n = ['<h3>How to read this</h3><ul>'];
    n.push('<li><b>Rosters</b> are today’s, straight from ESPN. Under each player: how he got here (kept or bought at the draft, or the day and bid he was added) and, on the right, what he would cost to keep for <b>2027</b>.</li>');
    n.push('<li><span class="rt-next lock inline"><b>$34</b></span> <b>Locked</b> — year two of a two-year deal. The price is set and counts against the $100 keeper cap whether he is kept, dropped or traded (a trade carries it to the new team; a drop leaves it with the team that signed him — that is <b>dead money</b>).</li>');
    n.push('<li><span class="rt-next resign inline"><b>$24</b></span> <b>Re-sign</b> — his deal ends after this season. Keeping him again is a new two-year deal at last price + $5, then + $10.</li>');
    n.push('<li><span class="rt-next formula inline"><b>$35\u201379</b></span> <b>Range</b> \u2014 no contract yet, so the 2027 price is set next summer: the average of this year\u2019s cost and his ESPN value then, or cost + $10 if the market jumps by more than $10. Nothing today can say where in the range he lands \u2014 that is his season \u2014 but he cannot cost less than half this year\u2019s price or more than $10 above it. A player kept once who is kept again signs his first two-year deal on that number.</li>');
    n.push('<li><span class="rt-next market inline"><b>market</b></span> <b>Pickup</b> \u2014 added off waivers or as a free agent. Keepable at whatever his ESPN market value is next summer; there is no cap and no contract history. One exception from the Manifesto: your own drafted player, dropped and re-added within a week with nobody else touching him, costs the <em>greater</em> of the auction math and market.</li>');
    n.push('<li><b>Moves</b> lists every executed add, drop, waiver claim and trade with the winning bid — and who was outbid. Lineup changes are not moves. Offseason trades live on the <a href="trades.html">Trades</a> page.</li>');
    n.push('<li><b>Stats</b> are season-to-date in Sunday Funday scoring, straight from ESPN. The rank is where he sits among every NFL player at his position; per game counts only games he played; the 2025 column is last season\u2019s total. Free agents can be shown alongside rostered players.</li>');
    n.push('<li>Players on <b>IR</b> can still be kept. FAAB is the $100 free-agent budget; it resets every season.</li>');
    if ((T.warnings || []).length) n.push('<li><b>To check:</b> ' + T.warnings.map(esc).join(' · ') + '</li>');
    n.push('</ul>');
    $('rt-note').innerHTML = n.join('');
  }

  function render() {
    buildViews();
    if (st.view === 'moves') moves(); else if (st.view === 'cap') cap(); else if (st.view === 'stats') statsView(); else rosters();
  }

  // tap a player for his card. The card wants the keeper-sheet record when
  // there is one (matched on ESPN id, or by name for a D/ST); a pickup who was
  // never on the sheet gets the tracker's own name, position and headshot.
  main.addEventListener('click', function (e) {
    var row = e.target.closest('.rt-row, tr[data-pid]');
    if (!row || !window.PlayerCard) return;
    var pid = +row.dataset.pid, m = meta(pid), L = window.LEAGUE_DATA, found = null;
    (L ? L.teams : []).forEach(function (t) {
      t.players.forEach(function (p) {
        if (found) return;
        var im = (p.img || '').match(/\/full\/(\d+)\.png/);
        if ((im && +im[1] === pid) || (!im && p.pos === 'D/ST' && p.name === m.name)) found = p;
      });
    });
    window.PlayerCard.open(found || { name: m.name, pos: m.pos, nfl: m.nfl, img: m.img }, null);
  });
  header(); note(); buildTeamPicker(); render();
})();
