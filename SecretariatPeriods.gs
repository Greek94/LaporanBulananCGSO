/**
 * Senarai tempoh laporan untuk Dashboard Urus Setia.
 * Read-only. Tidak mencipta atau mengubah REPORT_PERIODS.
 */
function getSecretariatPeriods() {
  const user = getCurrentUser();
  assertAuthorized_(user);
  if (!['SECRETARIAT','ADMIN'].includes(String(user.role).toUpperCase())) {
    throw new Error('Akses ini hanya untuk Urus Setia/Admin.');
  }

  const db = getDb_();
  const sh = db.getSheetByName('REPORT_PERIODS');
  if (!sh) throw new Error('Sheet REPORT_PERIODS tidak dijumpai.');

  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values.shift().map(h => String(h || '').trim());
  const idx = name => headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
  const iPeriod = idx('PeriodID');
  const iMonth = idx('Month');
  const iYear = idx('Year');
  const iOpen = idx('OpenDate');
  const iClose = idx('CloseDate');
  const iStatus = idx('Status');

  if (iPeriod < 0) throw new Error('Kolum PeriodID tidak dijumpai dalam REPORT_PERIODS.');

  const monthOrder = {
    'Januari':1,'Februari':2,'Mac':3,'April':4,'Mei':5,'Jun':6,
    'Julai':7,'Ogos':8,'September':9,'Oktober':10,'November':11,'Disember':12
  };

  const out = values.map(row => {
    const periodId = normalizePeriodId_(row[iPeriod]);
    if (!periodId) return null;
    const month = iMonth >= 0 ? String(row[iMonth] || '') : '';
    const year = iYear >= 0 ? Number(row[iYear] || 0) : 0;
    return {
      PeriodID: periodId,
      Month: month,
      Year: year,
      Status: iStatus >= 0 ? String(row[iStatus] || '') : '',
      OpenDate: iOpen >= 0 ? row[iOpen] : '',
      CloseDate: iClose >= 0 ? row[iClose] : '',
      Label: (month && year) ? month + ' ' + year : periodId,
      _sort: (year || 0) * 100 + (monthOrder[month] || Number(periodId.slice(5,7)) || 0)
    };
  }).filter(Boolean);

  const unique = {};
  out.forEach(p => { unique[p.PeriodID] = p; });
  return Object.keys(unique).map(k => unique[k])
    .sort((a,b) => b._sort - a._sort)
    .map(p => {
      delete p._sort;
      return p;
    });
}
