/* League-wide player boards: "positions" (keeper cost per position) and
   "adp" (everyone by ESPN ADP). Page chosen via <body data-page="...">. */
(function () {
  const D = window.LEAGUE_DATA;
  if (!D) return;

  const page = document.body.dataset.page;
  const ny = String(D.season + 1).slice(2);
  const FALLBACK_IMG = 'https://a.espncdn.com/combiner/i?img=/i/headshots/nophoto.png&w=120&h=88';
  // keep in sync with TEAM_COLORS in app.js
  const TEAM_COLORS = ['#0d5c3f', '#8a1f1b', '#1f5fa8', '#b08d2f', '#5b3a8c',
    '#0f7b8a', '#c05a17', '#3d6d1f', '#7d2f52', '#444a56'];
  const POS_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'D/ST'];

  document.getElementById('season').textContent = D.season;
  document.getElementById('updated').textContent =
    new Date(D.generated).toLocaleString(undefined, {
      month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });

  const money = (v) => (v == null ? '—' : '$' + v);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const players = D.teams.flatMap((t, ti) =>
    t.players.map((p) => ({ ...p, team: t.name, ti })));

  function deltaHtml(p) {
    const d = p.surplus;
    if (d == null) return '';
    if (d > 0) return `<span class="delta pos">+$${d}</span>`;
    if (d < 0) return `<span class="delta neg">−$${Math.abs(d)}</span>`;
    return '<span class="delta zero">even</span>';
  }

  function contractHtml(p) {
    if (p.status === 'contract-yr2') {
      return `<span class="badge badge-contract">Signed for '${String(D.season).slice(2)}</span>`;
    }
    if (p.nextYear != null) {
      return '<span class="badge badge-deal">New 2-yr contract if kept</span>';
    }
    return '';
  }

  function rowHtml(p, rank, amount, subline) {
    const posClass = 'pos-' + p.pos.replace('/', '');
    const whose = p.team
      ? `<a class="teamtag" href="./#team-${p.ti}">
           <i class="teamdot" style="background:${TEAM_COLORS[p.ti % 10]}"></i>${esc(p.team)}</a>
         <span class="badge acq">${esc(p.acquired)}</span>`
      : '<span class="badge avail">Available</span>';
    const side = page === 'adp' ? '' : contractHtml(p);
    return `<div class="prow static${p.team ? '' : ' unowned'}">
      <span class="rank">${rank}</span>
      <img class="mug" src="${esc(p.img || FALLBACK_IMG)}" alt="" loading="lazy"
           onerror="this.onerror=null;this.src='${FALLBACK_IMG}'">
      <div class="pinfo">
        <div class="pname">${esc(p.name)}</div>
        <div class="psub">
          <span class="pos ${posClass}">${esc(p.pos)}</span>
          ${p.nfl ? `<span class="nfl">${esc(p.nfl)}</span>` : ''}
          ${whose}
        </div>
      </div>
      <div class="pcontract">${side}</div>
      <div class="pkeep">
        <div class="pprice"><span class="amount">${money(amount)}</span></div>
        ${subline ? `<div class="pnext">${subline}</div>` : ''}
      </div>
    </div>`;
  }

  const main = document.getElementById('board');

  if (page === 'positions') {
    main.innerHTML = POS_ORDER.map((pos) => {
      const group = players
        .filter((p) => p.pos === pos)
        .sort((a, b) => (b.price - a.price) || (b.market - a.market) ||
          a.name.localeCompare(b.name));
      if (!group.length) return '';
      const rows = group.map((p, i) => rowHtml(
        p, i + 1, p.price,
        p.nextYear != null ? `then ${money(p.nextYear)} in '${ny}` : ''));
      return `<article class="team-card board-card">
        <div class="team-head static"><h2 class="team-name">${esc(pos)}</h2>
          <div class="team-meta">${group.length} owned</div></div>
        <div class="roster">${rows.join('')}</div>
      </article>`;
    }).join('');
  }

  if (page === 'moves') {
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const fmtDate = (d) => {
      const [, m, day] = d.split('-');
      return MONTHS[+m - 1] + ' ' + +day;
    };
    const netHtml = (n) => n > 0
      ? `<span class="delta pos">▲ +$${n}</span>`
      : `<span class="delta neg">▼ −$${Math.abs(n)}</span>`;

    const byPlayer = new Map(); // team|name -> aggregate
    (D.changeLog || []).forEach((e) => {
      const k = e.team + '|' + e.name;
      if (!byPlayer.has(k)) byPlayer.set(k, { ...e, steps: [] });
      byPlayer.get(k).steps.push(e);
    });
    const info = new Map(players.map((p) => [p.team + '|' + p.name, p]));
    const aggs = [...byPlayer.values()].map((a) => {
      a.steps.sort((x, y) => x.d.localeCompare(y.d));
      a.net = a.steps.reduce((s, e) => s + (e.to - e.from), 0);
      a.player = info.get(a.team + '|' + a.name);
      a.pos = (a.player && a.player.pos) || a.pos || 'Other';
      return a;
    }).filter((a) => a.net !== 0);

    // ---- Latest Moves: the most recent refresh day's changes (prominent) ----
    const latestEl = document.getElementById('latest');
    const allDates = [...new Set((D.changeLog || []).map((e) => e.d))].sort();
    const latestDate = allDates.length ? allDates[allDates.length - 1] : null;
    const genDate = (D.generated || '').slice(0, 10);
    if (latestDate) {
      const todays = (D.changeLog || []).filter((e) => e.d === latestDate)
        .sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from));
      const ups = todays.filter((e) => e.to > e.from).length;
      const downs = todays.length - ups;
      const fresh = latestDate === genDate && !D.locked;
      const note = fresh ? '' : (D.locked
        ? ' · <span class="latest-note">values now final</span>'
        : ` · <span class="latest-note">no change in the ${fmtDate(genDate)} refresh</span>`);
      latestEl.innerHTML = `
        <article class="team-card board-card latest-card">
          <div class="team-head static">
            <h2 class="team-name">${fresh ? "Today's Moves" : 'Latest Moves'} · ${fmtDate(latestDate)}</h2>
            <div class="team-meta">${todays.length} change${todays.length !== 1 ? 's' : ''} ·
              <span class="delta pos">${ups} up</span> · <span class="delta neg">${downs} down</span>${note}</div>
          </div>
          <div class="roster">${todays.map(dateRow).join('')}</div>
        </article>`;
    } else {
      latestEl.innerHTML = `
        <article class="team-card board-card latest-card">
          <div class="team-head static"><h2 class="team-name">Latest Moves</h2></div>
          <div class="empty-note">No price changes recorded yet — check back after the next daily refresh.</div>
        </article>`;
    }

    // feature cards: biggest riser and faller
    const featEl = document.getElementById('features');
    const risers = [...aggs].sort((x, y) => y.net - x.net);
    const featCard = (a, label, cls) => a && (cls === 'up' ? a.net > 0 : a.net < 0) ? `
      <div class="feature-card ${cls}">
        <img class="mug" src="${esc((a.player && a.player.img) || FALLBACK_IMG)}" alt=""
             onerror="this.onerror=null;this.src='${FALLBACK_IMG}'">
        <div>
          <div class="f-label">${label}</div>
          <div class="f-name">${esc(a.name)}</div>
          <div class="f-line">${netHtml(a.net)} · now ${money(a.steps[a.steps.length - 1].to)}
            · ${esc(a.team)}</div>
        </div>
      </div>` : '';
    featEl.innerHTML = aggs.length
      ? featCard(risers[0], 'Biggest riser', 'up') +
        featCard(risers[risers.length - 1], 'Biggest faller', 'down')
      : '';

    // price series across a player's moves: opening 'from' then each 'to'
    const seriesOf = (a) => [a.steps[0].from].concat(a.steps.map((e) => e.to));
    // full dated trail, for the hover tooltip
    const trailOf = (a) => a.steps.map((e) =>
      `${fmtDate(e.d)}: $${e.from}→$${e.to}`).join('  ·  ');

    function sparkline(series, positive) {
      const w = 70, h = 22, pad = 3;
      const min = Math.min(...series), max = Math.max(...series);
      const range = (max - min) || 1;
      const x = (i) => pad + (series.length === 1 ? 0 : (i / (series.length - 1)) * (w - 2 * pad));
      const y = (v) => h - pad - ((v - min) / range) * (h - 2 * pad);
      const pts = series.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
      const stroke = positive ? 'var(--good)' : 'var(--bad)';
      const lx = x(series.length - 1), ly = y(series[series.length - 1]);
      return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
        <polyline points="${pts}" fill="none" stroke="${stroke}" stroke-width="1.5"
          stroke-linejoin="round" stroke-linecap="round"/>
        <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2" fill="${stroke}"/>
      </svg>`;
    }

    function aggRow(a, i) {
      const p = a.player || {};
      const posClass = 'pos-' + a.pos.replace('/', '');
      const ti = p.ti;
      const n = a.steps.length;
      const span = n > 1
        ? `${n} moves · ${fmtDate(a.steps[0].d)}–${fmtDate(a.steps[n - 1].d)}`
        : `1 move · ${fmtDate(a.steps[0].d)}`;
      return `<div class="prow static">
        <span class="rank">${i + 1}</span>
        <img class="mug" src="${esc(p.img || FALLBACK_IMG)}" alt="" loading="lazy"
             onerror="this.onerror=null;this.src='${FALLBACK_IMG}'">
        <div class="pinfo">
          <div class="pname">${esc(a.name)}</div>
          <div class="psub">
            <span class="pos ${posClass}">${esc(a.pos)}</span>
            ${ti != null ? `<a class="teamtag" href="./#team-${ti}">
              <i class="teamdot" style="background:${TEAM_COLORS[ti % 10]}"></i>${esc(a.team)}</a>`
              : `<span class="teamtag">${esc(a.team)}</span>`}
          </div>
          <div class="trail" title="${esc(trailOf(a))}">${span}</div>
        </div>
        <div class="sparkwrap">${sparkline(seriesOf(a), a.net > 0)}</div>
        <div class="pkeep">
          <div class="pprice"><span class="amount">${money(a.steps[a.steps.length - 1].to)}</span></div>
          <div class="pnext">${netHtml(a.net)}</div>
        </div>
      </div>`;
    }

    function dateRow(e, i) {
      const p = info.get(e.team + '|' + e.name) || {};
      const pos = p.pos || e.pos || 'Other';
      const posClass = 'pos-' + pos.replace('/', '');
      return `<div class="prow static">
        <span class="rank">${i + 1}</span>
        <img class="mug" src="${esc(p.img || FALLBACK_IMG)}" alt="" loading="lazy"
             onerror="this.onerror=null;this.src='${FALLBACK_IMG}'">
        <div class="pinfo">
          <div class="pname">${esc(e.name)}</div>
          <div class="psub">
            <span class="pos ${posClass}">${esc(pos)}</span>
            ${p.ti != null ? `<a class="teamtag" href="./#team-${p.ti}">
              <i class="teamdot" style="background:${TEAM_COLORS[p.ti % 10]}"></i>${esc(e.team)}</a>`
              : `<span class="teamtag">${esc(e.team)}</span>`}
          </div>
        </div>
        <div class="pkeep">
          <div class="pprice"><span class="amount">$${e.from} → $${e.to}</span></div>
          <div class="pnext">${netHtml(e.to - e.from)}</div>
        </div>
      </div>`;
    }

    let group = localStorage.getItem('sf-moves-group') === 'date' ? 'date' : 'position';
    function render() {
      if (!aggs.length) {
        main.innerHTML = `<article class="team-card board-card"><div class="empty-note">
          No price changes yet — check back after the next daily refresh.</div></article>`;
      } else if (group === 'position') {
        main.innerHTML = POS_ORDER.concat('Other').map((pos) => {
          const g = aggs.filter((a) => a.pos === pos)
            .sort((x, y) => Math.abs(y.net) - Math.abs(x.net));
          if (!g.length) return '';
          return `<article class="team-card board-card">
            <div class="team-head static"><h2 class="team-name">${esc(pos)}</h2>
              <div class="team-meta">${g.length} player${g.length > 1 ? 's' : ''} moved</div></div>
            <div class="roster">${g.map(aggRow).join('')}</div>
          </article>`;
        }).join('');
      } else {
        const dates = [...new Set((D.changeLog || []).map((e) => e.d))].sort().reverse();
        main.innerHTML = dates.map((d) => {
          const g = (D.changeLog || []).filter((e) => e.d === d)
            .sort((x, y) => Math.abs(y.to - y.from) - Math.abs(x.to - x.from));
          return `<article class="team-card board-card">
            <div class="team-head static"><h2 class="team-name">${fmtDate(d)}</h2>
              <div class="team-meta">${g.length} move${g.length > 1 ? 's' : ''}</div></div>
            <div class="roster">${g.map(dateRow).join('')}</div>
          </article>`;
        }).join('');
      }
      document.getElementById('group-toggle').textContent = 'Group: ' + group;
    }
    document.getElementById('group-toggle').addEventListener('click', () => {
      group = group === 'position' ? 'date' : 'position';
      localStorage.setItem('sf-moves-group', group);
      render();
    });
    render();
  }

  if (page === 'adp') {
    const universe = [
      ...players.map((p) => ({ ...p, owned: true })),
      ...(D.pool || []).map((p) => ({ ...p, owned: false })),
    ];
    let group = localStorage.getItem('sf-adp-group') === 'position' ? 'position' : 'overall';
    let show = localStorage.getItem('sf-adp-show') || 'everyone';
    if (!['everyone', 'owned', 'available'].includes(show)) show = 'everyone';

    const adpRow = (p, i) => rowHtml(p, i + 1, p.market,
      p.owned ? `keep for ${money(p.price)} · ${deltaHtml(p)}` : '');

    function cardHtml(title, list) {
      return `<article class="team-card board-card">
        <div class="team-head static"><h2 class="team-name">${esc(title)}</h2>
          <div class="team-meta">${list.length} players · by ESPN ADP</div></div>
        <div class="roster">${list.map(adpRow).join('')}</div>
      </article>`;
    }

    function render() {
      const list = universe
        .filter((p) => show === 'everyone' ||
          (show === 'owned' ? p.owned : !p.owned))
        .sort((a, b) => (b.market - a.market) ||
          ((b.price || 0) - (a.price || 0)) || a.name.localeCompare(b.name));
      main.innerHTML = group === 'overall'
        ? cardHtml('Overall', list)
        : POS_ORDER.map((pos) => {
            const g = list.filter((p) => p.pos === pos);
            return g.length ? cardHtml(pos, g) : '';
          }).join('');
      document.getElementById('group-toggle').textContent = 'Group: ' + group;
      document.getElementById('show-toggle').textContent = 'Show: ' + show;
    }

    document.getElementById('group-toggle').addEventListener('click', () => {
      group = group === 'overall' ? 'position' : 'overall';
      localStorage.setItem('sf-adp-group', group);
      render();
    });
    document.getElementById('show-toggle').addEventListener('click', () => {
      show = show === 'everyone' ? 'owned' : show === 'owned' ? 'available' : 'everyone';
      localStorage.setItem('sf-adp-show', show);
      render();
    });
    render();
  }

  if (page === 'rosters') {
    const H = window.LEAGUE_HISTORY || { seasons: [], byYear: {} };
    const sel = document.getElementById('year-select');
    if (!H.seasons.length) {
      main.innerHTML = `<article class="team-card board-card"><div class="empty-note">
        No past-season rosters found.</div></article>`;
      return;
    }
    sel.innerHTML = H.seasons.map((y) => `<option value="${y}">${y}</option>`).join('');
    let year = localStorage.getItem('sf-rosters-year');
    if (!H.seasons.map(String).includes(year)) year = String(H.seasons[0]);
    sel.value = year;

    function histRow(p, i) {
      const posClass = 'pos-' + String(p.pos || '').replace('/', '');
      // headline = that season's keeper value; subline = original draft cost
      const val = p.price != null ? money(p.price) : '—';
      const sub = p.draftCost != null ? `draft ${money(p.draftCost)}` : '';
      return `<div class="prow static nomug">
        <span class="rank">${i + 1}</span>
        <div class="pinfo">
          <div class="pname">${esc(p.name)}</div>
          <div class="psub">
            <span class="pos ${posClass}">${esc(p.pos || '—')}</span>
            <span class="badge acq">${esc(p.acquired || '—')}</span>
          </div>
        </div>
        <div class="pkeep">
          <div class="pprice"><span class="amount">${val}</span></div>
          ${sub ? `<div class="pnext">${sub}</div>` : ''}
        </div>
      </div>`;
    }

    function render() {
      const teams = H.byYear[year] || [];
      main.innerHTML = teams.map((t) => {
        const cur = (D.teams[t.slot] || {}).name;
        const color = TEAM_COLORS[t.slot % 10];
        const now = cur && cur !== t.name ? `now ${esc(cur)} · ` : '';
        return `<article class="team-card board-card" style="--tc:${color}">
          <div class="team-head static">
            <h2 class="team-name">${esc(t.name)}</h2>
            <div class="team-meta">${now}${t.players.length} player${t.players.length !== 1 ? 's' : ''}</div>
          </div>
          <div class="roster">${t.players.map(histRow).join('')}</div>
        </article>`;
      }).join('');
    }

    sel.addEventListener('change', () => {
      year = sel.value;
      localStorage.setItem('sf-rosters-year', year);
      render();
    });
    render();
  }

  if (page === 'trades') {
    const H = window.LEAGUE_HISTORY || {};
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const fmtDate = (d) => {
      const [, m, day] = String(d).split('-');
      return MONTHS[+m - 1] + ' ' + +day;
    };
    const norm = (s) => String(s).toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();

    // index every current player (+ team) by name, to price traded assets
    const pIndex = {};
    D.teams.forEach((t, ti) => t.players.forEach((p) => {
      pIndex[norm(p.name)] = { ...p, team: t.name, ti };
    }));
    (D.pool || []).forEach((p) => { if (!pIndex[norm(p.name)]) pIndex[norm(p.name)] = { ...p, price: p.market, surplus: 0 }; });

    const gradeClass = (g) => {
      const c = (g || '')[0];
      return c === 'A' ? 'g-a' : c === 'B' ? 'g-b' : c === 'C' ? 'g-c' : c ? 'g-d' : '';
    };
    const teamColor = (name) => {
      const ti = D.teams.findIndex((t) => t.name === name);
      return ti >= 0 ? TEAM_COLORS[ti % 10] : 'var(--ink-faint)';
    };
    const teamHref = (name) => {
      const ti = D.teams.findIndex((t) => t.name === name);
      return ti >= 0 ? `./#team-${ti}` : null;
    };

    function assetLine(name) {
      const p = pIndex[norm(name)];
      if (!p) return `<div class="got-item"><span class="got-name">${esc(name)}</span>
        <span class="got-sub muted">no longer rostered</span></div>`;
      const s = p.surplus;
      const surplus = s > 0 ? `<span class="delta pos">+$${s}</span>`
        : s < 0 ? `<span class="delta neg">−$${Math.abs(s)}</span>`
          : '<span class="delta zero">even</span>';
      return `<div class="got-item">
        <span class="got-name">${esc(p.name)}</span>
        <span class="got-sub">${esc(p.pos)}${p.nfl ? ' · ' + esc(p.nfl) : ''} ·
          keeper $${p.price} · mkt $${p.market} · ${surplus}</span>
      </div>`;
    }

    function sideHtml(tr, name, other) {
      const got = tr.sides[other] || {};
      const items = (got.players || []).map(assetLine);
      if (got.dollars) items.push(`<div class="got-item">
        <span class="got-dollars">$${got.dollars}</span> in ${D.season} draft budget</div>`);
      if (got.dollars2027) items.push(`<div class="got-item">
        <span class="got-dollars">$${got.dollars2027}</span> in ${D.season + 1} draft budget</div>`);
      if (!items.length) items.push('<div class="got-item muted">nothing</div>');
      const g = tr.sides[name].grade || '';
      return `<div class="trade-side">
        <div class="trade-side-head">
          <a class="teamtag"${teamHref(name) ? ` href="${teamHref(name)}"` : ''}>
            <i class="teamdot" style="background:${teamColor(name)}"></i>${esc(name)}</a>
          ${g ? `<span class="grade ${gradeClass(g)}">${esc(g)}</span>` : ''}
        </div>
        <div class="got-label">received</div>
        <div class="got-items">${items.join('')}</div>
        ${tr.sides[name].note ? `<p class="trade-note">${esc(tr.sides[name].note)}</p>` : ''}
      </div>`;
    }

    function tradeCard(tr) {
      const names = Object.keys(tr.sides);
      const body = names.length === 2
        ? sideHtml(tr, names[0], names[1]) + '<div class="trade-vs">⇄</div>' +
          sideHtml(tr, names[1], names[0])
        : `<div class="empty-note">${esc(tr.summary || '')}</div>`;
      return `<article class="team-card board-card trade-card">
        <div class="trade-head"><span class="trade-date">${fmtDate(tr.date)}</span>${esc(tr.summary || '')}</div>
        <div class="trade-body">${body}</div>
      </article>`;
    }

    const trades = (D.trades || []).slice().reverse();
    const tradesHtml = trades.length
      ? trades.map(tradeCard).join('')
      : `<article class="team-card board-card"><div class="empty-note">
          No trades yet this offseason.</div></article>`;

    const th = H.tradeHistory || [];
    const historyHtml = th.map((g, i) => `
      <details class="trade-year"${i === 0 ? ' open' : ''}>
        <summary>${g.year} Trades <span class="muted">· ${g.entries.length}</span></summary>
        <ul class="trade-log">${g.entries.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
      </details>`).join('');

    main.innerHTML = `
      <div class="section-head first"><h2 class="section-title">2026 Offseason Trades</h2></div>
      ${tradesHtml}
      ${th.length ? `<div class="section-head"><h2 class="section-title">Trade History</h2></div>
        <div class="trade-history">${historyHtml}</div>` : ''}`;
  }
})();
