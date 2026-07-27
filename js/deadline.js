/* Two-stage keeper countdown, shown in every page's masthead.
   Stage 1 — values lock:  Sept 2, 2026, 12:00 PM Central (CDT) = 2026-09-02T17:00Z
   Stage 2 — keeper submit: Sept 4, 2026, 7:00 PM Central (CDT) = 2026-09-05T00:00Z
   After the values lock, also rewrites the masthead line to say values are FINAL. */
(function () {
  var el = document.getElementById('deadline');
  var upd = document.querySelector('.updated');
  var LOCK = new Date('2026-09-02T17:00:00Z');
  var SUBMIT = new Date('2026-09-05T00:00:00Z');

  function fmt(ms) {
    var d = Math.floor(ms / 86400000);
    var h = Math.floor((ms % 86400000) / 3600000);
    var m = Math.floor((ms % 3600000) / 60000);
    if (d >= 2) return d + ' days';
    if (d >= 1) return '1 day, ' + h + ' hr';
    if (h >= 1) return h + ' hr, ' + m + ' min';
    return m + ' min';
  }

  function tick() {
    if (!el) return;
    var now = new Date();
    if (now < LOCK) {
      el.className = 'deadline' + (LOCK - now < 3 * 86400000 ? ' urgent' : '');
      el.innerHTML = 'Values lock <strong>Sept 2, 12 PM CT</strong> · ' +
        '<span class="dl-count">' + fmt(LOCK - now) + ' to go</span>' +
        '<span class="dl-second"> · keepers due Sept 4, 7 PM</span>';
    } else if (now < SUBMIT) {
      el.className = 'deadline urgent';
      el.innerHTML = '<span class="dl-final">Values FINAL</span> · keepers due ' +
        '<strong>Sept 4, 7 PM CT</strong> · <span class="dl-count">' +
        fmt(SUBMIT - now) + ' left</span>';
      if (upd) upd.innerHTML = 'Keeper values are <strong>FINAL</strong> as of Sept 2 · ' +
        'rosters update for trades through Sept 4';
    } else {
      el.className = 'deadline passed';
      el.innerHTML = 'Keepers are locked in — good luck this season';
      if (upd) upd.innerHTML = 'Keeper values final · keepers submitted';
    }
  }
  tick();
  setInterval(tick, 30000);
})();
