/* Draft History — every Sunday Funday draft since 2011.
   Data: js/draftdata.js (window.DRAFT_HISTORY), written by
   ~/sunday-funday-draft/export_draft_history.py straight out of the draft DB. */
(function () {
  'use strict';
  var D = window.DRAFT_HISTORY;
  var main = document.getElementById('dh-main');
  if (!D || !main) return;

  /* ---------- hydrate ---------- */
  var F = D.fields;
  var IX = {}; F.forEach(function (f, i) { IX[f] = i; });
  var ALL = D.rows.map(function (r) {
    return {
      year: r[IX.year], player: r[IX.player], pos: r[IX.pos], owner: r[IX.owner],
      price: r[IX.price], keeper: r[IX.keeper], pts: r[IX.pts], rk: r[IX.rk],
      gp: r[IX.gp], dnp: r[IX.dnp], pick: r[IX.pick], nom: r[IX.nom]
    };
  });
  var YEARS = D.years.slice();
  var TEAMS = D.teams || {};
  var PURSES = D.purses || {};
  var POS_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'Def'];

  /* What a player turned out to be worth, in that year's own dollars.
     Inside a position, the league's prices are the market: the priciest RB set
     the top of the RB market, the next one the second rung, and so on. So the
     RB who finished 6th among the league's RBs was worth whatever the 6th-most
     expensive RB cost. Value is that number minus what he actually cost, which
     makes it symmetrical (a $60 bust can lose $59, a $1 hit can gain $59) and
     zero-sum inside each position — exactly how an auction settles up. */
  YEARS.forEach(function (y) {
    POS_ORDER.forEach(function (pos) {
      var g = ALL.filter(function (p) { return p.year === y && p.pos === pos; });
      var ladder = g.map(function (p) { return p.price; }).sort(function (a, b) { return b - a; });
      g.slice().sort(function (a, b) { return b.price - a.price || a.player.localeCompare(b.player); })
        .forEach(function (p, i) { p.priceRk = i + 1; });
      g.filter(function (p) { return p.pts !== null && p.pts !== undefined; })
        .sort(function (a, b) { return b.pts - a.pts; })
        .forEach(function (p, i) {
          p.ptsRk = i + 1;
          p.worth = ladder[i];
          p.val = p.worth - p.price;
        });
    });
  });

  /* ---------- state ---------- */
  var LS = 'sf-drafts';
  var st = { year: YEARS[0], view: 'overview', group: 'owner', sort: 'price', q: '' };
  try { Object.assign(st, JSON.parse(localStorage.getItem(LS) || '{}')); } catch (e) {}
  var hy = (location.hash.match(/year=(\d{4}|all)/) || [])[1];
  if (hy) st.year = hy === 'all' ? 'all' : +hy;
  if (st.year !== 'all' && YEARS.indexOf(st.year) < 0) st.year = YEARS[0];
  function save() {
    try { localStorage.setItem(LS, JSON.stringify(st)); } catch (e) {}
    history.replaceState(null, '', '#year=' + st.year);
  }

  /* ---------- helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function money(n) { return '$' + Math.round(n).toLocaleString(); }
  function num(n, d) { return n === null || n === undefined ? '—' : Number(n).toFixed(d === undefined ? 1 : d); }
  function isKeeper(p) { return p.keeper === 1; }
  function scored(y) { return y !== 'all' && ALL.some(function (p) { return p.year === y && p.pts !== null; }); }
  function tier(price) {
    if (price >= 50) return '$50 and up';
    if (price >= 30) return '$30 – $49';
    if (price >= 15) return '$15 – $29';
    if (price >= 5) return '$5 – $14';
    return '$1 – $4';
  }
  var TIER_ORDER = ['$50 and up', '$30 – $49', '$15 – $29', '$5 – $14', '$1 – $4'];

  function pool() {
    var rows = st.year === 'all' ? ALL.slice() : ALL.filter(function (p) { return p.year === st.year; });
    if (st.view === 'keepers') rows = rows.filter(isKeeper);
    if (st.view === 'drafted') rows = rows.filter(function (p) { return !isKeeper(p); });
    if (st.q) {
      var q = st.q.toLowerCase();
      rows = rows.filter(function (p) {
        return p.player.toLowerCase().indexOf(q) >= 0 || p.owner.toLowerCase().indexOf(q) >= 0 ||
          p.pos.toLowerCase() === q;
      });
    }
    return rows;
  }

  /* ---------- chrome ---------- */
  function buildYearPicker() {
    var sel = $('dh-year');
    sel.innerHTML = YEARS.map(function (y) { return '<option value="' + y + '">' + y + '</option>'; }).join('') +
      '<option value="all">All seasons</option>';
    sel.value = st.year;
    sel.addEventListener('change', function () {
      st.year = sel.value === 'all' ? 'all' : +sel.value;
      if (st.group === 'season' && st.year !== 'all') st.group = 'owner';
      if (st.group === 'nom' && st.year !== 2026) st.group = 'owner';
      save(); render();
    });
  }

  function groupOptions() {
    var o = [['owner', 'Owner'], ['pos', 'Position'], ['tier', 'Price'], ['none', 'One list']];
    if (st.year === 'all') o.splice(0, 0, ['season', 'Season']);
    if (st.year === 2026 && st.view !== 'keepers') o.splice(3, 0, ['nom', 'Nominator']);
    return o;
  }
  function sortOptions() {
    var o = [['price', 'Price'], ['name', 'Name']];
    if (scored(st.year) || st.year === 'all') o.splice(1, 0, ['pts', 'Points'], ['val', 'Value']);
    if (st.year === 2026 && st.view !== 'keepers') o.splice(1, 0, ['pick', 'Draft order']);
    return o;
  }
  function seg(el, opts, cur, onPick) {
    el.innerHTML = opts.map(function (o) {
      return '<button class="dh-chip' + (o[0] === cur ? ' on' : '') + '" data-v="' + o[0] + '">' + o[1] + '</button>';
    }).join('');
    el.onclick = function (e) {
      var b = e.target.closest('.dh-chip'); if (!b) return;
      onPick(b.dataset.v);
    };
  }
  function buildControls() {
    var views = $('dh-views');
    [].forEach.call(views.querySelectorAll('.dh-view'), function (b) {
      b.classList.toggle('on', b.dataset.view === st.view);
      b.onclick = function () {
        st.view = b.dataset.view;
        if (st.group === 'nom' && st.view === 'keepers') st.group = 'owner';
        if (st.sort === 'pick' && st.view === 'keepers') st.sort = 'price';
        save(); render();
      };
    });
    var show = st.view !== 'overview';
    $('dh-controls').hidden = !show;
    if (!show) return;
    var gopts = groupOptions(), sopts = sortOptions();
    if (!gopts.some(function (o) { return o[0] === st.group; })) st.group = 'owner';
    if (!sopts.some(function (o) { return o[0] === st.sort; })) st.sort = 'price';
    seg($('dh-group'), gopts, st.group, function (v) { st.group = v; save(); render(); });
    seg($('dh-sort'), sopts, st.sort, function (v) { st.sort = v; save(); render(); });
  }

  /* ---------- row rendering ---------- */
  function valChip(p) {
    if (p.val === undefined || p.val === null) return '';
    var v = p.val, cls = v > 5 ? 'up' : (v < -5 ? 'down' : 'even');
    return '<span class="dh-val ' + cls + '" title="finished like a ' + money(p.worth) + ' player">' +
      (v > 0 ? '+' : v < 0 ? '\u2212' : '') + '$' + Math.abs(v) + '</span>';
  }
  function posChip(pos) { return '<span class="dh-pos p-' + pos.replace('/', '') + '">' + pos + '</span>'; }

  function rowHtml(p, opts) {
    var c = [];
    if (opts.showPick) c.push('<td class="dh-n">' + (p.pick || (isKeeper(p) ? 'K' : '')) + '</td>');
    c.push('<td class="dh-name">' + esc(p.player) +
      (opts.showYear ? ' <span class="dh-yr">' + p.year + '</span>' : '') +
      (isKeeper(p) && opts.markKeeper ? ' <span class="dh-k">kept</span>' : '') + '</td>');
    c.push('<td class="dh-p">' + posChip(p.pos) + '</td>');
    if (opts.showOwner) c.push('<td class="dh-own">' + esc(p.owner) + '</td>');
    c.push('<td class="dh-cash">' + money(p.price) + '</td>');
    if (opts.showPts) {
      c.push('<td class="dh-pts">' + (p.pts === null ? '—' : num(p.pts, 1)) + '</td>');
      c.push('<td class="dh-fin">' + (p.rk ? p.pos + esc(String(p.rk)) : '—') + '</td>');
      c.push('<td class="dh-vc">' + valChip(p) + '</td>');
    }
    if (opts.showNom) c.push('<td class="dh-own">' + (p.nom ? esc(p.nom) : '—') + '</td>');
    return '<tr>' + c.join('') + '</tr>';
  }

  function tableHtml(list, opts) {
    var h = [];
    if (opts.showPick) h.push('<th class="dh-n">#</th>');
    h.push('<th>Player</th><th class="dh-p"></th>');
    if (opts.showOwner) h.push('<th>Owner</th>');
    h.push('<th class="dh-cash">Price</th>');
    if (opts.showPts) h.push('<th class="dh-pts">Points</th><th class="dh-fin">Finish</th><th class="dh-vc" title="What his finish was worth in that year&apos;s dollars, less what he cost">Value</th>');
    if (opts.showNom) h.push('<th>Nom by</th>');
    return '<table class="dh-table"><thead><tr>' + h.join('') + '</tr></thead><tbody>' +
      list.map(function (p) { return rowHtml(p, opts); }).join('') + '</tbody></table>';
  }

  function sortList(list) {
    var s = st.sort;
    return list.sort(function (a, b) {
      if (s === 'price') return b.price - a.price || a.player.localeCompare(b.player);
      if (s === 'name') return a.player.localeCompare(b.player);
      if (s === 'pick') return (a.pick || 999) - (b.pick || 999);
      if (s === 'pts') return (b.pts === null ? -1 : b.pts) - (a.pts === null ? -1 : a.pts);
      if (s === 'val') {
        var av = a.val === undefined ? -999 : a.val, bv = b.val === undefined ? -999 : b.val;
        return bv - av || b.price - a.price;
      }
      return 0;
    });
  }

  /* ---------- list views ---------- */
  function listView() {
    var rows = pool();
    if (!rows.length) {
      main.innerHTML = '<article class="team-card board-card"><div class="empty-note">Nothing matches that.</div></article>';
      return;
    }
    var opts = {
      showOwner: st.group !== 'owner',
      showPts: st.year === 'all' || scored(st.year),
      showPick: st.year === 2026 && st.view !== 'keepers',
      showNom: st.year === 2026 && st.view !== 'keepers' && st.group !== 'nom',
      showYear: st.year === 'all' && st.group !== 'season',
      markKeeper: st.view === 'all'
    };
    var buckets = {}, order = [];
    rows.forEach(function (p) {
      var k = st.group === 'owner' ? p.owner
        : st.group === 'pos' ? p.pos
        : st.group === 'tier' ? tier(p.price)
        : st.group === 'season' ? String(p.year)
        : st.group === 'nom' ? (p.nom || 'Keeper')
        : 'All';
      if (!buckets[k]) { buckets[k] = []; order.push(k); }
      buckets[k].push(p);
    });
    if (st.group === 'pos') order.sort(function (a, b) { return POS_ORDER.indexOf(a) - POS_ORDER.indexOf(b); });
    else if (st.group === 'tier') order.sort(function (a, b) { return TIER_ORDER.indexOf(a) - TIER_ORDER.indexOf(b); });
    else if (st.group === 'season') order.sort(function (a, b) { return b - a; });
    else if (st.group === 'owner' || st.group === 'nom') {
      order.sort(function (a, b) {
        var sa = buckets[a].reduce(function (t, p) { return t + p.price; }, 0);
        var sb = buckets[b].reduce(function (t, p) { return t + p.price; }, 0);
        return sb - sa;
      });
    }
    main.className = 'dh-main dh-list';
    main.innerHTML = order.map(function (k) {
      var list = sortList(buckets[k].slice());
      var spend = list.reduce(function (t, p) { return t + p.price; }, 0);
      var pts = list.reduce(function (t, p) { return t + (p.pts || 0); }, 0);
      var sub = list.length.toLocaleString() + (list.length === 1 ? ' player · ' : ' players · ') + money(spend) +
        (opts.showPts && pts ? ' · ' + Math.round(pts).toLocaleString() + ' pts' : '');
      var title = k;
      if (st.group === 'owner' && TEAMS[k]) title = k + ' <span class="dh-team">' + esc(TEAMS[k]) + '</span>';
      if (st.group === 'nom' && k !== 'Keeper') title = k + ' <span class="dh-team">nominated</span>';
      return '<article class="team-card board-card dh-card">' +
        '<header class="dh-head"><h2>' + title + '</h2><span class="dh-sub">' + sub + '</span></header>' +
        tableHtml(list, opts) + '</article>';
    }).join('');
  }

  /* ---------- overview ---------- */
  function tile(label, big, sub) {
    return '<div class="dh-tile"><div class="dh-tile-l">' + label + '</div>' +
      '<div class="dh-tile-b">' + big + '</div>' +
      '<div class="dh-tile-s">' + (sub || '') + '</div></div>';
  }

  function overview() {
    var rows = st.year === 'all' ? ALL.slice() : ALL.filter(function (p) { return p.year === st.year; });
    var keeps = rows.filter(isKeeper), picks = rows.filter(function (p) { return !isKeeper(p); });
    var total = rows.reduce(function (t, p) { return t + p.price; }, 0);
    var kSpend = keeps.reduce(function (t, p) { return t + p.price; }, 0);
    var top = rows.slice().sort(function (a, b) { return b.price - a.price; })[0];
    var hasPts = st.year === 'all' || scored(st.year);
    var owners = {};
    rows.forEach(function (p) {
      var o = owners[p.owner] || (owners[p.owner] = { owner: p.owner, n: 0, k: 0, kS: 0, d: 0, dS: 0, pts: 0, best: null });
      o.n++;
      if (isKeeper(p)) { o.k++; o.kS += p.price; } else { o.d++; o.dS += p.price; }
      o.pts += p.pts || 0;
      if (p.val !== undefined && (!o.best || p.val > o.best.val)) o.best = p;
    });
    var purses = PURSES[String(st.year)] || null;
    var list = Object.keys(owners).map(function (k) { return owners[k]; });
    list.sort(function (a, b) { return hasPts ? b.pts - a.pts : (b.kS + b.dS) - (a.kS + a.dS); });

    var tiles = [
      tile('Committed', money(total), st.year === 'all' ? YEARS.length + ' drafts, ' + YEARS[YEARS.length - 1] + '\u2013' + YEARS[0] : keeps.length + ' kept · ' + picks.length + ' bought'),
      tile('Keeper money', money(kSpend), total ? Math.round(kSpend / total * 100) + '% of every dollar' : ''),
      tile('Auction money', money(total - kSpend), picks.length.toLocaleString() + ' players bought'),
      tile('Priciest', top ? esc(top.player) : '—', top ? money(top.price) + ' · ' + top.owner + (st.year === 'all' ? ' · ' + top.year : '') : '')
    ];
    if (hasPts) {
      var real = rows.filter(function (p) { return p.val !== undefined && p.price >= 15; });
      var bar = real.slice().sort(function (a, b) { return b.val - a.val; })[0];
      var bust = real.slice().sort(function (a, b) { return a.val - b.val; })[0];
      if (bar) tiles.push(tile('Best return', esc(bar.player), money(bar.price) + ' → worth ' + money(bar.worth) + (st.year === 'all' ? ' · ' + bar.year : '')));
      if (bust) tiles.push(tile('Worst return', esc(bust.player), money(bust.price) + ' → worth ' + money(bust.worth) + (st.year === 'all' ? ' · ' + bust.year : '')));
    } else {
      var most = list.slice().sort(function (a, b) { return (b.kS + b.dS) - (a.kS + a.dS); })[0];
      tiles.push(tile('Biggest spender', most ? most.owner : '—',
        most ? money(most.kS + most.dS) + (purses && purses[most.owner] ? ' of a ' + money(purses[most.owner]) + ' purse' : '') : ''));
      var first = rows.filter(function (p) { return p.pick === 1; })[0];
      if (first) tiles.push(tile('First off the board', esc(first.player), money(first.price) + ' · ' + first.owner));
    }

    var ledger = '<article class="team-card board-card dh-card"><header class="dh-head"><h2>By owner</h2>' +
      '<span class="dh-sub">' + (hasPts ? 'sorted by what the draft-day roster scored' : 'sorted by money committed') + '</span></header>' +
      '<table class="dh-table dh-ledger"><thead><tr><th>Owner</th><th class="dh-cash">Kept</th>' +
      '<th class="dh-cash">Keeper $</th><th class="dh-cash">Bought</th><th class="dh-cash">Auction $</th>' +
      '<th class="dh-cash">Total</th>' + (purses ? '<th class="dh-cash">Purse</th><th class="dh-cash">Left</th>' : '') +
      (hasPts ? '<th class="dh-pts">Points</th><th>Best buy</th>' : '') +
      '</tr></thead><tbody>' + list.map(function (o) {
        return '<tr><td class="dh-name">' + esc(o.owner) +
          (TEAMS[o.owner] && st.year !== 'all' ? ' <span class="dh-team">' + esc(TEAMS[o.owner]) + '</span>' : '') + '</td>' +
          '<td class="dh-cash">' + o.k + '</td><td class="dh-cash">' + money(o.kS) + '</td>' +
          '<td class="dh-cash">' + o.d + '</td><td class="dh-cash">' + money(o.dS) + '</td>' +
          '<td class="dh-cash dh-tot">' + money(o.kS + o.dS) + '</td>' +
          (purses ? '<td class="dh-cash">' + (purses[o.owner] ? money(purses[o.owner]) : '—') + '</td>' +
            '<td class="dh-cash">' + (purses[o.owner] ? money(purses[o.owner] - o.kS - o.dS) : '—') + '</td>' : '') +
          (hasPts ? '<td class="dh-pts">' + Math.round(o.pts).toLocaleString() + '</td>' +
            '<td class="dh-best">' + (o.best ? esc(o.best.player) + ' <span class="dh-yr">' + money(o.best.price) + '</span>' : '—') + '</td>' : '') +
          '</tr>';
      }).join('') + '</tbody></table></article>';

    var mkt = POS_ORDER.map(function (pos) {
      var g = rows.filter(function (p) { return p.pos === pos; });
      if (!g.length) return '';
      var sp = g.reduce(function (t, p) { return t + p.price; }, 0);
      var t2 = g.slice().sort(function (a, b) { return b.price - a.price; })[0];
      return '<tr><td>' + posChip(pos) + '</td><td class="dh-cash">' + g.length + '</td>' +
        '<td class="dh-cash">' + money(sp) + '</td><td class="dh-cash">' + Math.round(sp / total * 100) + '%</td>' +
        '<td class="dh-cash">' + money(sp / g.length) + '</td>' +
        '<td class="dh-name">' + esc(t2.player) + ' <span class="dh-yr">' + money(t2.price) + '</span></td></tr>';
    }).join('');
    var market = '<article class="team-card board-card dh-card"><header class="dh-head"><h2>Where the money went</h2>' +
      '<span class="dh-sub">every roster spot, by position</span></header>' +
      '<table class="dh-table"><thead><tr><th>Pos</th><th class="dh-cash">Players</th><th class="dh-cash">Spent</th>' +
      '<th class="dh-cash">Share</th><th class="dh-cash">Average</th><th>Top price</th></tr></thead><tbody>' +
      mkt + '</tbody></table></article>';

    var extra = '';
    if (hasPts) {
      var scoredRows = rows.filter(function (p) { return p.val !== undefined; });
      var bargains = scoredRows.filter(function (p) { return p.price >= 15; }).sort(function (a, b) { return b.val - a.val; }).slice(0, 8);
      var cheap = scoredRows.filter(function (p) { return p.price <= 5; }).sort(function (a, b) { return b.val - a.val; }).slice(0, 8);
      var busts = scoredRows.filter(function (p) { return p.price >= 15; }).sort(function (a, b) { return a.val - b.val; }).slice(0, 8);
      function mini(title, sub, l) {
        return '<article class="team-card board-card dh-card dh-mini"><header class="dh-head"><h2>' + title + '</h2>' +
          '<span class="dh-sub">' + sub + '</span></header><table class="dh-table"><tbody>' +
          l.map(function (p) {
            return '<tr><td class="dh-name">' + esc(p.player) + (st.year === 'all' ? ' <span class="dh-yr">' + p.year + '</span>' : '') + '</td>' +
              '<td class="dh-p">' + posChip(p.pos) + '</td><td class="dh-own">' + esc(p.owner) + '</td>' +
              '<td class="dh-cash">' + money(p.price) + '</td><td class="dh-fin">' + (p.rk ? p.pos + p.rk : '—') + '</td>' +
              '<td class="dh-vc">' + valChip(p) + '</td></tr>';
          }).join('') + '</tbody></table></article>';
      }
      extra = '<div class="dh-pair">' +
        mini('Paid off', 'real money that finished well ahead of its price', bargains) +
        mini('Went sideways', 'the same money, the other direction', busts) + '</div>' +
        mini('Loose change', 'bought for $5 or less, most value returned first', cheap);
    } else {
      extra = '<article class="team-card board-card dh-card"><div class="empty-note">' +
        'The ' + st.year + ' season has not been scored yet. Points, finishes and value come in once the year is in the books — ' +
        'until then this page shows what everyone paid.</div></article>';
    }

    main.className = 'dh-main';
    main.innerHTML = '<div class="dh-tiles">' + tiles.join('') + '</div>' + ledger + market + extra;
  }

  /* ---------- footnote ---------- */
  function note() {
    var n = [];
    n.push('<h3>How to read this</h3><ul>');
    n.push('<li><b>Price</b> is what the roster spot cost that year — the auction price for a player bought at the draft, the keeper price (prior cost plus the manifesto\'s luxury tax) for a player kept.</li>');
    if (st.year === 'all' || scored(st.year)) {
      n.push('<li><b>Points</b> are ' + esc(D.scoring) + '. <b>Finish</b> is where he ended the season among all NFL players at his position.</li>');
      n.push('<li><b>Value</b> puts the finish back into dollars. Inside each position the league\'s own prices are the market, so the RB who finished 6th among the league\'s RBs was worth what the 6th-priciest RB cost that year. <span class="dh-val up">+$22</span> means he returned $22 more than he cost, <span class="dh-val down">\u2212$22</span> that much less. It sums to zero inside a position — one owner\'s bargain is another\'s overpay.</li>');
    }
    if (st.year === 2026) n.push('<li><b>Nom by</b> is who put the player up for bid. Picks never recorded it — it is replayed from the board\'s saved nomination order, and checks out: the nominator bought his own nomination 51 times out of 98.</li>');
    if (PURSES[String(st.year)]) n.push('<li><b>Purse</b> is not a flat $200 — auction dollars get traded, so every seat walks in with its own number. Only 2026 is on record.</li>');
    n.push('<li>Keeper flags are missing for 2017, and 2011 was the league\'s first draft, so everyone that year counts as bought.</li>');
    n.push('<li>Points come from the players on the draft-day roster, not the team\'s full season — in-season pickups belong to <a href="rosters.html">Past Rosters</a>.</li>');
    n.push('</ul>');
    $('dh-note').innerHTML = n.join('');
  }

  /* ---------- go ---------- */
  function render() {
    buildControls();
    if (st.view === 'overview') overview(); else listView();
    note();
  }
  buildYearPicker();
  var q = $('dh-q');
  q.value = st.q;
  var t;
  q.addEventListener('input', function () {
    clearTimeout(t);
    t = setTimeout(function () {
      st.q = q.value.trim();
      if (st.q && st.view === 'overview') st.view = 'all';
      save(); render();
    }, 140);
  });
  render();
})();
