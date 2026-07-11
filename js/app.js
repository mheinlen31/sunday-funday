(function () {
  const D = window.LEAGUE_DATA;
  if (!D) return;

  const CAP = 100;
  const STORE_KEY = 'sf-keepers-' + D.season;
  const py = String(D.priorSeason).slice(2);
  const ny = String(D.season + 1).slice(2);
  const FALLBACK_IMG = 'https://a.espncdn.com/combiner/i?img=/i/headshots/nophoto.png&w=120&h=88';

  document.getElementById('season').textContent = D.season;
  document.getElementById('updated').textContent =
    new Date(D.generated).toLocaleString(undefined, {
      month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });

  const money = (v) => (v == null ? '—' : '$' + v);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---- keeper selections (persisted) ----
  let kept;
  try { kept = new Set(JSON.parse(localStorage.getItem(STORE_KEY) || '[]')); }
  catch { kept = new Set(); }
  const pid = (t, p) => t.name + '|' + p.name;
  const save = () => localStorage.setItem(STORE_KEY, JSON.stringify([...kept]));

  // under-contract players are committed, not chosen — they live outside the
  // clickable plan entirely (also scrub any stale ids from older versions)
  const isContract = (p) => p.status === 'contract-yr2';
  D.teams.forEach((t) => t.players.forEach((p) => {
    if (isContract(p)) kept.delete(pid(t, p));
  }));

  // which team cards are expanded (all collapsed by default)
  const OPEN_KEY = 'sf-open-' + D.season;
  let openTeams;
  try { openTeams = new Set(JSON.parse(localStorage.getItem(OPEN_KEY) || '[]')); }
  catch { openTeams = new Set(); }
  function setOpen(ti, open) {
    open ? openTeams.add(ti) : openTeams.delete(ti);
    localStorage.setItem(OPEN_KEY, JSON.stringify([...openTeams]));
    document.getElementById('team-' + ti).classList.toggle('collapsed', !open);
  }

  function deltaHtml(p) {
    const d = p.surplus;
    if (d == null) return '';
    if (d > 0) return `<span class="delta pos">+$${d}</span>`;
    if (d < 0) return `<span class="delta neg">−$${Math.abs(d)}</span>`;
    return '<span class="delta zero">even</span>';
  }

  function contractHtml(p) {
    if (isContract(p)) {
      return '<span class="badge badge-contract">Signed for \'' + String(D.season).slice(2) + '</span>';
    }
    if (p.nextYear != null) {
      return '<span class="badge badge-deal">New 2-yr contract if kept</span>';
    }
    return '';
  }

  function rowHtml(t, p, ti, pi) {
    const contract = isContract(p);
    const isKept = kept.has(pid(t, p));
    const posClass = 'pos-' + p.pos.replace('/', '');
    const img = p.img || FALLBACK_IMG;
    const cls = contract ? 'prow contract' : 'prow choosable' +
      (p.status !== 'market' ? ' locked' : '') + (isKept ? ' kept' : '');
    return `<div class="${cls}" data-ti="${ti}" data-pi="${pi}"
        ${contract ? '' : 'title="Click to add/remove from keeper plan"'}>
      <img class="mug" src="${esc(img)}" alt="" loading="lazy"
           onerror="this.onerror=null;this.src='${FALLBACK_IMG}'">
      <div class="pinfo">
        <div class="pname">${esc(p.name)}</div>
        <div class="psub">
          <span class="pos ${posClass}">${esc(p.pos)}</span>
          <span class="badge acq">${esc(p.acquired)}</span>
        </div>
        <div class="pmath">
          '${py} cost ${money(p.draftCost)} · ESPN ADP ${money(p.market)} · value ${deltaHtml(p)}
        </div>
      </div>
      <div class="pcontract">${contractHtml(p)}</div>
      <div class="pkeep">
        <div class="pprice">
          <span class="amount">${money(p.price)}</span>
          ${contract ? '<span class="lockmark">✓</span>' : '<span class="tick"></span>'}
        </div>
        ${p.nextYear != null && !contract ? `<div class="pnext">then ${money(p.nextYear)} in '${ny}</div>` : ''}
      </div>
    </div>`;
  }

  function summaryHtml(t) {
    const spend = t.players.reduce((s, p) =>
      s + (isContract(p) || kept.has(pid(t, p)) ? p.price : 0), 0);
    const over = Math.max(0, spend - CAP);
    const tax = over * 2;
    const purse = t.purse;
    const left = purse != null ? Math.round((purse - spend - tax) * 10) / 10 : null;
    const spendR = Math.round(spend * 10) / 10;
    return `
      <span class="stat"><strong class="${spend > CAP ? 'over' : ''}">$${spendR}</strong> / $${CAP} cap</span>
      ${tax ? `<span class="stat tax">tax <strong class="over">$${tax}</strong></span>` : ''}
      ${left != null ? `<span class="stat">draft budget <strong>$${left}</strong> of $${purse}</span>` : ''}
      <a class="copy" href="#">copy plan</a>
      <a class="reset" href="#">clear</a>`;
  }

  function planText(t) {
    const rows = t.players
      .filter((p) => isContract(p) || kept.has(pid(t, p)))
      .map((p) => `• ${p.name} (${p.pos}) $${p.price}${isContract(p) ? ' — under contract' : ''}`);
    const spend = t.players.reduce((s, p) =>
      s + (isContract(p) || kept.has(pid(t, p)) ? p.price : 0), 0);
    const tax = Math.max(0, spend - CAP) * 2;
    const left = t.purse != null ? t.purse - spend - tax : null;
    let out = `${t.name} — ${D.season} keeper plan\n`;
    out += rows.length ? rows.join('\n') : '(keeping nobody)';
    out += `\nTotal: $${spend} of $${CAP} cap`;
    if (tax) out += ` · luxury tax $${tax}`;
    if (left != null) out += ` · $${left} left for the draft`;
    return out;
  }

  // display order: within position groups (or flat, in price mode) by price
  // high-to-low; ties keep the sheet's original order
  const POS_ORDER = { QB: 0, RB: 1, WR: 2, TE: 3, K: 4, 'D/ST': 5 };
  let sortMode = localStorage.getItem('sf-sort') === 'price' ? 'price' : 'position';
  function orderedIdx(t) {
    return t.players.map((_, i) => i).sort((a, b) => {
      const pa = t.players[a], pb = t.players[b];
      if (sortMode === 'position') {
        const d = (POS_ORDER[pa.pos] ?? 9) - (POS_ORDER[pb.pos] ?? 9);
        if (d) return d;
      }
      return (pb.price - pa.price) || (a - b);
    });
  }

  function rosterHtml(t, ti) {
    const plan = [];     // contract players first, then selected keepers
    const selected = [];
    const options = [];
    orderedIdx(t).forEach((pi) => {
      const p = t.players[pi];
      if (isContract(p)) plan.push(rowHtml(t, p, ti, pi));
      else if (kept.has(pid(t, p))) selected.push(rowHtml(t, p, ti, pi));
      else options.push(rowHtml(t, p, ti, pi));
    });
    plan.push(...selected);
    const planBlock = plan.length ? `
      <div class="group-label contract-label">Keeper plan</div>
      ${plan.join('')}` : '';
    return `${planBlock}
      <div class="group-label">Keeper options</div>
      ${options.join('') || '<div class="empty-note">Everyone\'s in the plan.</div>'}`;
  }

  function teamHtml(t, ti) {
    return `<article class="team-card${openTeams.has(ti) ? '' : ' collapsed'}"
        id="team-${ti}" data-ti="${ti}">
      <div class="team-head">
        <h2 class="team-name"><span class="caret"></span>${esc(t.name)}</h2>
        <div class="team-meta" id="meta-${ti}">${summaryHtml(t)}</div>
      </div>
      <div class="roster" id="roster-${ti}">${rosterHtml(t, ti)}</div>
    </article>`;
  }

  function refreshTeam(ti) {
    const t = D.teams[ti];
    document.getElementById('roster-' + ti).innerHTML = rosterHtml(t, ti);
    document.getElementById('meta-' + ti).innerHTML = summaryHtml(t);
  }

  const teamsEl = document.getElementById('teams');
  teamsEl.innerHTML = D.teams.map(teamHtml).join('');

  // team quick-nav: name + committed contract dollars; jumping opens the card
  const navEl = document.getElementById('teamnav');
  navEl.innerHTML = D.teams.map((t, ti) => {
    const committed = t.players.reduce((s, p) => s + (isContract(p) ? p.price : 0), 0);
    return `<a class="navchip" href="#team-${ti}" data-ti="${ti}">${esc(t.name)}${
      committed ? `<b>$${committed}</b>` : ''}</a>`;
  }).join('');
  navEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.navchip');
    if (chip) setOpen(+chip.dataset.ti, true);
  });

  teamsEl.addEventListener('click', (e) => {
    // header click (not the links) opens/closes the roster
    const head = e.target.closest('.team-head');
    if (head && !e.target.closest('.copy, .reset')) {
      const ti = +head.closest('.team-card').dataset.ti;
      setOpen(ti, head.closest('.team-card').classList.contains('collapsed'));
      return;
    }
    const copy = e.target.closest('.copy');
    if (copy) {
      e.preventDefault();
      const ti = +copy.closest('.team-card').dataset.ti;
      const text = planText(D.teams[ti]);
      const done = () => {
        copy.textContent = 'copied ✓';
        setTimeout(() => { copy.textContent = 'copy plan'; }, 1500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, () => { copy.textContent = 'copy failed'; });
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); }
        catch { copy.textContent = 'copy failed'; }
        ta.remove();
      }
      return;
    }
    const reset = e.target.closest('.reset');
    if (reset) {
      e.preventDefault();
      const ti = +reset.closest('.team-card').dataset.ti;
      const t = D.teams[ti];
      t.players.forEach((p) => kept.delete(pid(t, p)));
      save();
      refreshTeam(ti);
      return;
    }
    const row = e.target.closest('.prow.choosable');
    if (!row) return;
    const ti = +row.dataset.ti;
    const t = D.teams[ti];
    const p = t.players[+row.dataset.pi];
    const id = pid(t, p);
    kept.has(id) ? kept.delete(id) : kept.add(id);
    save();
    refreshTeam(ti);
  });

  // ---- sort toggle ----
  const sortBtn = document.getElementById('sort-toggle');
  const applySort = () => {
    sortBtn.textContent = 'Sort: ' + sortMode;
    D.teams.forEach((_, ti) => refreshTeam(ti));
  };
  sortBtn.addEventListener('click', () => {
    sortMode = sortMode === 'position' ? 'price' : 'position';
    localStorage.setItem('sf-sort', sortMode);
    applySort();
  });
  sortBtn.textContent = 'Sort: ' + sortMode;

  // ---- show-the-math toggle ----
  const mathBtn = document.getElementById('math-toggle');
  const setMath = (on) => {
    document.body.classList.toggle('show-math', on);
    mathBtn.textContent = on ? 'Hide the math' : 'Show the math';
    localStorage.setItem('sf-show-math', on ? '1' : '');
  };
  mathBtn.addEventListener('click', () =>
    setMath(!document.body.classList.contains('show-math')));
  setMath(!!localStorage.getItem('sf-show-math'));

  // ---- price moves (last 7 days) ----
  const movesEl = document.getElementById('moves');
  const cutoff = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const moves = (D.changeLog || [])
    .filter((m) => m.d >= cutoff)
    .sort((a, b) => b.d.localeCompare(a.d) ||
      Math.abs(b.to - b.from) - Math.abs(a.to - a.from));
  if (moves.length) {
    movesEl.innerHTML = moves.map((m) => `
      <span class="move ${m.to > m.from ? 'up' : 'down'}" title="${esc(m.team)} · ${esc(m.d)}">
        ${esc(m.name)} <b>${m.to > m.from ? '▲' : '▼'} $${m.from} → $${m.to}</b>
      </span>`).join('');
  } else {
    movesEl.innerHTML = '<span class="no-moves">No keeper-price changes in the last 7 days.</span>';
  }

  // ---- best bargains ----
  const all = D.teams.flatMap((t) =>
    t.players.map((p) => ({ ...p, team: t.name })));
  const bargains = all
    .filter((p) => p.surplus > 0)
    .sort((a, b) => b.surplus - a.surplus)
    .slice(0, 10);
  document.getElementById('bargains').innerHTML = bargains.map((p) => `
    <div class="bargain-card">
      <img class="mug" src="${esc(p.img || FALLBACK_IMG)}" alt="" loading="lazy"
           onerror="this.onerror=null;this.src='${FALLBACK_IMG}'">
      <div>
        <div class="b-name">${esc(p.name)}</div>
        <div class="b-team">${esc(p.team)}</div>
        <div class="b-line">keep ${money(p.price)} · worth ${money(p.market)} · <strong>+$${p.surplus}</strong></div>
      </div>
    </div>`).join('');
  if (!bargains.length) document.getElementById('bargains-strip').style.display = 'none';
})();
