/* On the Block — a live shared trade-shopping board.
   Reuses the existing pandy-open-2026 Realtime Database (anonymous auth); the
   board lives in its own room under trips/, which the existing rules cover.
   Local-safe: if Firebase can't be reached the page shows an offline notice. */
(function () {
  const D = window.LEAGUE_DATA;
  const BLOCK = window.SundayBlock;
  if (!D || !BLOCK) return;

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const money = (v) => (v == null ? "—" : "$" + v);
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
  const TEAM_COLORS = ["#0d5c3f", "#8a1f1b", "#1f5fa8", "#b08d2f", "#5b3a8c",
    "#0f7b8a", "#c05a17", "#3d6d1f", "#7d2f52", "#444a56"];

  // masthead
  document.getElementById("season").textContent = D.season;
  document.getElementById("updated").textContent =
    new Date(D.generated).toLocaleString(undefined, {
      month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
    });

  // player lookup for live values
  const pIndex = {};
  D.teams.forEach((t, ti) => t.players.forEach((p) => {
    pIndex[norm(p.name)] = { ...p, team: t.name, ti };
  }));
  const teamColor = (name) => {
    const ti = D.teams.findIndex((t) => t.name === name);
    return ti >= 0 ? TEAM_COLORS[ti % 10] : "var(--ink-faint)";
  };
  const teamHref = (name) => {
    const ti = D.teams.findIndex((t) => t.name === name);
    return ti >= 0 ? `./#team-${ti}` : null;
  };

  // ---- post form ----
  const teamSel = document.getElementById("block-team");
  const playerSel = document.getElementById("block-player");
  const noteInput = document.getElementById("block-note");
  const postBtn = document.getElementById("block-post");
  const statusEl = document.getElementById("block-status");
  const board = document.getElementById("block-board");

  teamSel.innerHTML = '<option value="">Your team…</option>' +
    D.teams.map((t, ti) => `<option value="${ti}">${esc(t.name)}</option>`).join("");
  function fillPlayers() {
    const ti = teamSel.value;
    if (ti === "") { playerSel.innerHTML = '<option value="">Pick your team first…</option>'; return; }
    playerSel.innerHTML = '<option value="">Player you\'re shopping…</option>' +
      D.teams[+ti].players.map((p) =>
        `<option value="${esc(p.name)}">${esc(p.name)} · ${esc(p.pos)}</option>`).join("");
  }
  teamSel.addEventListener("change", fillPlayers);
  // pre-fill "your team" from the my-team star set on the Teams page
  const fav = localStorage.getItem("sf-fav-" + D.season);
  if (fav !== null && D.teams[+fav]) { teamSel.value = fav; fillPlayers(); }

  const relTime = (ts) => {
    if (!ts) return "";
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    return Math.floor(s / 86400) + "d ago";
  };

  function entryHtml(e) {
    const p = pIndex[norm(e.player)];
    const posClass = "pos-" + String((p && p.pos) || e.pos || "").replace("/", "");
    const val = p
      ? `keeper ${money(p.price)} · mkt ${money(p.market)}${p.nfl ? " · " + esc(p.nfl) : ""}`
      : "";
    return `<div class="block-entry">
      <div class="be-main">
        <span class="be-name">${esc(e.player)}</span>
        <span class="pos ${posClass}">${esc((p && p.pos) || e.pos || "")}</span>
      </div>
      ${val ? `<div class="be-val">${val}</div>` : ""}
      ${e.note ? `<div class="be-note">"${esc(e.note)}"</div>` : ""}
      <div class="be-foot">
        <span class="be-time">${relTime(e.ts)}</span>
        <button class="be-remove" data-id="${esc(e.id)}" type="button" title="Remove listing">✕</button>
      </div>
    </div>`;
  }

  function render(obj) {
    const entries = Object.entries(obj || {}).map(([id, v]) => ({ id, ...v }));
    if (!entries.length) {
      board.innerHTML = `<article class="team-card board-card"><div class="empty-note">
        Nobody's shopping anyone yet — be the first to put a guy on the block.</div></article>`;
      return;
    }
    // group by team, most-recently-updated team first
    const byTeam = {};
    entries.forEach((e) => { (byTeam[e.team] = byTeam[e.team] || []).push(e); });
    const teamsSorted = Object.keys(byTeam).sort((a, b) =>
      Math.max(...byTeam[b].map((e) => e.ts || 0)) - Math.max(...byTeam[a].map((e) => e.ts || 0)));
    board.innerHTML = teamsSorted.map((team) => {
      const list = byTeam[team].sort((a, b) => (b.ts || 0) - (a.ts || 0));
      const href = teamHref(team);
      return `<article class="team-card board-card" style="--tc:${teamColor(team)}">
        <div class="team-head static">
          <h2 class="team-name">
            <a class="teamtag"${href ? ` href="${href}"` : ""}>
              <i class="teamdot" style="background:${teamColor(team)}"></i>${esc(team)}</a>
          </h2>
          <div class="team-meta">${list.length} on the block</div>
        </div>
        <div class="block-entries">${list.map(entryHtml).join("")}</div>
      </article>`;
    }).join("");
  }

  // A listing dies the moment its player changes hands: the board advertises
  // who's available FROM a team, so once he's been traded the post is stale.
  // Removed from Firebase rather than just hidden, so it clears for everyone.
  // Nothing happens until the trade actually lands in data.js — while the site
  // still shows him on the old roster the listing matches and survives.
  function reconcile(entries) {
    // never prune against an empty or failed data load, or one bad refresh
    // would wipe the whole board
    if (Object.keys(pIndex).length < 50) return entries;
    const live = [], stale = [];
    entries.forEach((e) => {
      const p = pIndex[norm(e.player)];
      (p && p.team === e.team ? live : stale).push(e);
    });
    stale.forEach((e) => BLOCK.remove(e.id));
    return live;
  }

  // Keepers are in, so nothing can be traded: the board is closed and cleared.
  if (D.keepersLocked) {
    document.querySelector(".block-post-wrap").hidden = true;
    statusEl.className = "block-status off";
    statusEl.textContent = "Trading closed";
    board.innerHTML = `<article class="team-card board-card"><div class="empty-note">
      Trading is closed for ${D.season} — keepers are in and rosters are final. The board
      has been cleared. See the <a href="pool.html">Draft Pool</a> for who's up at the
      auction on Monday.</div></article>`;
    return;
  }

  render({}); // initial empty state until Firebase connects

  // ---- live board via the shared module ----
  let current = {};
  BLOCK.subscribe((entries) => {
    current = reconcile(entries);
    statusEl.className = "block-status live";
    statusEl.textContent = "● Live";
    render(Object.fromEntries(current.map((e) => [e.id, e])));
  }).catch((e) => {
    statusEl.className = "block-status off";
    statusEl.textContent = "○ Offline";
    board.innerHTML = `<article class="team-card board-card"><div class="empty-note">
      Can't reach the live board right now — check your connection and reload.
      ${esc(e && (e.code || e.message) || "")}</div></article>`;
  });

  postBtn.addEventListener("click", () => {
    const ti = teamSel.value;
    const player = playerSel.value;
    if (ti === "" || !player) {
      (ti === "" ? teamSel : playerSel).focus();
      return;
    }
    const team = D.teams[+ti].name;
    if (current.some((e) => e.team === team && e.player === player)) {
      postBtn.textContent = "Already listed";
      setTimeout(() => { postBtn.textContent = "Put on the block"; }, 1400);
      return;
    }
    const p = D.teams[+ti].players.find((x) => x.name === player) || {};
    BLOCK.post({
      team, player, pos: p.pos || "",
      note: noteInput.value.trim().slice(0, 120),
      ts: Date.now(), uid: BLOCK.uid(),
    });
    noteInput.value = "";
    playerSel.value = "";
    postBtn.textContent = "Posted ✓";
    setTimeout(() => { postBtn.textContent = "Put on the block"; }, 1400);
  });

  board.addEventListener("click", (e) => {
    const btn = e.target.closest(".be-remove");
    if (!btn) return;
    if (!confirm("Remove this listing?")) return;
    BLOCK.remove(btn.dataset.id);
  });
})();
