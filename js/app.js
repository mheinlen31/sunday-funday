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
  // flag it if the daily refresh has silently stopped — but not once values
  // are locked, when a frozen (non-advancing) timestamp is expected
  if (!D.locked && Date.now() - new Date(D.generated).getTime() > 48 * 3600e3) {
    document.querySelector('.updated').insertAdjacentHTML('beforeend',
      ' <span class="stale">· refresh overdue — values may be out of date</span>');
  }

  const money = (v) => (v == null ? '—' : '$' + v);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---- keeper selections (persisted) ----
  let kept;
  try { kept = new Set(JSON.parse(localStorage.getItem(STORE_KEY) || '[]')); }
  catch { kept = new Set(); }
  const pid = (t, p) => t.name + '|' + p.name;
  const save = () => localStorage.setItem(STORE_KEY, JSON.stringify([...kept]));

  // players other owners have flagged "on the block" (live from Firebase)
  let blocked = new Map(); // "team|player" -> note
  const isBlocked = (t, p) => blocked.has(pid(t, p));

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
          ${p.nfl ? `<span class="nfl">${esc(p.nfl)}</span>` : ''}
          <span class="badge acq">${esc(p.acquired)}</span>
          ${isBlocked(t, p) ? `<span class="badge onblock" title="${esc(blocked.get(pid(t, p)) || 'On the block')}">🏷 block</span>` : ''}
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
      <a class="copy" href="#">share plan</a>
      <a class="reset" href="#">clear</a>`;
  }

  function planUrl(t, ti) {
    const picks = t.players
      .map((p, i) => (!isContract(p) && kept.has(pid(t, p))) ? i : -1)
      .filter((i) => i >= 0);
    return location.origin + location.pathname +
      '?plan=' + ti + (picks.length ? '.' + picks.join('-') : '');
  }

  function planText(t, ti) {
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
    out += `\n\nSee it: ${planUrl(t, ti)}`;
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

  // one signature color per franchise — used on the card, its nav chip,
  // and the collapsed header
  const TEAM_COLORS = ['#0d5c3f', '#8a1f1b', '#1f5fa8', '#b08d2f', '#5b3a8c',
    '#0f7b8a', '#c05a17', '#3d6d1f', '#7d2f52', '#444a56'];

  function mugRowHtml(t) {
    const stars = [...t.players].sort((a, b) => b.price - a.price).slice(0, 5);
    return `<div class="mugrow">${stars.map((p) => `
      <img class="minimug" src="${esc(p.img || FALLBACK_IMG)}" alt=""
           title="${esc(p.name)} · $${p.price}" loading="lazy"
           onerror="this.onerror=null;this.src='${FALLBACK_IMG}'">`).join('')}</div>`;
  }

  // "my team": starred team pins first and auto-opens
  const FAV_KEY = 'sf-fav-' + D.season;
  let fav = localStorage.getItem(FAV_KEY);
  fav = fav === null || isNaN(+fav) ? null : +fav;

  function teamHtml(t, ti) {
    const isFav = ti === fav;
    return `<article class="team-card${openTeams.has(ti) ? '' : ' collapsed'}${isFav ? ' fav' : ''}"
        id="team-${ti}" data-ti="${ti}" style="--tc:${TEAM_COLORS[ti % 10]}">
      <div class="team-head">
        <h2 class="team-name"><span class="caret"></span>${esc(t.name)}
          <button class="favstar" type="button"
            title="Pin as my team">${isFav ? '★' : '☆'}</button></h2>
        ${mugRowHtml(t)}
        <div class="team-meta" id="meta-${ti}">${summaryHtml(t)}</div>
      </div>
      <div class="roster" id="roster-${ti}">${rosterHtml(t, ti)}</div>
    </article>`;
  }

  function applyFav(ti) {
    fav = ti;
    if (ti === null) localStorage.removeItem(FAV_KEY);
    else localStorage.setItem(FAV_KEY, String(ti));
    document.querySelectorAll('.team-card').forEach((c) => {
      const mine = +c.dataset.ti === ti;
      c.classList.toggle('fav', mine);
      c.querySelector('.favstar').textContent = mine ? '★' : '☆';
    });
    document.querySelectorAll('.navchip[data-ti]').forEach((ch) => {
      ch.classList.toggle('fav', +ch.dataset.ti === ti);
    });
    if (ti !== null) setOpen(ti, true);
  }

  function refreshTeam(ti) {
    const t = D.teams[ti];
    document.getElementById('roster-' + ti).innerHTML = rosterHtml(t, ti);
    document.getElementById('meta-' + ti).innerHTML = summaryHtml(t);
  }

  const teamsEl = document.getElementById('teams');
  teamsEl.innerHTML = D.teams.map(teamHtml).join('');

  // jump to a team card (opening it), optionally flashing one player's row
  function jumpTo(ti, playerName) {
    setOpen(ti, true);
    const card = document.getElementById('team-' + ti);
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (!playerName) return;
    const row = [...card.querySelectorAll('.prow')].find(
      (r) => r.querySelector('.pname').textContent === playerName);
    if (row) {
      row.classList.remove('flash');
      void row.offsetWidth; // restart the animation
      row.classList.add('flash');
    }
  }

  // team quick-nav: name + committed contract dollars; jumping opens the card
  const navEl = document.getElementById('teamnav');
  navEl.innerHTML = D.teams.map((t, ti) => {
    const committed = t.players.reduce((s, p) => s + (isContract(p) ? p.price : 0), 0);
    return `<a class="navchip" href="#team-${ti}" data-ti="${ti}">
      <i class="teamdot" style="background:${TEAM_COLORS[ti % 10]}"></i>${esc(t.name)}${
      committed ? `<b>$${committed}</b>` : ''}</a>`;
  }).join('') + '<a class="navchip navchip-all" href="#" id="toggle-all"></a>';

  const toggleAll = document.getElementById('toggle-all');
  const anyCollapsed = () =>
    document.querySelectorAll('.team-card.collapsed').length > 0;
  const relabelAll = () => {
    toggleAll.textContent = anyCollapsed() ? 'open all' : 'close all';
  };
  navEl.addEventListener('click', (e) => {
    if (e.target.closest('#toggle-all')) {
      e.preventDefault();
      const open = anyCollapsed();
      D.teams.forEach((_, ti) => setOpen(ti, open));
      relabelAll();
      return;
    }
    const chip = e.target.closest('.navchip');
    if (chip) { setOpen(+chip.dataset.ti, true); relabelAll(); }
  });
  relabelAll();

  // arriving with #team-N (e.g. from the boards) opens that card
  const hashMatch = location.hash.match(/^#team-(\d+)$/);
  if (hashMatch && D.teams[+hashMatch[1]]) {
    setOpen(+hashMatch[1], true);
    relabelAll();
  }

  // my team auto-opens every visit
  if (fav !== null && D.teams[fav]) {
    applyFav(fav);
    relabelAll();
  }

  // arriving with ?plan=<ti>.<pick>-<pick> shows someone's shared keeper plan.
  // Applied in memory only — the viewer's own saved plan isn't overwritten
  // unless they start editing.
  const planParam = new URLSearchParams(location.search).get('plan');
  if (planParam) {
    const [tiStr, picksStr] = planParam.split('.');
    const ti = +tiStr;
    const t = D.teams[ti];
    if (t) {
      const picks = (picksStr || '').split('-').filter((x) => x !== '').map(Number);
      t.players.forEach((p) => kept.delete(pid(t, p)));
      picks.forEach((i) => {
        if (t.players[i] && !isContract(t.players[i])) kept.add(pid(t, t.players[i]));
      });
      refreshTeam(ti);
      setOpen(ti, true);
      relabelAll();
      const banner = document.createElement('div');
      banner.className = 'share-banner';
      banner.innerHTML = `<span>📋 Viewing <strong>${esc(t.name)}</strong>'s shared keeper plan</span>
        <a href="${location.pathname}">Back to your own view</a>`;
      teamsEl.parentNode.insertBefore(banner, teamsEl);
      document.getElementById('team-' + ti)
        .scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // ---- player search ----
  const searchIndex = D.teams.flatMap((t, ti) =>
    t.players.map((p) => ({ name: p.name, pos: p.pos, price: p.price,
      team: t.name, ti, owned: true })))
    .concat((D.pool || []).map((p) => ({ name: p.name, pos: p.pos,
      price: p.market, team: null, ti: null, owned: false })));
  const searchEl = document.getElementById('psearch');
  const resultsEl = document.getElementById('search-results');
  function hideResults() { resultsEl.hidden = true; resultsEl.innerHTML = ''; }
  searchEl.addEventListener('input', () => {
    const q = searchEl.value.trim().toLowerCase();
    if (q.length < 2) return hideResults();
    const hits = searchIndex
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 8);
    if (!hits.length) return hideResults();
    resultsEl.innerHTML = hits.map((p, i) => `
      <div class="search-hit" data-i="${searchIndex.indexOf(p)}">
        <span class="hit-name">${esc(p.name)}</span>
        <span class="hit-sub">${esc(p.pos)} · ${p.owned ? esc(p.team) : 'Available'} · $${p.price}</span>
      </div>`).join('');
    resultsEl.hidden = false;
  });
  resultsEl.addEventListener('click', (e) => {
    const hit = e.target.closest('.search-hit');
    if (!hit) return;
    const p = searchIndex[+hit.dataset.i];
    searchEl.value = '';
    hideResults();
    if (p.owned) jumpTo(p.ti, p.name);
    else window.location.href = 'adp.html';
  });
  searchEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { searchEl.value = ''; hideResults(); }
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.searchwrap')) hideResults();
  });

  teamsEl.addEventListener('click', (e) => {
    // header click (not the links) opens/closes the roster
    const star = e.target.closest('.favstar');
    if (star) {
      const ti = +star.closest('.team-card').dataset.ti;
      applyFav(fav === ti ? null : ti);
      return;
    }
    const head = e.target.closest('.team-head');
    if (head && !e.target.closest('.copy, .reset')) {
      const ti = +head.closest('.team-card').dataset.ti;
      setOpen(ti, head.closest('.team-card').classList.contains('collapsed'));
      relabelAll();
      return;
    }
    const copy = e.target.closest('.copy');
    if (copy) {
      e.preventDefault();
      const ti = +copy.closest('.team-card').dataset.ti;
      const text = planText(D.teams[ti], ti);
      const done = () => {
        copy.textContent = 'copied ✓';
        setTimeout(() => { copy.textContent = 'share plan'; }, 1500);
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
    movesEl.innerHTML = moves.map((m) => {
      const ti = D.teams.findIndex((t) => t.name === m.team);
      return `<span class="move ${m.to > m.from ? 'up' : 'down'}" data-ti="${ti}"
        data-player="${esc(m.name)}" title="${esc(m.team)} · ${esc(m.d)}">
        ${esc(m.name)} <b>${m.to > m.from ? '▲' : '▼'} $${m.from} → $${m.to}</b>
      </span>`;
    }).join('');
    movesEl.addEventListener('click', (e) => {
      const chip = e.target.closest('.move');
      if (chip && +chip.dataset.ti >= 0) jumpTo(+chip.dataset.ti, chip.dataset.player);
    });
  } else {
    movesEl.innerHTML = '<span class="no-moves">No keeper-price changes in the last 7 days.</span>';
  }

  // ---- best bargains ----
  const all = D.teams.flatMap((t, ti) =>
    t.players.map((p) => ({ ...p, team: t.name, ti })));
  const bargains = all
    .filter((p) => p.surplus > 0)
    .sort((a, b) => b.surplus - a.surplus)
    .slice(0, 10);
  const bargainsEl = document.getElementById('bargains');
  bargainsEl.innerHTML = bargains.map((p) => `
    <div class="bargain-card" data-ti="${p.ti}" data-player="${esc(p.name)}">
      <img class="mug" src="${esc(p.img || FALLBACK_IMG)}" alt="" loading="lazy"
           onerror="this.onerror=null;this.src='${FALLBACK_IMG}'">
      <div>
        <div class="b-name">${esc(p.name)}</div>
        <div class="b-team">${esc(p.team)}</div>
        <div class="b-line">keep ${money(p.price)} · worth ${money(p.market)} · <strong>+$${p.surplus}</strong></div>
      </div>
    </div>`).join('');
  bargainsEl.addEventListener('click', (e) => {
    const card = e.target.closest('.bargain-card');
    if (card) jumpTo(+card.dataset.ti, card.dataset.player);
  });
  if (!bargains.length) document.getElementById('bargains-strip').style.display = 'none';

  // ---- On the Block: live badges on rosters + home strip ----
  if (window.SundayBlock) {
    const blockStrip = document.getElementById('block-strip');
    const blockChips = document.getElementById('block-chips');
    window.SundayBlock.subscribe((entries) => {
      blocked = new Map(entries.map((e) => [e.team + '|' + e.player, e.note]));
      D.teams.forEach((_, ti) => refreshTeam(ti)); // re-render so badges update
      if (entries.length) {
        blockChips.innerHTML = entries
          .slice().sort((a, b) => (b.ts || 0) - (a.ts || 0))
          .map((e) => `<a class="block-chip" href="block.html">
            <span class="bc-player">${esc(e.player)}</span>
            <span class="bc-team">${esc(e.team)}</span>
            ${e.note ? `<span class="bc-note">"${esc(e.note)}"</span>` : ''}
          </a>`).join('');
        blockStrip.hidden = false;
      } else {
        blockStrip.hidden = true;
      }
    }).catch(() => { /* offline: no badges/strip, page works fine */ });
  }
})();
