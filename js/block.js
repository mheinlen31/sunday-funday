/* On the Block — a live shared trade-shopping board.
   Reuses the existing pandy-open-2026 Realtime Database (anonymous auth); the
   board lives in its own room under trips/, which the existing rules cover.
   Local-safe: if Firebase can't be reached the page shows an offline notice. */
(function () {
  const D = window.LEAGUE_DATA;
  if (!D) return;

  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyBG2oR-YOOfi_IiHBErv-rKoqJ8zfhg3Xo",
    authDomain: "pandy-open-2026.firebaseapp.com",
    databaseURL: "https://pandy-open-2026-default-rtdb.firebaseio.com",
    projectId: "pandy-open-2026",
    appId: "1:658330035817:web:1ec09298fecf05222ee4f8",
  };
  const ROOM = "sunday-funday-block-2026";
  const SDK = "https://www.gstatic.com/firebasejs/10.12.2";

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
  teamSel.addEventListener("change", () => {
    const ti = teamSel.value;
    if (ti === "") { playerSel.innerHTML = '<option value="">Pick your team first…</option>'; return; }
    playerSel.innerHTML = '<option value="">Player you\'re shopping…</option>' +
      D.teams[+ti].players.map((p) =>
        `<option value="${esc(p.name)}">${esc(p.name)} · ${esc(p.pos)}</option>`).join("");
  });

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

  render({}); // initial empty state until Firebase connects

  // ---- Firebase ----
  let dbMod, db, entriesRef, myUid = "anon";

  async function connect() {
    const [{ initializeApp }, _db, _auth] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-database.js`),
      import(`${SDK}/firebase-auth.js`),
    ]);
    dbMod = _db;
    const app = initializeApp(FIREBASE_CONFIG);
    try {
      const cred = await _auth.signInAnonymously(_auth.getAuth(app));
      myUid = cred.user.uid;
    } catch (e) { /* open rules work without it */ }
    db = dbMod.getDatabase(app);
    entriesRef = dbMod.ref(db, `trips/${ROOM}/entries`);
    dbMod.onValue(entriesRef, (snap) => render(snap.val() || {}));
    statusEl.className = "block-status live";
    statusEl.textContent = "● Live";
  }

  connect().catch((e) => {
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
    if (!entriesRef) { statusEl.textContent = "○ Not connected"; return; }
    const p = D.teams[+ti].players.find((x) => x.name === player) || {};
    dbMod.push(entriesRef, {
      team: D.teams[+ti].name,
      player, pos: p.pos || "",
      note: noteInput.value.trim().slice(0, 120),
      ts: Date.now(), uid: myUid,
    });
    noteInput.value = "";
    playerSel.value = "";
    postBtn.textContent = "Posted ✓";
    setTimeout(() => { postBtn.textContent = "Put on the block"; }, 1400);
  });

  board.addEventListener("click", (e) => {
    const btn = e.target.closest(".be-remove");
    if (!btn || !db) return;
    if (!confirm("Remove this listing?")) return;
    dbMod.remove(dbMod.ref(db, `trips/${ROOM}/entries/${btn.dataset.id}`));
  });
})();
