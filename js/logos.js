/* Team logos — one flat vector badge per franchise, drawn from the name.
   Self-contained SVG so the same mark renders identically on all three sites
   with no extra requests; badge colour is the team's palette colour. Keyed by
   CURRENT team name. TEAM_LOGOS.html(name, px) -> svg string ('' if unknown). */
window.TEAM_LOGOS = (function () {
  const W = '#ffffff', GOLD = '#ffc94a';
  const L = {
    // a pugio is a Roman dagger
    'Silent Pugios': { c: '#0d5c3f', m: `
      <circle cx="32" cy="12" r="3.2" fill="${W}"/>
      <rect x="30" y="14" width="4" height="8" rx="1" fill="${W}"/>
      <rect x="21" y="22" width="22" height="4" rx="1.6" fill="${W}"/>
      <path d="M27 26h10l-2.6 18L32 54l-2.4-10z" fill="${W}"/>
      <path d="M32 28v22" stroke="#0d5c3f" stroke-width="1.2"/>` },
    // a rat in a wizard's hat, with a little sparkle
    'Magic Rats': { c: '#8a1f1b', m: `
      <circle cx="21" cy="30" r="6" fill="${W}"/><circle cx="43" cy="30" r="6" fill="${W}"/>
      <circle cx="32" cy="37" r="11" fill="${W}"/>
      <path d="M32 6L20 27h24z" fill="${W}" stroke="#8a1f1b" stroke-width="1.5" stroke-linejoin="round"/>
      <rect x="16" y="25" width="32" height="4" rx="2" fill="${W}" stroke="#8a1f1b" stroke-width="1.2"/>
      <circle cx="28" cy="37" r="1.6" fill="#8a1f1b"/><circle cx="36" cy="37" r="1.6" fill="#8a1f1b"/>
      <circle cx="32" cy="42" r="1.8" fill="#8a1f1b"/>
      <path d="M22 43l7 .8M42 43l-7 .8" stroke="#8a1f1b" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M13 10l1.2 3.8L18 15l-3.8 1.2L13 20l-1.2-3.8L8 15l3.8-1.2z" fill="${GOLD}"/>
      <path d="M51 12l.9 2.8 2.8.9-2.8.9-.9 2.8-.9-2.8-2.8-.9 2.8-.9z" fill="${GOLD}"/>` },
    // the Rolling Stone writer: a vintage broadcast mic
    'Ben Fong Torres': { c: '#1f5fa8', m: `
      <rect x="23" y="10" width="18" height="24" rx="9" fill="${W}"/>
      <path d="M26 17h12M26 22h12M26 27h12" stroke="#1f5fa8" stroke-width="1.6" stroke-linecap="round"/>
      <rect x="29" y="34" width="6" height="10" fill="${W}"/>
      <path d="M18 52q14-10 28 0" stroke="${W}" stroke-width="4" fill="none" stroke-linecap="round"/>
      <rect x="20" y="50" width="24" height="4" rx="2" fill="${W}"/>` },
    // the tiki platter with the flame in the middle
    'The Pu Pu Platters': { c: '#b08d2f', m: `
      <ellipse cx="32" cy="45" rx="21" ry="6.5" fill="${W}"/>
      <ellipse cx="32" cy="45" rx="16" ry="3.8" fill="rgba(0,0,0,.14)"/>
      <path d="M32 13c-8 10-7 18 0 25 7-7 8-15 0-25z" fill="${GOLD}"/>
      <path d="M32 24c-3 5-2.5 9 0 11.5 2.5-2.5 3-6.5 0-11.5z" fill="#f06a3b"/>
      <path d="M15 34l11 9M49 34l-11 9" stroke="${W}" stroke-width="2.6" stroke-linecap="round"/>
      <circle cx="15" cy="34" r="2.2" fill="${W}"/><circle cx="49" cy="34" r="2.2" fill="${W}"/>` },
    'Paw': { c: '#5b3a8c', m: `
      <ellipse cx="32" cy="41" rx="10.5" ry="8.5" fill="${W}"/>
      <circle cx="18" cy="31" r="4.8" fill="${W}"/><circle cx="26" cy="22" r="4.8" fill="${W}"/>
      <circle cx="38" cy="22" r="4.8" fill="${W}"/><circle cx="46" cy="31" r="4.8" fill="${W}"/>` },
    // a fresh pepper... say when: the grinder
    'AFRESHAYPEPPER ASAYWHEN': { c: '#0f7b8a', m: `
      <rect x="28" y="10" width="8" height="5" rx="2" fill="${W}"/>
      <path d="M36 12.5h8" stroke="${W}" stroke-width="2.6" stroke-linecap="round"/><circle cx="45" cy="12.5" r="2.4" fill="${W}"/>
      <rect x="24" y="15" width="16" height="9" rx="3" fill="${W}"/>
      <path d="M25 24h14l-2 10 2 18H25l2-18z" fill="${W}"/>
      <path d="M27.5 41h9" stroke="rgba(0,0,0,.22)" stroke-width="1.5"/>
      <circle cx="45" cy="50" r="1.5" fill="${W}"/><circle cx="49" cy="53.5" r="1.5" fill="${W}"/><circle cx="43" cy="54.5" r="1.5" fill="${W}"/>` },
    // centers up: the ball, snapped
    'Centersup': { c: '#c05a17', m: `
      <path d="M22 16l10-8 10 8" stroke="${W}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M23 23l9-7 9 7" stroke="rgba(255,255,255,.55)" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <ellipse cx="32" cy="41" rx="17.5" ry="10.5" fill="${W}"/>
      <path d="M25 41h14" stroke="#c05a17" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M28 38v6M32 38v6M36 38v6" stroke="#c05a17" stroke-width="2" stroke-linecap="round"/>` },
    'Juice': { c: '#3d6d1f', m: `
      <path d="M22.5 30h19l-1.5 17.5H24z" fill="#f5a623"/>
      <path d="M20 18h24l-3 32H23z" fill="rgba(255,255,255,.28)" stroke="${W}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M39 11l-8 35" stroke="${W}" stroke-width="3.4" stroke-linecap="round"/>
      <circle cx="45" cy="21" r="6" fill="#f5a623" stroke="${W}" stroke-width="2"/>
      <path d="M45 15v12M39 21h12" stroke="${W}" stroke-width="1.2"/>` },
    'Chance': { c: '#7d2f52', m: `
      <g transform="rotate(-14 26 36)">
        <rect x="14" y="25" width="22" height="22" rx="4" fill="${W}"/>
        <circle cx="20" cy="31" r="2" fill="#7d2f52"/><circle cx="30" cy="31" r="2" fill="#7d2f52"/>
        <circle cx="25" cy="36" r="2" fill="#7d2f52"/>
        <circle cx="20" cy="41" r="2" fill="#7d2f52"/><circle cx="30" cy="41" r="2" fill="#7d2f52"/>
      </g>
      <g transform="rotate(12 40 30)">
        <rect x="30" y="18" width="20" height="20" rx="4" fill="${W}" stroke="#7d2f52" stroke-width="1.5"/>
        <circle cx="35" cy="23" r="1.8" fill="#7d2f52"/><circle cx="45" cy="23" r="1.8" fill="#7d2f52"/>
        <circle cx="35" cy="33" r="1.8" fill="#7d2f52"/><circle cx="45" cy="33" r="1.8" fill="#7d2f52"/>
      </g>` },
    // House Bom: a roof over a bomb with the fuse lit
    'House Bom': { c: '#444a56', m: `
      <path d="M12 30L32 12l20 18" stroke="${W}" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="29.5" y="25" width="5" height="6" fill="${W}"/>
      <circle cx="32" cy="41" r="11.5" fill="${W}"/>
      <circle cx="28" cy="37" r="2.6" fill="rgba(0,0,0,.12)"/>
      <path d="M33 25q7-4 9-10" stroke="${W}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <path d="M43 9l1.1 3.4 3.4 1.1-3.4 1.1L43 18l-1.1-3.4-3.4-1.1 3.4-1.1z" fill="${GOLD}"/>` },
  };
  function html(name, px) {
    const t = L[name]; if (!t) return '';
    return `<svg class="tlogo" width="${px}" height="${px}" viewBox="0 0 64 64" aria-hidden="true" focusable="false">` +
      `<circle cx="32" cy="32" r="30" fill="${t.c}"/>` +
      `<circle cx="32" cy="32" r="27" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="1.5"/>${t.m}</svg>`;
  }
  return { html, has: (n) => !!L[n], color: (n) => (L[n] || {}).c || null, names: Object.keys(L) };
})();
