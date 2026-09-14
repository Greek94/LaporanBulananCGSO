/**
 * Senarai tempoh laporan untuk Dashboard Urus Setia.
 * READ-ONLY: tidak mencipta, mengubah atau memadam REPORT_PERIODS.
 */
function getSecretariatPeriods() {
  const user = getCurrentUser();

  if (!user || user.authorized !== true) {
    throw new Error((user && user.message) || 'Pengguna tidak dibenarkan.');
  }

  const role = String(user.role || '').trim().toUpperCase();
  if (role !== 'SECRETARIAT' && role !== 'ADMIN') {
    throw new Error('Akses ini hanya untuk Urus Setia/Admin.');
  }

  // Projek ini ialah Google Apps Script yang terikat kepada spreadsheet.
  const db = SpreadsheetApp.getActiveSpreadsheet();
  const sh = db.getSheetByName('REPORT_PERIODS');
  if (!sh) throw new Error('Sheet REPORT_PERIODS tidak dijumpai.');

  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values.shift().map(function(h) {
    return String(h || '').trim();
  });

  const idx = function(name) {
    const target = String(name).toLowerCase();
    return headers.findIndex(function(h) {
      return h.toLowerCase() === target;
    });
  };

  const iPeriod = idx('PeriodID');
  const iMonth = idx('Month');
  const iYear = idx('Year');
  const iOpen = idx('OpenDate');
  const iClose = idx('CloseDate');
  const iStatus = idx('Status');

  if (iPeriod < 0) {
    throw new Error('Kolum PeriodID tidak dijumpai dalam REPORT_PERIODS.');
  }

  const monthOrder = {
    'Januari': 1,
    'Februari': 2,
    'Mac': 3,
    'April': 4,
    'Mei': 5,
    'Jun': 6,
    'Julai': 7,
    'Ogos': 8,
    'September': 9,
    'Oktober': 10,
    'November': 11,
    'Disember': 12
  };

  const out = values.map(function(row) {
    const periodId = normalizePeriodId_(row[iPeriod]);
    if (!periodId) return null;

    const month = iMonth >= 0 ? String(row[iMonth] || '').trim() : '';
    const year = iYear >= 0 ? Number(row[iYear] || 0) : 0;
    const fallbackMonth = Number(periodId.slice(5, 7)) || 0;

    return {
      PeriodID: periodId,
      Month: month,
      Year: year,
      Status: iStatus >= 0 ? String(row[iStatus] || '').trim() : '',
      OpenDate: iOpen >= 0 ? row[iOpen] : '',
      CloseDate: iClose >= 0 ? row[iClose] : '',
      Label: (month && year) ? month + ' ' + year : periodId,
      _sort: (year || 0) * 100 + (monthOrder[month] || fallbackMonth)
    };
  }).filter(Boolean);

  // Elak tempoh berganda jika REPORT_PERIODS mempunyai duplicate.
  const unique = {};
  out.forEach(function(p) {
    unique[p.PeriodID] = p;
  });

  return Object.keys(unique)
    .map(function(k) { return unique[k]; })
    .sort(function(a, b) { return b._sort - a._sort; })
    .map(function(p) {
      delete p._sort;
      return p;
    });
}
