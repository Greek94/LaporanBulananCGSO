/**
 * Senarai tempoh laporan untuk Dashboard Urus Setia.
 * READ-ONLY: tidak mencipta, mengubah atau memadam period/report.
 *
 * Sumber utama ialah REPORTS (tempoh yang benar-benar mempunyai sejarah laporan),
 * dengan fallback kepada tempoh semasa. Ini mengelakkan masalah akses terus
 * ke sheet REPORT_PERIODS daripada menyebabkan dropdown kosong.
 */
function getSecretariatPeriods() {
  const user = getCurrentUser();
  if (!user || user.authorized !== true) {
    throw new Error('Pengguna tidak dibenarkan.');
  }

  const role = String(user.role || '').trim().toUpperCase();
  if (role !== 'SECRETARIAT' && role !== 'ADMIN') {
    throw new Error('Akses ini hanya untuk Urus Setia/Admin.');
  }

  const result = [];
  const seen = {};
  const monthOrder = {
    Januari:1, Februari:2, Mac:3, April:4, Mei:5, Jun:6,
    Julai:7, Ogos:8, September:9, Oktober:10, November:11, Disember:12
  };

  function normaliseId_(value) {
    if (value instanceof Date && !isNaN(value.getTime())) {
      return Utilities.formatDate(value, Session.getScriptTimeZone() || 'Asia/Kuala_Lumpur', 'yyyy-MM');
    }
    const text = String(value == null ? '' : value).trim();
    if (!text) return '';
    let m = text.match(/^(\d{4})-(\d{1,2})(?:-|$)/);
    if (m) return m[1] + '-' + String(m[2]).padStart(2, '0');
    m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return m[3] + '-' + String(m[2]).padStart(2, '0');
    return text;
  }

  function addPeriod_(periodId, period) {
    const id = normaliseId_(periodId || (period && period.PeriodID));
    if (!id || seen[id]) return;

    let p = period || {};
    // Jika period penuh boleh dicapai, gunakan maklumat sebenar.
    if ((!p.Month || !p.Year) && id) {
      try { p = getPeriodById_(id) || p; } catch (e) {}
    }

    const month = String(p.Month || p.month || '').trim();
    const year = Number(p.Year || p.year || 0);
    const monthNo = monthOrder[month] || Number(id.slice(5, 7)) || 0;

    seen[id] = true;
    result.push({
      PeriodID: id,
      Month: month,
      Year: year,
      Status: String(p.Status || p.status || '').trim(),
      OpenDate: p.OpenDate || p.openDate || '',
      CloseDate: p.CloseDate || p.closeDate || '',
      Label: (month && year) ? month + ' ' + year : id,
      _sort: (year || Number(id.slice(0, 4)) || 0) * 100 + monthNo
    });
  }

  // 1. Tempoh semasa sentiasa cuba dimasukkan dahulu.
  try {
    const current = getCurrentOpenPeriod_();
    if (current) addPeriod_(current.PeriodID, current);
  } catch (e) {}

  // 2. Bina sejarah berdasarkan REPORTS yang sedia ada.
  //    Ini read-only dan tidak mencipta report baharu.
  try {
    const reports = getAllReports_() || [];
    reports.forEach(function(r) {
      const id = normaliseId_(r.PeriodID);
      if (id) addPeriod_(id, null);
    });
  } catch (e) {}

  // 3. Jika tiada report sejarah, cuba baca REPORT_PERIODS sebagai fallback sahaja.
  if (!result.length) {
    try {
      const db = getDb_();
      const sh = db.getSheetByName(SHEETS.PERIODS || 'REPORT_PERIODS');
      if (sh) {
        const values = sh.getDataRange().getValues();
        if (values.length >= 2) {
          const headers = values[0].map(function(h) { return String(h || '').trim(); });
          const idx = function(name) { return headers.findIndex(function(h) { return h.toLowerCase() === name.toLowerCase(); }); };
          const iPeriod = idx('PeriodID');
          const iMonth = idx('Month');
          const iYear = idx('Year');
          const iStatus = idx('Status');
          const iOpen = idx('OpenDate');
          const iClose = idx('CloseDate');
          if (iPeriod >= 0) {
            for (let r = 1; r < values.length; r++) {
              const id = normaliseId_(values[r][iPeriod]);
              if (!id) continue;
              addPeriod_(id, {
                PeriodID: id,
                Month: iMonth >= 0 ? values[r][iMonth] : '',
                Year: iYear >= 0 ? values[r][iYear] : '',
                Status: iStatus >= 0 ? values[r][iStatus] : '',
                OpenDate: iOpen >= 0 ? values[r][iOpen] : '',
                CloseDate: iClose >= 0 ? values[r][iClose] : ''
              });
            }
          }
        }
      }
    } catch (e) {}
  }

  return result
    .sort(function(a, b) { return b._sort - a._sort; })
    .map(function(p) {
      delete p._sort;
      return p;
    });
}
