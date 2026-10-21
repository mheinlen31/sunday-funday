/* Share any card as an image.
   A small Share button is added to every card header on the page. Tapping it
   renders that card -- with a Sunday Funday header and footer -- to a PNG
   (html2canvas, loaded on first use) and hands it to the phone's share sheet;
   where files cannot be shared it shows the image with a Save button instead.
   Works on every page: the cards are cloned, so nothing on the page changes. */
(function () {
  var LIB = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
  var HEADS = '.team-card > .dh-head, .team-card > .team-head, .team-card > .trade-head, .pc-card > .pc-head';
  var MAX_ROWS = 25;           // long tables are cut here in the image
  var WIDTH = 760;             // layout width of the image, drawn at 2x

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function text(sel) { var el = document.querySelector(sel); return el ? el.textContent.trim() : ''; }

  /* ---------- the button on every card ---------- */
  function scan() {
    document.querySelectorAll(HEADS).forEach(function (h) {
      var card = h.parentElement;
      if (card.classList.contains('sm-head') || h.querySelector('.sh-btn')) return;   // the summary head has its own share
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'sh-btn'; b.textContent = 'Share'; b.title = 'Share this card as an image';
      var meta = h.querySelector('.team-meta');
      (meta || h).appendChild(b);
    });
  }
  var pending = false;
  function schedule() { if (pending) return; pending = true; requestAnimationFrame(function () { pending = false; scan(); }); }
  if (document.body) { scan(); new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true }); }
  else document.addEventListener('DOMContentLoaded', function () { scan(); new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true }); });

  document.addEventListener('click', function (e) {
    var b = e.target.closest('.sh-btn');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();          // the header underneath may toggle the card
    shareCard(b.closest('.team-card, .pc-card'), b);
  }, true);

  /* ---------- what the image says about where it came from ---------- */
  function context() {
    var parts = [text('.deck')];
    var team = document.querySelector('#rt-team'); if (team && team.value !== 'all') parts.push(team.options[team.selectedIndex].textContent);
    var year = document.querySelector('#dh-year'); if (year) parts.push(year.options[year.selectedIndex].textContent);
    var view = text('.dh-view.on'); if (view) parts.push(view);
    document.querySelectorAll('.dh-controls .dh-chip.on').forEach(function (c) { parts.push(c.textContent); });
    var wk = (text('#rt-updated').match(/week\s+(\d+)/i) || [])[1]; if (wk) parts.push('Week ' + wk);
    return parts.filter(Boolean).join(' · ');
  }
  function title(card) {
    var h = card.querySelector('.dh-head h2, .team-name, .trade-head, .ledger-team, .pc-name');
    return h ? h.textContent.replace(/\s+/g, ' ').trim() : 'card';
  }
  function fileName(card) {
    var wk = (text('#rt-updated').match(/week\s+(\d+)/i) || [])[1];
    return 'sunday-funday-' + title(card).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) + (wk ? '-week-' + wk : '') + '.png';
  }

  /* ---------- the clone: no controls, open, trimmed ---------- */
  function prep(clone) {
    var ctl = clone.querySelector('.rt-ctl');
    if (ctl) {                                       // the stats filters become a line in the header
      var on = [].map.call(ctl.querySelectorAll('.dh-chip.on'), function (c) { return c.textContent.trim(); })
        .filter(function (t) { return !/^(All|Rostered|Points|Waiver wire)$/.test(t); });
      var sub = clone.querySelector('.dh-head .dh-sub');
      if (on.length && sub) sub.textContent = sub.textContent + ' · ' + on.join(' · ');
      var p = ctl.parentElement; ctl.remove();
      if (p && !p.textContent.trim() && !p.children.length) p.remove();
    }
    clone.querySelectorAll('.sh-btn, .sm-actions, .rt-copy, .favstar, .rt-star, .caret, .rt-caret, .team-meta .copy, .team-meta .reset, .pc-x, [hidden]').forEach(function (x) { x.remove(); });
    clone.classList.remove('collapsed', 'mine', 'fav');
    clone.querySelectorAll('select').forEach(function (s) {
      var o = s.options[s.selectedIndex], b = document.createElement('b'); b.textContent = o ? o.textContent : ''; s.parentNode.replaceChild(b, s);
    });
    clone.querySelectorAll('tbody').forEach(function (tb) {
      if (tb.rows.length <= MAX_ROWS + 5) return;
      var more = tb.rows.length - MAX_ROWS;
      while (tb.rows.length > MAX_ROWS) tb.deleteRow(MAX_ROWS);
      var td = tb.insertRow().insertCell(); td.colSpan = 20; td.className = 'empty-note'; td.textContent = '… and ' + more + ' more on the site';
    });
    clone.querySelectorAll('table').forEach(function (t) {           // a wide table keeps one line per row
      if (t.querySelectorAll('thead th').length >= 9) t.querySelectorAll('td.dh-name small').forEach(function (x) { x.remove(); });
    });
    clone.querySelectorAll('img').forEach(function (im) { im.removeAttribute('loading'); });
    clone.querySelectorAll('[title]').forEach(function (x) { x.removeAttribute('title'); });
  }
  function wide(card) { return [].some.call(card.querySelectorAll('table'), function (t) { return t.querySelectorAll('thead th').length >= 9; }); }
  function buildStage(card) {
    var st = document.createElement('div'); st.className = 'share-stage'; st.style.width = (wide(card) ? 960 : WIDTH) + 'px';
    var brand = document.createElement('div'); brand.className = 'share-brand';
    brand.innerHTML = '<div class="share-k">' + esc(context()) + '</div><div class="share-wm">Sunday Funday</div>';
    var main = card.closest('main'), wrap = document.createElement('div');
    wrap.className = 'share-body ' + (main ? main.className : '');
    var clone = card.cloneNode(true); prep(clone); wrap.appendChild(clone);
    var foot = document.createElement('div'); foot.className = 'share-foot';
    foot.innerHTML = '<span>mheinlen31.github.io/sunday-funday</span><span>' + esc(new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })) + '</span>';
    st.appendChild(brand); st.appendChild(wrap); st.appendChild(foot);
    document.body.appendChild(st);
    return st;
  }
  function waitImages(root) {
    var imgs = [].filter.call(root.querySelectorAll('img'), function (i) { return !i.complete; });
    if (!imgs.length) return Promise.resolve();
    return new Promise(function (res) {
      var n = imgs.length, t = setTimeout(res, 2500);
      function one() { if (--n <= 0) { clearTimeout(t); res(); } }
      imgs.forEach(function (i) { i.addEventListener('load', one); i.addEventListener('error', one); });
    });
  }

  /* ---------- drawing ---------- */
  var libP = null;
  function load() {
    if (window.html2canvas) return Promise.resolve();
    if (libP) return libP;
    libP = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = LIB; s.onload = res;
      s.onerror = function () { libP = null; rej(new Error('html2canvas did not load')); };
      document.head.appendChild(s);
    });
    return libP;
  }
  function capture(card) {
    return load().then(function () {
      var st = buildStage(card);
      return waitImages(st).then(function () {
        return html2canvas(st, {
          scale: 2, useCORS: true, logging: false, backgroundColor: '#f3f4f1',
          windowWidth: 1200, windowHeight: 900, scrollX: 0, scrollY: 0,
          onclone: function (doc) { var s = doc.querySelector('.share-stage'); if (s) { s.style.clipPath = 'none'; s.style.zIndex = '1'; } }
        });
      }).then(function (c) { st.remove(); return c; }, function (err) { st.remove(); throw err; });
    });
  }
  function shareFile(file) {
    return navigator.share({ files: [file], title: 'Sunday Funday' });
  }
  function canShare(file) { return !!(navigator.canShare && navigator.canShare({ files: [file] })) && !/share=preview/.test(location.search); }
  function preview(blob, file) {
    var url = URL.createObjectURL(blob), ov = document.createElement('div'), share = canShare(file);
    ov.className = 'sm-overlay';
    ov.innerHTML = '<div class="sm-sheet"><img src="' + url + '" alt="' + esc(file.name) + '"><div class="sm-sheet-bar">' +
      (share ? '<button class="dh-chip on sh-share" type="button">Share</button>' : '') +
      '<a class="dh-chip' + (share ? '' : ' on') + '" download="' + esc(file.name) + '" href="' + url + '">Save image</a>' +
      '<button class="dh-chip sh-close" type="button">Close</button></div></div>';
    ov.addEventListener('click', function (e) {
      if (e.target.closest('.sh-share')) { shareFile(file).catch(function () {}); return; }
      if (e.target === ov || e.target.closest('.sh-close')) { ov.remove(); URL.revokeObjectURL(url); }
    });
    document.body.appendChild(ov);
  }
  function shareCard(card, btn) {
    if (!card || btn.disabled) return;
    var label = btn.textContent;
    btn.textContent = 'Drawing…'; btn.classList.add('busy'); btn.disabled = true;
    function done() { btn.textContent = label; btn.classList.remove('busy'); btn.disabled = false; }
    capture(card).then(function (canvas) {
      canvas.toBlob(function (blob) {
        done();
        if (!blob) return;
        var file = new File([blob], fileName(card), { type: 'image/png' });
        if (canShare(file)) {
          // the share sheet needs a fresh tap on some phones once drawing has taken a moment -- fall back to the preview
          shareFile(file).catch(function (err) { if (!err || err.name !== 'AbortError') preview(blob, file); });
        } else preview(blob, file);
      }, 'image/png');
    }).catch(function (err) {
      done(); btn.textContent = 'Could not draw it'; setTimeout(function () { btn.textContent = label; }, 2200);
      if (window.console) console.error(err);
    });
  }
  window.SFShare = { capture: capture, preview: preview, scan: scan };
})();
