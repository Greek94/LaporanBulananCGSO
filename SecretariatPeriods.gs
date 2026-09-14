/**
 * Senarai tempoh laporan untuk Dashboard Urus Setia.
 * READ-ONLY: tidak mencipta, mengubah atau memadam period/report.
 */
function getSecretariatPeriods() {
  const user = getCurrentUser();
  if (!user || user.authorized !== true) throw new Error('Pengguna tidak dibenarkan.');
  const role = String(user.role || '').trim().toUpperCase();
  if (role !== 'SECRETARIAT' && role !== 'ADMIN') throw new Error('Akses ini hanya untuk Urus Setia/Admin.');

  const result = [], seen = {};
  const monthOrder = {'Januari':1,'Februari':2,'Mac':3,'April':4,'Mei':5,'Jun':6,'Julai':7,'Ogos':8,'September':9,'Oktober':10,'November':11,'Disember':12};

  function addPeriod_(period) {
    if (!period) return;
    const periodId = String(period.PeriodID || period.periodId || '').trim();
    if (!periodId || seen[periodId]) return;
    const month = String(period.Month || period.month || '').trim();
    const year = Number(period.Year || period.year || 0);
    const monthNo = monthOrder[month] || Number(periodId.slice(5,7)) || 0;
    seen[periodId] = true;
    result.push({PeriodID:periodId,Month:month,Year:year,Status:String(period.Status || period.status || '').trim(),OpenDate:period.OpenDate || period.openDate || '',CloseDate:period.CloseDate || period.closeDate || '',Label:(month && year) ? month+' '+year : periodId,_sort:(year||0)*100+monthNo});
  }

  // Pastikan tempoh semasa turut dipulangkan walaupun format PeriodID dalam sheet tidak konsisten.
  try { addPeriod_(getCurrentOpenPeriod_()); } catch (e) {}

  const db = getDb_();
  const sh = db.getSheetByName(SHEETS.PERIODS || 'REPORT_PERIODS');
  if (!sh) throw new Error('Sheet REPORT_PERIODS tidak dijumpai.');

  const values = sh.getDataRange().getValues();
  if (values.length >= 2) {
    const headers = values[0].map(h => String(h || '').trim());
    const idx = name => headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
    const iPeriod = idx('PeriodID'), iMonth = idx('Month'), iYear = idx('Year'), iOpen = idx('OpenDate'), iClose = idx('CloseDate'), iStatus = idx('Status');
    if (iPeriod < 0) throw new Error('Kolum PeriodID tidak dijumpai dalam REPORT_PERIODS.');

    for (let r=1; r<values.length; r++) {
      const raw = values[r][iPeriod];
      let periodId = '';
      if (Object.prototype.toString.call(raw) === '[object Date]' && !isNaN(raw.getTime())) {
        periodId = Utilities.formatDate(raw, Session.getScriptTimeZone() || 'Asia/Kuala_Lumpur', 'yyyy-MM');
      } else {
        const text = String(raw == null ? '' : raw).trim();
        let m = text.match(/^(\d{4})-(\d{1,2})(?:-|$)/);
        if (m) periodId = m[1]+'-'+String(m[2]).padStart(2,'0');
        if (!periodId) { m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) periodId = m[3]+'-'+String(m[2]).padStart(2,'0'); }
        if (!periodId) periodId = text;
      }
      if (!periodId) continue;
      addPeriod_({PeriodID:periodId,Month:iMonth>=0?values[r][iMonth]:'',Year:iYear>=0?values[r][iYear]:'',Status:iStatus>=0?values[r][iStatus]:'',OpenDate:iOpen>=0?values[r][iOpen]:'',CloseDate:iClose>=0?values[r][iClose]:''});
    }
  }

  return result.sort((a,b)=>b._sort-a._sort).map(p=>{delete p._sort; return p;});
}
