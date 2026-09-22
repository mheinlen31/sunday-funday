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
    var tip = lineText(pid) + (s.gp ? ' (' + s.gp + (s.gp === 1 ? ' game' : ' games') + ', ' + fmt1(s.ppg) + ' per game)' : '') +
      (s.worth != null ? '. Worth so far ' + money(s.worth) + ' \u2014 what production like this went for at the auction' : '');
    return '<div class="rt-stat" title="' + esc(tip) + '"><b>' + fmt1(s.pts) + '</b><span>' + sub + '</span></div>';
  }

  /* ---------- state ---------- */
  var LS = 'sf-tracker';
  var st = { view: 'rosters', team: 'all', pos: 'all', scope: 'rostered', ssort: 'pts', open: {}, me: null };
  try { Object.assign(st, JSON.parse(localStorage.getItem(LS) || '{}')); } catch (e) {}
  if (!st.open || typeof st.open !== 'object') st.open = {};
  var hashView = (location.hash || '').replace('#', '');
  if (hashView === 'standings') hashView = 'summary';
  if (['rosters', 'summary', 'moves', 'stats', 'value', 'cap'].indexOf(hashView) >= 0) st.view = hashView;
  function save() { try { localStorage.setItem(LS, JSON.stringify(st)); } catch (e) {} }
  // cards start open on a desktop and closed on a phone, except the team you starred
  function isOpen(tid) { return st.open[tid] != null ? st.open[tid] : (window.innerWidth > 720 || String(tid) === String(st.me)); }
  // "new since your last visit": remember when you were last here, stamped as you leave
  // a reload inside one visit keeps the same "last visit" (session storage
  // holds the visit's start); leaving the page stamps the new one
  var SEEN = 0;
  try {
    SEEN = +sessionStorage.getItem('sf-tracker-visit') || 0;
    if (!SEEN) { SEEN = +localStorage.getItem('sf-tracker-seen') || 0; sessionStorage.setItem('sf-tracker-visit', String(SEEN || -1)); }
    if (SEEN < 0) SEEN = 0;
  } catch (e) {}
  function markSeen() { try { localStorage.setItem('sf-tracker-seen', String(Date.now())); } catch (e) {} }
  window.addEventListener('pagehide', markSeen);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') markSeen(); });
  setTimeout(markSeen, 90000);

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
  function payoutTile() {
    if (!T.payouts || !(T.matchups || []).length) return '';
    var ty = moneyTally(), lead = ty.today[0];
    return tile('Payout race', lead ? esc(lead.t.owner) : '—', (lead ? money(lead.total) + ' if it ended today · ' : '') + money(ty.bankedTotal) + ' banked');
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
      payoutTile() + '</div>';
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
    var mine = String(t.id) === String(st.me);
    return '<article class="team-card board-card rt-card' + (isOpen(t.id) ? '' : ' collapsed') + (mine ? ' mine' : '') + '" style="--tc:' + color(t.id) + '" id="rt-team-' + t.id + '" data-tid="' + t.id + '">' +
      '<header class="team-head rt-head" title="Tap to open or close"><div class="team-name"><span class="rt-caret">\u25be</span>' + esc(t.owner) + ' <span class="rt-team">' + esc(t.name) + '</span>' +
      '<button class="rt-star' + (mine ? ' on' : '') + '" type="button" title="' + (mine ? 'Your team' : 'Make this my team') + '">' + (mine ? '\u2605' : '\u2606') + '</button></div>' +
      '<div class="team-meta">' +
      (rec.wins != null ? '<span class="stat"><strong>' + rec.wins + '–' + rec.losses + (rec.ties ? '–' + rec.ties : '') + '</strong></span>' : '') +
      (rec.pointsFor != null ? '<span class="stat"><strong>' + fmt1(rec.pointsFor) + '</strong> pts</span>' : '') +
      '<span class="stat">FAAB <strong>' + money(t.faabLeft) + '</strong> left</span>' +
      '<span class="stat">' + t.moves.adds + ' added · ' + t.moves.drops + ' dropped</span></div></header>' +
      '<div class="roster">' + rows + '</div>' + deadHtml + '</article>';
  }
  function rosters() {
    var list = T.teams.filter(function (t) { return st.team === 'all' || String(t.id) === String(st.team); });
    if (st.me) list.sort(function (a, b) { return (String(b.id) === String(st.me)) - (String(a.id) === String(st.me)); });
    main.className = 'dh-main rt-grid';
    main.innerHTML = tiles() + troubleCard() + '<div class="team-grid rt-teams">' + list.map(teamCard).join('') + '</div>';
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
    var fresh = SEEN && e.ts > SEEN;
    return '<li class="rt-ev' + (fresh ? ' fresh' : '') + '" style="--tc:' + color(e.team) + '"><div class="rt-ev-time">' + clock(e.ts) + (fresh ? '<em class="rt-newtag">new</em>' : '') + '<span>wk ' + e.week + '</span></div>' +
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
    var fresh = SEEN ? evs.filter(function (e) { return e.ts > SEEN; }).length : 0;
    var banner = fresh ? '<div class="rt-banner">' + fresh + (fresh === 1 ? ' move' : ' moves') + ' since your last visit (' + new Date(SEEN).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ')</div>' : '';
    main.innerHTML = tiles() + banner + '<div class="rt-log">' + days.map(function (k) {
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
  function lastWk(s) { var R = T.reviewWeek; return R && s.w && s.w[R - 1] != null ? s.w[R - 1] : 0; }
  function goingRates() {
    var by = {};
    (T.events || []).forEach(function (e) {
      if (e.kind !== 'waiver' || !e.bid) return;
      e.adds.forEach(function (a) {
        var pos = meta(a.pid).pos, g = by[pos] = by[pos] || { n: 0, sum: 0, max: 0, who: null };
        g.n++; g.sum += e.bid;
        if (e.bid > g.max) { g.max = e.bid; g.who = meta(a.pid).name; }
      });
    });
    var parts = POSES.filter(function (p) { return by[p]; }).map(function (p) {
      var g = by[p];
      return '<b>' + esc(p) + '</b> ' + g.n + (g.n === 1 ? ' claim' : ' claims') + ', avg $' + Math.round(g.sum / g.n) + ', high $' + g.max + ' (' + esc(g.who) + ')';
    });
    return parts.length ? '<div class="rt-rates"><span class="dh-ctl-label">Going rate</span> ' + parts.join(' \u00b7 ') + '</div>' : '';
  }
  function statsView() {
    var wk = T.statsWeek || T.week;
    var rows = (T.pool || []).filter(function (pid) {
      var m = meta(pid);
      if (st.pos !== 'all' && m.pos !== st.pos) return false;
      if (st.scope === 'rostered' && !WHERE[pid]) return false;
      if (st.scope === 'fa' && WHERE[pid]) return false;
      if (st.team !== 'all' && (!WHERE[pid] || String(WHERE[pid].t.id) !== String(st.team))) return false;
      return true;
    });
    rows.sort(function (a, b) {
      var A = S(a), B = S(b);
      if (st.ssort === 'ppg') return B.ppg - A.ppg || B.pts - A.pts;
      if (st.ssort === 'wk') return (B.wk || 0) - (A.wk || 0) || B.pts - A.pts;
      if (st.ssort === 'last') return lastWk(B) - lastWk(A) || B.pts - A.pts;
      if (st.ssort === 'cost') return costOf(b).n - costOf(a).n || B.pts - A.pts;
      if (st.ssort === 'prev') return (B.prev || 0) - (A.prev || 0);
      if (st.ssort === 'val') return (B.val == null ? -999 : B.val) - (A.val == null ? -999 : A.val) || B.pts - A.pts;
      return B.pts - A.pts;
    });
    var sorts = [['pts', 'Points'], ['ppg', 'Per game']];
    if (T.reviewWeek && T.reviewWeek !== wk) sorts.push(['last', 'Week ' + T.reviewWeek]);
    sorts.push(['wk', 'Week ' + wk], ['cost', 'Cost'], ['val', 'Value'], ['prev', '2025']);
    var preset = st.pos === 'all' && st.scope === 'fa' && st.ssort === (T.reviewWeek && T.reviewWeek !== wk ? 'last' : 'wk');
    var ctl = '<div class="rt-ctl">' +
      '<span class="dh-ctl"><span class="dh-seg" data-key="preset"><button class="dh-chip' + (preset ? ' on' : '') + '" data-v="waivers">Waiver wire</button></span></span>' +
      chips('Position', [['all', 'All']].concat(POSES.map(function (p) { return [p, p]; })), st.pos, 'pos') +
      chips('Show', [['rostered', 'Rostered'], ['all', 'Everyone'], ['fa', 'Free agents only']], st.scope, 'scope') +
      chips('Sort', sorts, st.ssort, 'ssort') + '</div>' + (st.scope === 'fa' ? goingRates() : '');
    var body = rows.slice(0, 400).map(function (pid) {
      var m = meta(pid), s = S(pid), w = WHERE[pid], c = costOf(pid);
      return '<tr data-pid="' + pid + '"><td class="dh-n">' + (s.rk ? esc(m.pos) + s.rk : '') + '</td>' +
        '<td class="dh-name">' + esc(m.name) + (w && w.r.ir ? ' <span class="rt-tag ir">IR</span>' : '') + '<small>' + esc(lineText(pid)) + '</small></td>' +
        '<td class="dh-p">' + posChip(m.pos) + '</td><td class="dh-own hide-m">' + (m.nfl ? esc(m.nfl) : '') + '</td>' +
        '<td class="dh-own">' + (w ? esc(w.t.owner) : '<span class="rt-fa">FA</span>') + '</td>' +
        '<td class="dh-own hide-m">' + c.txt + '</td>' +
        '<td class="dh-pts"><b>' + fmt1(s.pts) + '</b></td><td class="dh-pts">' + (s.gp ? fmt1(s.ppg) : '\u2014') + '</td>' +
        '<td class="dh-pts">' + (st.ssort === 'last' ? fmt1(lastWk(s)) : (s.wk == null ? '\u2014' : fmt1(s.wk))) + '</td><td class="dh-pts hide-m">' + (s.prev == null ? '\u2014' : fmt1(s.prev)) + '</td>' +
        '<td class="dh-cash hide-m">' + (s.worth != null ? money(s.worth) : '\u2014') + '</td><td class="dh-vc hide-m">' + valChip(s.val) + '</td></tr>';
    }).join('');
    main.className = 'dh-main rt-stats';
    main.innerHTML = tiles() + '<article class="team-card board-card dh-card"><header class="dh-head"><h2>Season stats</h2>' +
      '<span class="dh-sub">Sunday Funday scoring \u00b7 through week ' + wk + ' \u00b7 ' + rows.length + ' players</span></header>' +
      '<div style="padding:8px 14px 0">' + ctl + '</div>' +
      (rows.length ? '<div style="overflow-x:auto"><table class="dh-table"><thead><tr><th class="dh-n">Rank</th><th>Player</th><th class="dh-p"></th><th class="hide-m">NFL</th><th>Owner</th><th class="hide-m">Cost</th>' +
        '<th class="dh-pts">Points</th><th class="dh-pts">Per game</th><th class="dh-pts">Wk ' + (st.ssort === 'last' ? T.reviewWeek : wk) + '</th><th class="dh-pts hide-m">2025</th>' +
        '<th class="dh-cash hide-m" title="What production like his went for at this year\u2019s auction">Worth</th><th class="dh-vc hide-m" title="Worth so far, less what was paid">\u00b1</th></tr></thead><tbody>' + body + '</tbody></table></div>'
        : '<div class="empty-note">Nothing matches.</div>') + '</article>';
    main.querySelectorAll('.rt-ctl .dh-seg').forEach(function (seg) {
      seg.addEventListener('click', function (e) {
        var b = e.target.closest('.dh-chip'); if (!b) return;
        if (seg.dataset.key === 'preset') { st.pos = 'all'; st.scope = 'fa'; st.ssort = (T.reviewWeek && T.reviewWeek !== wk) ? 'last' : 'wk'; }
        else st[seg.dataset.key] = b.dataset.v;
        save(); render();
      });
    });
  }

  /* ---------- shared bits for the review, the arrows and the copy buttons ---------- */
  function trend(d, dollars) {
    if (d == null || d === 0) return '';
    return ' <span class="rt-trend ' + (d > 0 ? 'up' : 'down') + '" title="vs last week">' + (d > 0 ? '\u25b2' : '\u25bc') + (dollars ? '$' : '') + Math.abs(d) + '</span>';
  }
  function keepCostText(r) {
    var o = r.outlook || {};
    if (o.type === 'locked') return '$' + r.keep.cost + ' locked';
    if (o.type === 'resign') return '$' + r.keep.cost + ' re-sign';
    return 'at most $' + r.keep.cost;
  }
  main.addEventListener('click', function (e) {
    var b = e.target.closest('.rt-copy');
    if (!b) return;
    var box = b.closest('article').querySelector('.rt-notebox'), txt = box.textContent;
    var done = function () { b.textContent = 'Copied \u2713'; setTimeout(function () { b.textContent = 'Copy'; }, 1600); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () { b.textContent = 'Select and copy'; });
    else { var r = document.createRange(); r.selectNodeContents(box); var sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); b.textContent = 'Selected \u2014 press copy'; }
  });

  /* ---------- lineup trouble: byes and injuries on current rosters ---------- */
  function troubleCard() {
    var wk = T.current || T.week, byes = T.byes || {}, items = [];
    T.teams.forEach(function (t) {
      if (st.team !== 'all' && String(t.id) !== String(st.team)) return;
      var bye = [], out = [], ir = [];
      t.roster.forEach(function (r) {
        var m = P[String(r.pid)] || {};
        if (r.ir) { ir.push(m.name); return; }
        if (m.pro && byes[m.pro] === wk) bye.push(m.name);
        if (/OUT|DOUBTFUL|SUSPENSION/.test(r.inj || '')) out.push(m.name + ' (' + (INJ[r.inj] || r.inj) + ')');
      });
      if (bye.length || out.length) {
        items.push('<li><b>' + esc(t.owner) + '</b> ' + [bye.length ? 'Bye: ' + esc(bye.join(', ')) : '', out.length ? 'Out: ' + esc(out.join(', ')) : ''].filter(Boolean).join(' \u00b7 ') +
          (ir.length ? ' <span class="pc-dim">IR: ' + esc(ir.join(', ')) + '</span>' : '') + '</li>');
      }
    });
    if (!items.length) return '';
    return '<article class="team-card board-card dh-card rt-trouble"><header class="dh-head"><h2>Lineup trouble \u00b7 week ' + wk + '</h2>' +
      '<span class="dh-sub">byes and injuries on current rosters</span></header><ul class="rt-trouble-list">' + items.join('') + '</ul></article>';
  }

  /* ---------- value: the auction scoreboard and the keeper watch ---------- */
  function valChip(v) {
    if (v == null) return '';
    var cls = v > 5 ? 'up' : (v < -5 ? 'down' : 'even');
    return '<span class="dh-val ' + cls + '">' + (v > 0 ? '+' : v < 0 ? '\u2212' : '') + '$' + Math.abs(v) + '</span>';
  }
  function keepCost(r, low) {
    var o = r.outlook || {};
    if (o.type === 'locked') return money(r.keep.cost) + ' <i>locked</i>';
    if (o.type === 'resign') return money(r.keep.cost) + ' <i>re-sign</i>';
    return low ? '\u2265 ' + money(r.keep.floor) + ' <i>floor</i>' : '\u2264 ' + money(r.keep.cost) + ' <i>ceiling</i>';
  }
  function valueView() {
    var sb = T.scoreboard || [];
    var one = st.team !== 'all';
    var board = '<article class="team-card board-card dh-card"><header class="dh-head"><h2>Auction scoreboard</h2>' +
      '<span class="dh-sub">what each roster\u2019s production would have cost at this year\u2019s auction, against the money committed on draft day</span></header>' +
      '<div style="overflow-x:auto"><table class="dh-table"><thead><tr><th>Team</th><th class="dh-cash">Paid</th><th class="dh-cash">Worth so far</th><th class="dh-vc">\u00b1</th>' +
      '<th class="dh-vc hide-m">Keepers</th><th class="dh-vc hide-m">Bought</th><th class="hide-m">Best buy</th><th class="hide-m">Worst buy</th></tr></thead><tbody>' +
      sb.map(function (r, i) {
        var t = TEAMS[r.team];
        return '<tr' + ((one && String(r.team) === String(st.team)) || String(r.team) === String(st.me) ? ' style="background:#f4f8f5"' : '') + '><td class="dh-name">' + (i + 1) + '. ' + esc(t.owner) + ' <span class="dh-team">' + esc(t.name) + '</span>' + trend(r.dRank, false) + '</td>' +
          '<td class="dh-cash">' + money(r.paid) + '</td><td class="dh-cash">' + money(r.worth) + '</td><td class="dh-vc">' + valChip(r.surplus) + trend(r.dSurplus, true) + '</td>' +
          '<td class="dh-vc hide-m">' + valChip(r.keeperSurplus) + '</td><td class="dh-vc hide-m">' + valChip(r.auctionSurplus) + '</td>' +
          '<td class="dh-best hide-m">' + esc(meta(r.best.pid).name) + ' ' + valChip(r.best.val) + '</td><td class="dh-best hide-m">' + esc(meta(r.worst.pid).name) + ' ' + valChip(r.worst.val) + '</td></tr>';
      }).join('') + '</tbody></table></div></article>';

    var watch = [];
    T.teams.forEach(function (t) {
      if (one && String(t.id) !== String(st.team)) return;
      t.roster.forEach(function (r) { if (r.keep) watch.push({ t: t, r: r }); });
    });
    watch.sort(function (a, b) { return b.r.keep.edge - a.r.keep.edge; });
    function watchRows(list, low) {
      return list.map(function (x) {
        var m = meta(x.r.pid), s = S(x.r.pid) || {};
        return '<tr data-pid="' + x.r.pid + '"><td class="dh-name">' + esc(m.name) + '<small>' + esc(m.pos) + (m.nfl ? ' \u00b7 ' + esc(m.nfl) : '') + (x.r.how ? ' \u00b7 ' + (x.r.how.kind === 'kept' ? 'kept ' : 'bought ') + money(x.r.how.price) : '') + '</small></td>' +
          '<td class="dh-own">' + esc(x.t.owner) + '</td><td class="dh-pts">' + fmt1(s.pts) + '<small>' + (s.lrk ? esc(m.pos) + s.lrk + ' in the league' : '') + '</small></td>' +
          '<td class="dh-cash">' + money(s.worth) + '</td><td class="dh-cash">' + keepCost(x.r, low) + '</td><td class="dh-vc">' + valChip(low ? x.r.keep.edgeLo : x.r.keep.edge) +
          (low ? '' : trend(x.r.keep.dEdge, true) + (x.r.keep.new && T.prevWeek ? ' <span class="rt-new">new</span>' : '')) + '</td></tr>';
      }).join('');
    }
    var head = '<thead><tr><th>Player</th><th>Owner</th><th class="dh-pts">Points</th><th class="dh-cash">Worth so far</th><th class="dh-cash">2027 cost</th><th class="dh-vc">Edge</th></tr></thead>';
    var up = watch.filter(function (x) { return x.r.keep.edge > 0; }).slice(0, one ? 8 : 15);
    var down = watch.filter(function (x) { return x.r.keep.edgeLo < 0; }).sort(function (a, b) { return a.r.keep.edgeLo - b.r.keep.edgeLo; }).slice(0, one ? 5 : 8);
    var kw = '<article class="team-card board-card dh-card"><header class="dh-head"><h2>Keeper watch</h2>' +
      '<span class="dh-sub">worth so far against the most he can cost to keep in 2027</span></header>' +
      (up.length ? '<div class="rt-block-h" style="padding:10px 14px 0">Tracking as bargains<span>worth more than the most he could cost to keep</span></div><div style="overflow-x:auto"><table class="dh-table rt-watch">' + head + '<tbody>' + watchRows(up, false) + '</tbody></table></div>' : '<div class="empty-note">Nobody is ahead of his 2027 price yet.</div>') +
      (down.length ? '<div class="rt-block-h" style="padding:14px 14px 0">Not even at his floor<span>worth less than the least he could cost to keep</span></div><div style="overflow-x:auto"><table class="dh-table rt-watch">' + head + '<tbody>' + watchRows(down, true) + '</tbody></table></div>' : '') +
      '</article>';
    var how = '<p class="dh-note" style="max-width:900px;margin:0 auto">Inside each position the league\u2019s own auction prices are the ladder: the RB whose production ranks 7th among the league\u2019s RBs so far was <b>worth</b> what the 7th-priciest RB cost on draft day. The scoreboard adds up what each team\u2019s current roster would have cost that way and subtracts what it committed on draft day \u2014 a dropped bust keeps his cost and loses his worth, a pickup adds worth for no auction money. Keeper watch compares worth so far with the most a player can cost to keep in 2027 (his range ceiling, a locked price, or the re-sign price); pickups have no ceiling and are left out. ' +
      (T.statsWeek && T.statsWeek < 5 ? '<b>Week ' + T.statsWeek + ' is a small sample</b> \u2014 this firms up as the season goes.' : 'Through week ' + T.statsWeek + '.') + '</p>';
    main.className = 'dh-main rt-value';
    main.innerHTML = tiles() + board + kw + how;
  }

  /* ---------- standings: the table, the money, the weeks ---------- */
  function regular(m) { return !m.playoff && (!T.payouts || !T.payouts.regularWeeks || m.week <= T.payouts.regularWeeks); }
  function decided(m) { return m.winner && m.winner !== 'UNDECIDED'; }
  function h2h() {
    var R = {};
    T.teams.forEach(function (t) { R[t.id] = {}; });
    (T.matchups || []).filter(function (m) { return regular(m) && decided(m); }).forEach(function (m) {
      function add(a, b, pa, pb) {
        var r = R[a][b] = R[a][b] || { w: 0, l: 0, t: 0, pf: 0, pa: 0, games: [] };
        r.pf += pa; r.pa += pb; r.games.push([m.week, pa, pb]);
        if (pa > pb) r.w++; else if (pa < pb) r.l++; else r.t++;
      }
      add(m.home, m.away, m.hp, m.ap); add(m.away, m.home, m.ap, m.hp);
    });
    return R;
  }
  /* Manifesto order: record, total points, head-to-head record, head-to-head points */
  function standingsOrder(R) {
    var list = T.teams.map(function (t) {
      var r = t.record || {};
      return { t: t, w: r.wins || 0, l: r.losses || 0, ti: r.ties || 0, pf: r.pointsFor || 0, pa: r.pointsAgainst || 0, streak: (r.streakType === 'WIN' ? 'W' : r.streakType === 'LOSS' ? 'L' : '') + (r.streakLength || '') };
    });
    list.sort(function (a, b) {
      var ga = a.w + a.l + a.ti, gb = b.w + b.l + b.ti;
      var pa = ga ? (a.w + a.ti / 2) / ga : 0, pb = gb ? (b.w + b.ti / 2) / gb : 0;
      if (pb !== pa) return pb - pa;
      if (b.pf !== a.pf) return b.pf - a.pf;
      var ab = R[a.t.id][b.t.id], ba = R[b.t.id][a.t.id];
      if (ab && ba) { if (ab.w !== ba.w) return ba.w - ab.w; if (ab.pf !== ba.pf) return ba.pf - ab.pf; }
      return 0;
    });
    return list;
  }
  function weeks() {
    var by = {};
    (T.matchups || []).filter(regular).forEach(function (m) {
      var arr = by[m.week] = by[m.week] || { ms: [], scores: [] };
      arr.ms.push(m); arr.scores.push({ team: m.home, pts: m.hp }, { team: m.away, pts: m.ap });
    });
    return Object.keys(by).map(Number).sort(function (a, b) { return a - b; }).map(function (wk) {
      var w = by[wk], sc = w.scores.slice().sort(function (a, b) { return b.pts - a.pts; });
      var done = w.ms.every(decided), live = !done && sc.some(function (x) { return x.pts > 0; });
      return { week: wk, ms: w.ms, done: done, live: live, top: sc[0], second: sc[1], tie: sc.length > 1 && sc[0].pts === sc[1].pts && sc[0].pts > 0 };
    });
  }
  function payoutRace() {
    var PAY = T.payouts || {}, weekly = PAY.weekly || 15, R = h2h(), order = standingsOrder(R), W = weeks();
    var banked = {}, inPlay = {};
    T.teams.forEach(function (t) { banked[t.id] = { weeks: [], amt: 0 }; inPlay[t.id] = []; });
    W.forEach(function (w) { if (w.done && w.top && w.top.pts > 0 && !w.tie) { banked[w.top.team].weeks.push(w.week); banked[w.top.team].amt += weekly; } });
    var reg = PAY.regular || [425, 225], seeds = PAY.seeds || { '3': 80, '4': 40 }, pr = PAY.pointsRace || [410, 250, 100];
    if (order[0]) inPlay[order[0].t.id].push(['1st place', reg[0]]);
    if (order[1]) inPlay[order[1].t.id].push(['2nd place', reg[1]]);
    if (order[2]) inPlay[order[2].t.id].push(['3 seed', seeds['3']]);
    if (order[3]) inPlay[order[3].t.id].push(['4 seed', seeds['4']]);
    var byPts = order.slice().sort(function (a, b) { return b.pf - a.pf; });
    ['Top scorer', '2nd most points', '3rd most points'].forEach(function (lab, i) { if (byPts[i]) inPlay[byPts[i].t.id].push([lab, pr[i]]); });
    return { PAY: PAY, weekly: weekly, R: R, order: order, W: W, banked: banked, inPlay: inPlay, byPts: byPts };
  }
  /* ---------- season summary: the whole season on one page, and a card to share ---------- */
  function shortName(name) {
    var parts = String(name).split(' ');
    return parts.length > 1 && /^[A-Z][a-z]*\.?$/.test(parts[0]) ? parts.slice(1).join(' ') : name;
  }
  function moneyTally(M) {
    M = M || payoutRace();
    var banked = T.teams.map(function (t) { return { t: t, amt: M.banked[t.id].amt, weeks: M.banked[t.id].weeks }; })
      .filter(function (x) { return x.amt > 0; }).sort(function (a, b) { return b.amt - a.amt || a.weeks[0] - b.weeks[0]; });
    var today = T.teams.map(function (t) {
      var ip = M.inPlay[t.id].reduce(function (a, x) { return a + x[1]; }, 0);
      return { t: t, total: M.banked[t.id].amt + ip, banked: M.banked[t.id].amt, ip: ip, items: M.inPlay[t.id] };
    }).filter(function (x) { return x.total > 0; }).sort(function (a, b) { return b.total - a.total; });
    return { banked: banked, bankedTotal: banked.reduce(function (a, x) { return a + x.amt; }, 0), today: today };
  }
  function lastWeek(M) {
    var W = T.reviewWeek;
    if (!W) return null;
    var ms = (T.matchups || []).filter(function (m) { return m.week === W && decided(m); });
    var games = ms.map(function (m) {
      var hw = m.winner === 'HOME';
      return { w: hw ? m.home : m.away, wp: hw ? m.hp : m.ap, l: hw ? m.away : m.home, lp: hw ? m.ap : m.hp };
    });
    var scores = ms.map(function (m) { return [m.home, m.hp]; }).concat(ms.map(function (m) { return [m.away, m.ap]; })).sort(function (a, b) { return b[1] - a[1]; });
    var closest = games.slice().sort(function (a, b) { return (a.wp - a.lp) - (b.wp - b.lp); })[0];
    var wkTop = (T.pool || []).filter(function (pid) { var s = S(pid); return WHERE[pid] && s.w && s.w[W - 1] != null; })
      .sort(function (a, b) { return S(b).w[W - 1] - S(a).w[W - 1]; }).slice(0, 5);
    var evs = T.events.filter(function (e) { return e.week === W; }), adds = 0, drops = 0, trades = 0;
    evs.forEach(function (e) { adds += e.adds.length; drops += e.drops.length; if (e.trades.length) trades++; });
    var big = evs.filter(function (e) { return e.adds.length && e.bid; }).sort(function (a, b) { return b.bid - a.bid; })[0];
    return { W: W, games: games, scores: scores, hi: scores[0], lo: scores[scores.length - 1], closest: closest, wkTop: wkTop, adds: adds, drops: drops, trades: trades, big: big };
  }
  function keeperTop(n) {
    var watch = [];
    T.teams.forEach(function (t) { t.roster.forEach(function (r) { if (r.keep && r.keep.edge > 0) watch.push({ t: t, r: r }); }); });
    return watch.sort(function (a, b) { return b.r.keep.edge - a.r.keep.edge; }).slice(0, n);
  }
  function seasonTop(n) { return (T.pool || []).filter(function (pid) { return WHERE[pid]; }).slice(0, n); }
  function card(title, sub, body, extraHead) {
    return '<article class="team-card board-card dh-card"><header class="dh-head"><h2>' + title + '</h2>' + (sub ? '<span class="dh-sub">' + sub + '</span>' : '') + (extraHead || '') + '</header>' + body + '</article>';
  }

  function resultsCard(L, PAY) {
    var rows = L.games.map(function (g) {
      return '<li><span class="rv-w">' + esc(owner(g.w)) + '</span><span class="rv-def">def.</span><span class="rv-l">' + esc(owner(g.l)) + '</span>' +
        '<b>' + fmt1(g.wp) + '–' + fmt1(g.lp) + '</b><i>by ' + fmt1(g.wp - g.lp) + '</i></li>';
    }).join('');
    var line = L.hi ? '<p class="sm-line"><b>High</b> ' + esc(owner(L.hi[0])) + ' ' + fmt1(L.hi[1]) + ' <span class="dh-yr">wins the $' + (PAY.weekly || 15) + '</span> · <b>Low</b> ' + esc(owner(L.lo[0])) + ' ' + fmt1(L.lo[1]) +
      (L.closest ? ' · <b>Closest</b> ' + esc(owner(L.closest.w)) + ' by ' + fmt1(L.closest.wp - L.closest.lp) : '') + '</p>' : '';
    return card('Week ' + L.W + ' results', 'the last week in the books', '<ul class="rv-results">' + rows + '</ul>' + line);
  }
  function standingsCard(M) {
    var PAY = M.PAY, cut = PAY.playoffTeams || 6, byes = PAY.byes || 2, ptsRank = {};
    M.byPts.forEach(function (x, i) { ptsRank[x.t.id] = i + 1; });
    var body = '<div style="overflow-x:auto"><table class="dh-table rt-standings"><thead><tr><th class="dh-n">#</th><th>Team</th><th class="dh-cash">W–L</th><th class="dh-cash">PF</th><th class="dh-cash hide-m">PA</th>' +
      '<th class="dh-cash hide-m">Streak</th><th class="dh-cash">Pts rank</th><th class="dh-cash">Weekly wins</th></tr></thead><tbody>' +
      M.order.map(function (x, i) {
        var t = x.t, b = M.banked[t.id], mine = String(t.id) === String(st.me);
        var cls = (i === byes - 1 ? 'rt-bye' : '') + (i === cut - 1 ? ' rt-cut' : '');
        return '<tr class="' + cls + '"' + (mine ? ' style="background:#f4f8f5"' : '') + '><td class="dh-n">' + (i + 1) + '</td>' +
          '<td class="dh-name">' + esc(t.owner) + ' <span class="dh-team">' + esc(t.name) + '</span></td>' +
          '<td class="dh-cash">' + x.w + '–' + x.l + (x.ti ? '–' + x.ti : '') + '</td><td class="dh-cash">' + fmt1(x.pf) + '</td><td class="dh-cash hide-m">' + fmt1(x.pa) + '</td>' +
          '<td class="dh-cash hide-m">' + esc(x.streak) + '</td><td class="dh-cash">' + ptsRank[t.id] + '</td>' +
          '<td class="dh-cash">' + (b.weeks.length ? b.weeks.length + ' <i class="dh-yr">' + money(b.amt) + '</i>' : '—') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    return card('Standings', 'record, points, head-to-head · top ' + cut + ' make the playoffs, top ' + byes + ' get a bye', body);
  }
  function payoutCard(M) {
    var PAY = M.PAY, pot = T.teams.length * (PAY.entry || 300), ty = moneyTally(M);
    var playoffPot = (PAY.champion || 750) + (PAY.runnerUp || 350) + 2 * (PAY.champWeekendLoser || 50);
    var rows = T.teams.map(function (t) {
      var b = M.banked[t.id], ip = M.inPlay[t.id], ipAmt = ip.reduce(function (a, x) { return a + x[1]; }, 0);
      return { t: t, b: b, ip: ip, total: b.amt + ipAmt };
    }).sort(function (a, b) { return b.total - a.total || b.b.amt - a.b.amt; });
    var body = '<div style="overflow-x:auto"><table class="dh-table"><thead><tr><th>Team</th><th class="dh-cash">Banked</th><th>If the season ended today</th><th class="dh-cash">Total</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr' + (String(r.t.id) === String(st.me) ? ' style="background:#f4f8f5"' : '') + '><td class="dh-name">' + esc(r.t.owner) + '</td>' +
          '<td class="dh-cash">' + (r.b.amt ? money(r.b.amt) + ' <i class="dh-yr">wk ' + r.b.weeks.join(', ') + '</i>' : '—') + '</td>' +
          '<td class="dh-best">' + r.ip.map(function (x) { return esc(x[0]) + ' <i class="dh-yr">' + money(x[1]) + '</i>'; }).join(' · ') + '</td>' +
          '<td class="dh-cash dh-tot">' + (r.total ? money(r.total) : '—') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    return card('Payout race', money(pot) + ' pot · ' + money(ty.bankedTotal) + ' banked · ' + money(playoffPot) + ' waits for the playoffs', body);
  }
  function weeklyCard(M) {
    var rows = M.W.filter(function (w) { return w.done || w.live; }).slice().reverse().map(function (w) {
      return '<tr><td class="dh-n">' + w.week + '</td><td class="dh-name">' + esc(owner(w.top.team)) + (w.live ? ' <span class="rt-live">in progress</span>' : (w.tie ? ' <span class="dh-yr">tie</span>' : '')) + '</td>' +
        '<td class="dh-cash">' + fmt1(w.top.pts) + '</td><td class="dh-own hide-m">' + (w.second ? esc(owner(w.second.team)) + ' ' + fmt1(w.second.pts) : '') + '</td></tr>';
    }).join('');
    return card('Weekly high scores', money(M.weekly) + ' a week to the top total', '<div style="overflow-x:auto"><table class="dh-table"><thead><tr><th class="dh-n">Week</th><th>High score</th><th class="dh-cash">Points</th><th class="hide-m">Runner-up</th></tr></thead><tbody>' + rows + '</tbody></table></div>');
  }
  function leadersCard(M, L) {
    var top = seasonTop(6).map(function (pid) {
      var m = meta(pid), s = S(pid);
      return '<li>' + (m.img ? '<img src="' + esc(m.img) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' : '<span class="rv-nomug"></span>') +
        '<span class="rv-who">' + esc(m.name) + '<small>' + esc(m.pos) + ' · ' + esc(WHERE[pid].t.owner) + (s.rk ? ' · ' + esc(m.pos) + s.rk + ' in the NFL' : '') + '</small></span><b>' + fmt1(s.pts) + '</b></li>';
    }).join('');
    var race = '<p class="sm-line"><b>Points race</b> ' + M.byPts.slice(0, 3).map(function (x, i) { return (i + 1) + '. ' + esc(x.t.owner) + ' ' + fmt1(x.pf); }).join(' · ') +
      ' <span class="dh-yr">$' + ((M.PAY.pointsRace || [410, 250, 100]).join(' / $')) + '</span></p>';
    var wk = L && L.wkTop.length ? '<p class="sm-line"><b>Week ' + L.W + '</b> ' + L.wkTop.slice(0, 3).map(function (pid) { return esc(meta(pid).name) + ' ' + fmt1(S(pid).w[L.W - 1]); }).join(' · ') + '</p>' : '';
    return card('Season leaders', 'points so far, Sunday Funday scoring', '<ul class="rv-top sm-top">' + top + '</ul>' + race + wk);
  }
  function marketCard(M, L) {
    var s = T.stats || {}, sb = (T.scoreboard || []).slice(0, 3), kw = keeperTop(3);
    var body = '<ul class="rv-facts sm-facts">' +
      '<li><b>Moves this season</b>' + s.adds + ' adds · ' + s.drops + ' drops · ' + s.trades + (s.trades === 1 ? ' trade' : ' trades') + ' · ' + money(s.faabSpent) + ' of FAAB spent' +
        (s.biggestBid ? '<i>biggest bid: ' + esc(meta(s.biggestBid[1]).name) + ' ' + money(s.biggestBid[0]) + ' (' + esc(owner(s.biggestBid[2])) + ')</i>' : '') +
        (L ? '<i>week ' + L.W + ': ' + L.adds + ' adds, ' + L.drops + ' drops' + (L.big ? ' · ' + esc(meta(L.big.adds[0].pid).name) + ' $' + L.big.bid + ' (' + esc(owner(L.big.team)) + ')' : '') + '</i>' : '') + ' <a href="#" data-goto="moves">all moves →</a></li>' +
      (sb.length ? '<li><b>Auction scoreboard</b>' + sb.map(function (r, i) { return (i + 1) + '. ' + esc(owner(r.team)) + ' ' + valChip(r.surplus) + trend(r.dSurplus, true); }).join(' · ') + ' <a href="#" data-goto="value">full board →</a></li>' : '') +
      (kw.length ? '<li><b>Keeper watch</b>' + kw.map(function (x) { return esc(shortName(meta(x.r.pid).name)) + ' <i style="display:inline">$' + S(x.r.pid).worth + ' vs ' + esc(keepCostText(x.r).replace('at most ', '≤ ')) + '</i>'; }).join(' · ') + ' <a href="#" data-goto="value">the watch →</a></li>' : '') +
      '</ul>';
    return card('The market', 'moves, the auction so far, and next year', body);
  }
  function matchupsCard(M) {
    var cur = T.current || T.week;
    function rows(wk) {
      var w = M.W.filter(function (x) { return x.week === wk; })[0];
      if (!w) return '';
      return '<div class="rt-block-h" style="padding:10px 14px 0">Week ' + wk + (w.done ? '' : w.live ? ' <span class="rt-live">in progress</span>' : ' <span class="dh-yr">upcoming</span>') + '</div>' +
        '<table class="dh-table"><tbody>' + w.ms.map(function (m) {
          var hw = m.winner === 'HOME', aw = m.winner === 'AWAY';
          return '<tr><td class="dh-name" style="text-align:right' + (hw ? ';color:var(--accent)' : '') + '">' + esc(owner(m.home)) + '</td><td class="dh-cash" style="text-align:right">' + (m.hp || w.live ? fmt1(m.hp) : '') + '</td>' +
            '<td style="text-align:center;color:var(--ink-faint)">vs</td><td class="dh-cash" style="text-align:left">' + (m.ap || w.live ? fmt1(m.ap) : '') + '</td><td class="dh-name"' + (aw ? ' style="color:var(--accent)"' : '') + '>' + esc(owner(m.away)) + '</td></tr>';
        }).join('') + '</tbody></table>';
    }
    return card('Matchups', 'this week and next', rows(cur) + rows(cur + 1));
  }
  function h2hCard(M) {
    var body = '<div style="overflow-x:auto"><table class="dh-table rt-h2h"><thead><tr><th></th>' + M.order.map(function (x) { return '<th title="' + esc(x.t.owner) + '">' + esc(x.t.owner.slice(0, 4)) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      M.order.map(function (a) {
        return '<tr><th style="text-align:left">' + esc(a.t.owner) + '</th>' + M.order.map(function (b) {
          if (a.t.id === b.t.id) return '<td class="x">—</td>';
          var r = M.R[a.t.id][b.t.id];
          if (!r) return '<td></td>';
          var tip = r.games.map(function (g) { return 'wk ' + g[0] + ': ' + fmt1(g[1]) + '–' + fmt1(g[2]); }).join(', ');
          return '<td class="' + (r.w > r.l ? 'w' : r.l > r.w ? 'l' : 't') + '" title="' + esc(tip) + '">' + (r.w + r.l + r.t > 1 ? r.w + '–' + r.l : (r.w ? 'W' : r.l ? 'L' : 'T')) + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
    return card('Head to head', 'the tiebreaker table · row beat column', body);
  }

  /* the text version: headers, one thing per line -- built for a group text */
  function summaryText() {
    var M = payoutRace(), L = lastWeek(M), ty = moneyTally(M), PAY = M.PAY, cut = PAY.playoffTeams || 6, out = [];
    out.push('SUNDAY FUNDAY · ' + (L ? 'WEEK ' + L.W : 'SEASON SO FAR'), '');
    if (L && L.games.length) {
      out.push('RESULTS');
      L.games.forEach(function (g) { out.push(owner(g.w) + ' def. ' + owner(g.l) + ', ' + fmt1(g.wp) + '–' + fmt1(g.lp)); });
      out.push('High: ' + owner(L.hi[0]) + ' ' + fmt1(L.hi[1]) + ' ($' + (PAY.weekly || 15) + ')  ·  Low: ' + owner(L.lo[0]) + ' ' + fmt1(L.lo[1]), '');
    }
    out.push('STANDINGS');
    M.order.forEach(function (x, i) {
      out.push((i + 1) + '. ' + x.t.owner + '  ' + x.w + '-' + x.l + (x.ti ? '-' + x.ti : '') + '  (' + fmt1(x.pf) + ')');
      if (i === cut - 1) out.push('—— playoff line ——');
    });
    out.push('');
    out.push('MONEY');
    out.push('Banked: ' + (ty.banked.length ? ty.banked.map(function (x) { return x.t.owner + ' $' + x.amt + ' (wk ' + x.weeks.join(', ') + ')'; }).join(', ') : 'nobody yet'));
    out.push('If it ended today: ' + ty.today.slice(0, 5).map(function (x) { return x.t.owner + ' $' + x.total; }).join(', '), '');
    out.push('POINTS RACE');
    M.byPts.slice(0, 3).forEach(function (x, i) { out.push((i + 1) + '. ' + x.t.owner + '  ' + fmt1(x.pf)); });
    out.push('');
    if (L && L.wkTop.length) {
      out.push('TOP SCORERS, WEEK ' + L.W);
      L.wkTop.slice(0, 5).forEach(function (pid) { out.push(meta(pid).name + '  ' + fmt1(S(pid).w[L.W - 1]) + '  (' + WHERE[pid].t.owner + ')'); });
      out.push('');
    }
    if (L) out.push('MOVES', L.adds + ' adds, ' + L.drops + ' drops' + (L.trades ? ', ' + L.trades + (L.trades === 1 ? ' trade' : ' trades') : '') + (L.big ? '  ·  biggest bid ' + meta(L.big.adds[0].pid).name + ' $' + L.big.bid + ' (' + owner(L.big.team) + ')' : ''), '');
    out.push('mheinlen31.github.io/sunday-funday');
    return out.join('\n');
  }

  /* the image: a 1080x1350 card drawn by hand, so it looks the same everywhere */
  function drawSummary() {
    var M = payoutRace(), L = lastWeek(M), ty = moneyTally(M), PAY = M.PAY, cut = PAY.playoffTeams || 6;
    var W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
    var g = c.getContext('2d');
    var SANS = '-apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif', SERIF = 'Georgia, "Times New Roman", serif';
    var INK = '#1a1a1a', SOFT = '#55524d', FAINT = '#8a867f', GREEN = '#0d5c3f', RULE = '#e3e0da', GOLD = '#b08d2f';
    g.fillStyle = '#faf9f7'; g.fillRect(0, 0, W, H);
    g.fillStyle = GREEN; g.fillRect(0, 0, W, 12);
    function text(t, x, y, font, color, align) { g.font = font; g.fillStyle = color; g.textAlign = align || 'left'; g.fillText(t, x, y); }
    function caps(t, x, y, color) { g.font = '800 20px ' + SANS; g.fillStyle = color || GREEN; g.textAlign = 'left'; var cx = x; for (var i = 0; i < t.length; i++) { g.fillText(t[i], cx, y); cx += g.measureText(t[i]).width + 4; } }
    function rule(x1, x2, y, color, w) { g.strokeStyle = color || RULE; g.lineWidth = w || 1; g.beginPath(); g.moveTo(x1, y); g.lineTo(x2, y); g.stroke(); }
    function section(t, x, y, w) { caps(t, x, y, FAINT); rule(x, x + w, y + 12, INK, 2); return y + 44; }
    var wkLabel = L ? 'Week ' + L.W : 'Season so far';
    caps('FANTASY FOOTBALL · SUNDAY FUNDAY', 60, 72);
    text(wkLabel, 60, 156, 'bold 78px ' + SERIF, INK);
    text('Season summary · ' + new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric' }), 60, 200, 'italic 28px ' + SERIF, SOFT);
    text(PAY.entry ? '$' + (T.teams.length * PAY.entry).toLocaleString() + ' pot' : '', W - 60, 156, 'bold 34px ' + SERIF, GOLD, 'right');

    var LX = 60, LW = 470, RX = 590, RW = 430, y = 270;
    // results
    var yl = y;
    if (L && L.games.length) {
      yl = section('RESULTS', LX, yl, LW);
      L.games.forEach(function (gm) {
        text(owner(gm.w), LX, yl, 'bold 27px ' + SANS, GREEN);
        var wW = g.measureText(owner(gm.w)).width;
        text('def.', LX + wW + 10, yl, '800 15px ' + SANS, FAINT);
        text(owner(gm.l), LX + wW + 54, yl, '600 27px ' + SANS, SOFT);
        text(fmt1(gm.wp) + '–' + fmt1(gm.lp), LX + LW, yl, 'bold 27px ' + SERIF, INK, 'right');
        rule(LX, LX + LW, yl + 14); yl += 46;
      });
      text('High ' + owner(L.hi[0]) + ' ' + fmt1(L.hi[1]) + ' (+$' + (PAY.weekly || 15) + ')   ·   Low ' + owner(L.lo[0]) + ' ' + fmt1(L.lo[1]), LX, yl + 8, '600 21px ' + SANS, SOFT);
      yl += 60;
    }
    // standings
    var yr = section('STANDINGS', RX, y, RW);
    M.order.forEach(function (x, i) {
      text(String(i + 1), RX, yr, '700 18px ' + SANS, FAINT);
      text(x.t.owner, RX + 34, yr, (i < cut ? 'bold ' : '600 ') + '25px ' + SANS, i < cut ? INK : SOFT);
      text(x.w + '–' + x.l + (x.ti ? '–' + x.ti : ''), RX + RW - 110, yr, 'bold 25px ' + SERIF, INK, 'right');
      text(fmt1(x.pf), RX + RW, yr, '600 20px ' + SANS, FAINT, 'right');
      rule(RX, RX + RW, yr + 12, i === cut - 1 ? INK : RULE, i === cut - 1 ? 2 : 1); yr += 42;
    });
    y = Math.max(yl, yr) + 30;
    // money, full width
    y = section('MONEY', LX, y, W - 120);
    text('Banked  ', LX, y, '800 19px ' + SANS, FAINT);
    text(ty.banked.length ? ty.banked.map(function (x) { return x.t.owner + ' $' + x.amt + ' (wk ' + x.weeks.join(', ') + ')'; }).join('  ·  ') : 'nobody yet', LX + 96, y, '600 24px ' + SANS, INK);
    y += 42;
    text('If it ended today  ', LX, y, '800 19px ' + SANS, FAINT);
    text(ty.today.slice(0, 5).map(function (x) { return x.t.owner + ' $' + x.total; }).join('  ·  '), LX + 196, y, '600 24px ' + SANS, INK);
    y += 60;
    // points race (left) and top scorers (right)
    var y2l = section('POINTS RACE', LX, y, LW), y2r = section(L ? 'TOP SCORERS · WEEK ' + L.W : 'TOP SCORERS', RX, y, RW);
    M.byPts.slice(0, 5).forEach(function (x, i) {
      text((i + 1) + '.', LX, y2l, '700 18px ' + SANS, FAINT);
      text(x.t.owner, LX + 34, y2l, 'bold 25px ' + SANS, INK);
      text(fmt1(x.pf), LX + LW, y2l, 'bold 25px ' + SERIF, INK, 'right');
      if (i < 3) text('$' + (PAY.pointsRace || [410, 250, 100])[i], LX + LW - 120, y2l, '700 18px ' + SANS, GOLD, 'right');
      rule(LX, LX + LW, y2l + 12); y2l += 42;
    });
    var tops = L ? L.wkTop : seasonTop(5);
    tops.slice(0, 5).forEach(function (pid) {
      var m = meta(pid), pts = L ? S(pid).w[L.W - 1] : S(pid).pts;
      text(m.name, RX, y2r, 'bold 23px ' + SANS, INK);
      text(m.pos + ' · ' + WHERE[pid].t.owner, RX + RW - 90, y2r, '600 17px ' + SANS, FAINT, 'right');
      text(fmt1(pts), RX + RW, y2r, 'bold 25px ' + SERIF, INK, 'right');
      rule(RX, RX + RW, y2r + 12); y2r += 42;
    });
    y = Math.max(y2l, y2r) + 24;
    // the market
    var sb = (T.scoreboard || []).slice(0, 3), kw = keeperTop(3);
    if (y < H - 120) {
      y = section('THE MARKET', LX, y, W - 120);
      if (sb.length) { text('Auction scoreboard  ', LX, y, '800 19px ' + SANS, FAINT); text(sb.map(function (r, i) { return (i + 1) + '. ' + owner(r.team) + ' ' + (r.surplus >= 0 ? '+' : '−') + '$' + Math.abs(r.surplus); }).join('   ·   '), LX + 220, y, '600 24px ' + SANS, INK); y += 42; }
      if (kw.length) { text('Keeper watch  ', LX, y, '800 19px ' + SANS, FAINT); text(kw.map(function (x) { return shortName(meta(x.r.pid).name) + ' $' + S(x.r.pid).worth + ' vs ' + keepCostText(x.r).replace('at most ', '≤ '); }).join('   ·   '), LX + 160, y, '600 22px ' + SANS, INK); y += 42; }
    }
    // footer
    g.fillStyle = GREEN; g.fillRect(0, H - 64, W, 64);
    text('mheinlen31.github.io/sunday-funday', W / 2, H - 24, '700 22px ' + SANS, '#ffffff', 'center');
    return c;
  }
  function shareSummary(btn) {
    var c = drawSummary(), W = T.reviewWeek || T.week;
    c.toBlob(function (blob) {
      if (!blob) { btn.textContent = 'Could not draw it'; return; }
      var file = new File([blob], 'sunday-funday-week-' + W + '.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: 'Sunday Funday — Week ' + W }).catch(function () {});
        return;
      }
      var url = URL.createObjectURL(blob);
      var ov = document.createElement('div');
      ov.className = 'sm-overlay';
      ov.innerHTML = '<div class="sm-sheet"><img src="' + url + '" alt="Season summary card"><div class="sm-sheet-bar"><a class="dh-chip on" download="' + file.name + '" href="' + url + '">Save image</a><button class="dh-chip sm-close" type="button">Close</button></div></div>';
      ov.addEventListener('click', function (e) { if (e.target === ov || e.target.closest('.sm-close')) { ov.remove(); URL.revokeObjectURL(url); } });
      document.body.appendChild(ov);
    }, 'image/png');
  }
  function summaryView() {
    var M = payoutRace(), L = lastWeek(M), PAY = M.PAY;
    var head = '<article class="team-card board-card dh-card sm-head"><header class="dh-head"><h2>Season summary</h2>' +
      '<span class="dh-sub">' + (L ? 'through week ' + L.W : 'the season so far') + (T.generated ? ' · updated ' + new Date(T.generated).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '') + '</span>' +
      '<span class="sm-actions"><button class="dh-chip on sm-share" type="button">Share image</button><button class="dh-chip sm-copytext" type="button">Copy text</button></span></header>' +
      '<p class="sm-status">' + esc(M.order[0].t.owner) + ' leads at ' + M.order[0].w + '–' + M.order[0].l + ' · ' + esc(M.byPts[0].t.owner) + ' has the most points (' + fmt1(M.byPts[0].pf) + ')' +
      (L && L.hi ? ' · ' + esc(owner(L.hi[0])) + ' took week ' + L.W + ' with ' + fmt1(L.hi[1]) : '') + ' · ' + money(moneyTally(M).bankedTotal) + ' of the ' + money(T.teams.length * (PAY.entry || 300)) + ' pot is decided.</p>' +
      '<pre class="rt-notebox" hidden>' + esc(summaryText()) + '</pre></article>';
    main.className = 'dh-main rt-summary';
    main.innerHTML = tiles() + head + (L ? resultsCard(L, PAY) : '') +
      '<div class="dh-pair">' + standingsCard(M) + payoutCard(M) + '</div>' +
      '<div class="dh-pair">' + leadersCard(M, L) + marketCard(M, L) + '</div>' +
      '<div class="dh-pair">' + weeklyCard(M) + matchupsCard(M) + '</div>' + h2hCard(M);
    var sh = main.querySelector('.sm-share');
    sh.addEventListener('click', function () { shareSummary(sh); });
    var cp = main.querySelector('.sm-copytext');
    cp.addEventListener('click', function () {
      var txt = main.querySelector('.sm-head .rt-notebox').textContent;
      var done = function () { cp.textContent = 'Copied ✓'; setTimeout(function () { cp.textContent = 'Copy text'; }, 1600); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () { cp.textContent = 'Copy failed'; });
    });
  }

  /* ---------- the League Manager's note, generated ---------- */
  var NOTE_CONTRACT_ORDER = ['Leo', 'Steve', 'Mark', 'Bob', 'Mike', 'AJ', 'Pat', 'Matt', 'Brian', 'John'];
  var NOTE_MONEY_ORDER = ['Bob', 'Pat', 'Mike', 'Leo', 'AJ', 'John', 'Mark', 'Brian', 'Steve', 'Matt'];
  function noteName(t) { return t.name.replace(/^The /, ''); }
  function byOwner(order) { return order.map(function (o) { return T.teams.filter(function (t) { return t.owner === o; })[0]; }).filter(Boolean); }
  function mdy(iso) { var d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')); return ('0' + (d.getMonth() + 1)).slice(-2) + '/' + ('0' + d.getDate()).slice(-2) + '/' + String(d.getFullYear()).slice(2); }
  function noteText() {
    var S = T.season, L = window.LEAGUE_DATA, H = window.LEAGUE_HISTORY, out = ['League Information', ''];
    ((T.noteManual || {}).sections || []).forEach(function (sec) { out.push(sec.title); out = out.concat(sec.lines); out.push(''); });
    out.push((S + 1) + ' Players under Contract');
    byOwner(NOTE_CONTRACT_ORDER).forEach(function (t) {
      var locked = t.roster.filter(function (r) { return r.outlook && r.outlook.type === 'locked'; })
        .sort(function (a, b) { return b.outlook.price - a.outlook.price; })
        .map(function (r) { return meta(r.pid).name + ' ($' + r.outlook.price + ')'; });
      out.push(noteName(t) + ' - ' + (locked.length ? locked.join(', ') : 'n/a'));
    });
    out.push('');
    [S + 1, S + 2].forEach(function (yr) {
      out.push(yr + ' Auction Money');
      byOwner(NOTE_MONEY_ORDER).forEach(function (t) {
        var b = L && (L.budgets || []).filter(function (x) { return x.team === t.name; })[0];
        var y = b && b.years && b.years[String(yr)];
        out.push(noteName(t) + ' - $' + (y && y.final != null ? y.final : (b && b.start) || 200));
      });
      out.push('');
    });
    out.push(S + ' Trades');
    var trades = [];
    (L && L.trades || []).forEach(function (tr) {
      trades.push({ d: tr.date, txt: tr.summary.replace(/\btraded\b/, 'trades').replace(/ draft budget\.?$/, '').replace(/\.$/, '') });
    });
    (T.events || []).filter(function (e) { return e.trades && e.trades.length; }).forEach(function (e) {
      var by = {};
      e.trades.forEach(function (tr) { (by[tr.from + '>' + tr.to] = by[tr.from + '>' + tr.to] || []).push(meta(tr.pid).name); });
      var keys = Object.keys(by), a = keys[0].split('>');
      var back = keys.filter(function (k) { return k !== keys[0]; }).map(function (k) { return by[k].join(', '); }).join(', ');
      trades.push({ d: new Date(e.ts).toISOString().slice(0, 10), txt: owner(+a[0]) + ' trades ' + by[keys[0]].join(', ') + ' to ' + owner(+a[1]) + (back ? ' for ' + back : '') });
    });
    trades.sort(function (a, b) { return a.d < b.d ? -1 : 1; });
    if (!trades.length) out.push('n/a');
    trades.forEach(function (t, i) { out.push((i + 1) + '. ' + mdy(t.d) + ' - ' + t.txt); });
    out.push('');
    var prev = H && (H.tradeHistory || []).filter(function (b) { return +b.year === S - 1; })[0];
    out.push((S - 1) + ' Trades');
    if (prev) prev.entries.forEach(function (line, i) { out.push((i + 1) + '. ' + line.replace(/^\s*[\d/]+\s*-\s*/, function (m) { return m; })); });
    else out.push('(loading last season\u2019s trades\u2026)');
    return out.join('\n').trim() + '\n';
  }
  function noteCard() {
    if (!window.LEAGUE_HISTORY) {
      var sc = document.createElement('script'); sc.src = 'js/history.js'; sc.onload = function () { if (st.view === 'cap') render(); }; document.head.appendChild(sc);
    }
    var txt = noteText();
    return '<article class="team-card board-card dh-card rt-note"><header class="dh-head"><h2>League Manager\u2019s note</h2>' +
      '<span class="dh-sub">for the ESPN league page \u2014 built from the tracker, the budgets sheet and the trade log</span>' +
      '<button class="dh-chip rt-copy" type="button">Copy</button></header>' +
      '<pre class="rt-notebox">' + esc(txt) + '</pre></article>';
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
    }).join('') + '</div>' + (st.team === 'all' ? noteCard() : '');
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
    n.push('<li><b>Value</b> uses the league\u2019s own auction prices as the ladder for production: the RB whose points rank 7th among the league\u2019s RBs so far was worth what the 7th-priciest RB cost on draft day. The scoreboard totals that for each roster against the money committed on draft day; keeper watch compares it with the most a player can cost to keep in 2027. Small samples early \u2014 it firms up as the season goes.</li>');
    n.push('<li><b>Season Summary</b> is the whole season on one page \u2014 last week\u2019s results, standings, the payout race, weekly high scores, leaders, the market. <b>Share image</b> draws it as a card for the group text; <b>Copy text</b> gives the same in plain lines. A link to <a href="#summary">#summary</a> opens it straight away.</li>');
    n.push('<li><b>Standings</b> use the Manifesto\u2019s tiebreakers (record, total points, head-to-head record, head-to-head points), not ESPN\u2019s. The payout race shows weekly money already won and what each place would pay if the season ended today; the playoff money is settled in January.</li>');
    n.push('<li><b>\u25b2\u25bc</b> on the Value tab compare with the tracker\u2019s snapshot from the week before. <b>Lineup trouble</b> (top of Rosters) is written fresh from the same data each run.</li>');
    n.push('<li><b>Stats</b> are season-to-date in Sunday Funday scoring, straight from ESPN. The rank is where he sits among every NFL player at his position; per game counts only games he played; the 2025 column is last season\u2019s total. Free agents can be shown alongside rostered players.</li>');
    n.push('<li><b>Tap a team\u2019s name</b> to open or close its card; the \u2606 makes it your team (first, and open, every visit). Moves marked <em class="rt-newtag inline">new</em> happened since you were last here. The <b>Waiver wire</b> preset lists free agents by last week\u2019s points with the going rate for winning bids by position.</li>');
    n.push('<li>Players on <b>IR</b> can still be kept. FAAB is the $100 free-agent budget; it resets every season.</li>');
    if ((T.warnings || []).length) n.push('<li><b>To check:</b> ' + T.warnings.map(esc).join(' · ') + '</li>');
    n.push('</ul>');
    $('rt-note').innerHTML = n.join('');
  }

  function render() {
    buildViews();
    if (st.view === 'moves') moves(); else if (st.view === 'cap') cap(); else if (st.view === 'stats') statsView(); else if (st.view === 'value') valueView(); else if (st.view === 'summary' || st.view === 'standings') summaryView(); else rosters();
    try { history.replaceState(null, '', '#' + (st.view === 'standings' ? 'summary' : st.view)); } catch (e) {}
  }

  // tap a player for his card. The card wants the keeper-sheet record when
  // there is one (matched on ESPN id, or by name for a D/ST); a pickup who was
  // never on the sheet gets the tracker's own name, position and headshot.
  main.addEventListener('click', function (e) {
    var go = e.target.closest('[data-goto]');
    if (go) { e.preventDefault(); st.view = go.dataset.goto; save(); render(); window.scrollTo(0, 0); return; }
    var star = e.target.closest('.rt-star');
    if (star) {
      var tid = star.closest('.rt-card').dataset.tid;
      st.me = String(st.me) === String(tid) ? null : +tid;
      save(); render(); return;
    }
    var head = e.target.closest('.rt-head');
    if (head) {
      var card = head.closest('.rt-card'), id = card.dataset.tid;
      st.open[id] = card.classList.contains('collapsed');
      card.classList.toggle('collapsed', !st.open[id]);
      save(); return;
    }
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
