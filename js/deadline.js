/* Keeper-deadline countdown, shown in the masthead of every page.
   Deadline: September 4, 2026, 7:00 PM Central (CDT = UTC-5) -> 2026-09-05T00:00Z. */
(function () {
  var el = document.getElementById('deadline');
  if (!el) return;
  var target = new Date('2026-09-05T00:00:00Z');

  function tick() {
    var ms = target - new Date();
    if (ms <= 0) {
      el.className = 'deadline passed';
      el.innerHTML = 'Keeper deadline has passed';
      return;
    }
    var days = Math.floor(ms / 86400000);
    var hrs = Math.floor((ms % 86400000) / 3600000);
    var mins = Math.floor((ms % 3600000) / 60000);
    var left;
    if (days >= 2) left = days + ' days';
    else if (days >= 1) left = '1 day, ' + hrs + ' hr';
    else if (hrs >= 1) left = hrs + ' hr, ' + mins + ' min';
    else left = mins + ' min';
    el.className = 'deadline' + (days < 3 ? ' urgent' : '');
    el.innerHTML = 'Keeper deadline <strong>Sept 4, 7:00 PM</strong> · ' +
      '<span class="dl-count">' + left + ' to go</span>';
  }
  tick();
  setInterval(tick, 30000);
})();
