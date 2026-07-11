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
    return `<div class="prow static">
      <span class="rank">${rank}</span>
      <img class="mug" src="${esc(p.img || FALLBACK_IMG)}" alt="" loading="lazy"
           onerror="this.onerror=null;this.src='${FALLBACK_IMG}'">
      <div class="pinfo">
        <div class="pname">${esc(p.name)}</div>
        <div class="psub">
          <span class="pos ${posClass}">${esc(p.pos)}</span>
          <a class="teamtag" href="./#team-${p.ti}">
            <i class="teamdot" style="background:${TEAM_COLORS[p.ti % 10]}"></i>${esc(p.team)}</a>
          <span class="badge acq">${esc(p.acquired)}</span>
        </div>
      </div>
      <div class="pcontract">${page === 'adp' ? deltaHtml(p) : contractHtml(p)}</div>
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

  if (page === 'adp') {
    const list = [...players].sort((a, b) => (b.market - a.market) ||
      (b.price - a.price) || a.name.localeCompare(b.name));
    const rows = list.map((p, i) => rowHtml(
      p, i + 1, p.market, `keep for ${money(p.price)}`));
    main.innerHTML = `<article class="team-card board-card">
      <div class="team-head static"><h2 class="team-name">All Owned Players</h2>
        <div class="team-meta">${list.length} players · by ESPN ADP</div></div>
      <div class="roster">${rows.join('')}</div>
    </article>`;
  }
})();
