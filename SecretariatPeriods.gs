/**
 * ============================================================
 * TEMPOH LAPORAN - DASHBOARD URUS SETIA
 * ============================================================
 * READ-ONLY. Tidak mencipta, mengubah atau memadam data.
 * ============================================================
 */
function getSecretariatPeriods() {
  const user = getCurrentUser();
  if (!user || user.authorized !== true) throw new Error('Pengguna tidak dibenarkan.');
  const role = String(user.role || '').trim().toUpperCase();
  if (role !== 'SECRETARIAT' && role !== 'ADMIN') throw new Error('Akses ini hanya untuk Urus Setia/Admin.');

  const tz = Session.getScriptTimeZone() || 'Asia/Kuala_Lumpur';
  const months = ['Januari','Februari','Mac','April','Mei','Jun','Julai','Ogos','September','Oktober','November','Disember'];
  const result = [];
  const seen = {};

  function add_(pid, month, year, status, openDate, closeDate) {
    pid = String(pid || '').trim();
    if (!pid || seen[pid]) return;
    let m = String(month || '').trim();
    let y = Number(year || 0);
    const x = pid.match(/^(\d{4})-(\d{1,2})/);
    if (x) {
      if (!y) y = Number(x[1]);
      if (!m) m = months[Number(x[2]) - 1] || '';
    }
    seen[pid] = true;
    result.push({PeriodID:pid,Month:m,Year:y,Status:String(status || '').trim(),OpenDate:openDate || '',CloseDate:closeDate || '',Label:(m && y) ? m+' '+y : pid});
  }

  // 1) Baca tempoh rasmi daripada REPORT_PERIODS jika ada.
  try {
    const db = getDb_();
    const sh = db.getSheetByName(SHEETS.PERIODS || 'REPORT_PERIODS');
    if (sh) {
      const values = sh.getDataRange().getValues();
      if (values.length >= 2) {
        const headers = values[0].map(h => String(h || '').trim());
        const idx = n => headers.findIndex(h => h.toLowerCase() === n.toLowerCase());
        const ip = idx('PeriodID'), im = idx('Month'), iy = idx('Year'), io = idx('OpenDate'), ic = idx('CloseDate'), ist = idx('Status');
        if (ip >= 0) {
          for (let r=1; r<values.length; r++) {
            const raw = values[r][ip];
            let pid = '';
            if (Object.prototype.toString.call(raw) === '[object Date]' && !isNaN(raw.getTime())) {
              pid = Utilities.formatDate(raw, tz, 'yyyy-MM');
            } else {
              const text = String(raw == null ? '' : raw).trim();
              let x = text.match(/^(\d{4})-(\d{1,2})/);
              if (x) pid = x[1]+'-'+String(x[2]).padStart(2,'0');
              if (!pid) { x = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (x) pid = x[3]+'-'+String(x[2]).padStart(2,'0'); }
              if (!pid) pid = text;
            }
            if (pid) add_(pid, im>=0?values[r][im]:'', iy>=0?values[r][iy]:'', ist>=0?values[r][ist]:'', io>=0?values[r][io]:'', ic>=0?values[r][ic]:'');
          }
        }
      }
    }
  } catch (e) {}

  // 2) Tambah mana-mana tempoh yang memang mempunyai laporan dalam REPORTS.
  //    Ini membolehkan Urus Setia melihat sejarah walaupun rekod tempoh lama
  //    tidak lagi lengkap dalam REPORT_PERIODS. Bacaan sahaja.
  try {
    const reports = getAllReports_();
    reports.forEach(r => {
      const pid = normalizePeriodId_(r.PeriodID);
      if (pid) add_(pid, '', '', r.Status || '', '', '');
    });
  } catch (e) {}

  // 3) Pastikan tempoh semasa sentiasa ada.
  const now = new Date();
  const currentId = Utilities.formatDate(now, tz, 'yyyy-MM');
  if (!seen[currentId]) {
    try {
      const p = getCurrentOpenPeriod_();
      if (p) add_(normalizePeriodId_(p.PeriodID) || currentId, p.Month, p.Year, p.Status || 'OPEN', p.OpenDate, p.CloseDate);
    } catch (e) {}
  }
  if (!seen[currentId]) {
    const monthNo = Number(Utilities.formatDate(now, tz, 'M'));
    const year = Number(Utilities.formatDate(now, tz, 'yyyy'));
    add_(currentId, months[monthNo - 1], year, 'OPEN', new Date(year, monthNo - 1, 1), new Date(year, monthNo, 7, 23, 59, 59));
  }

  result.sort((a,b) => String(b.PeriodID).localeCompare(String(a.PeriodID)));
  return result;
}
