/**
 * Senarai tempoh laporan untuk Dashboard Urus Setia.
 * READ-ONLY: tidak mencipta, mengubah atau memadam period/report.
 *
 * Sumber utama sejarah ialah REPORTS kerana dashboard memang membaca
 * laporan sedia ada daripada sheet tersebut. Ini mengelakkan isu format
 * PeriodID dalam REPORT_PERIODS menyebabkan dropdown kosong.
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
    'Januari':1, 'Februari':2, 'Mac':3, 'April':4,
    'Mei':5, 'Jun':6, 'Julai':7, 'Ogos':8,
    'September':9, 'Oktober':10, 'November':11, 'Disember':12
  };

  function canonicalPeriodId_(value) {
    if (value == null || value === '') return '';

    if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
      return Utilities.formatDate(
        value,
        Session.getScriptTimeZone() || 'Asia/Kuala_Lumpur',
        'yyyy-MM'
      );
    }

    const text = String(value).trim();
    let m = text.match(/^(\d{4})-(\d{1,2})(?:-|$)/);
    if (m) return m[1] + '-' + String(m[2]).padStart(2, '0');

    m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return m[3] + '-' + String(m[2]).padStart(2, '0');

    return text;
  }

  function addPeriod_(period, fallbackId) {
    if (!period && !fallbackId) return;

    const rawId = period && (period.PeriodID || period.periodId || period.periodID);
    const periodId = canonicalPeriodId_(rawId || fallbackId);
    if (!periodId || seen[periodId]) return;

    const month = String(period && (period.Month || period.month) || '').trim();
    const year = Number(period && (period.Year || period.year) || 0);
    const monthNo = monthOrder[month] || Number(periodId.slice(5, 7)) || 0;

    seen[periodId] = true;
    result.push({
      PeriodID: periodId,
      Month: month,
      Year: year,
      Status: String(period && (period.Status || period.status) || '').trim(),
      OpenDate: period && (period.OpenDate || period.openDate) || '',
      CloseDate: period && (period.CloseDate || period.closeDate) || '',
      Label: (month && year) ? month + ' ' + year : periodId,
      _sort: (year || Number(periodId.slice(0, 4)) || 0) * 100 + monthNo
    });
  }

  // 1. Pastikan tempoh semasa sentiasa ada.
  try {
    const current = getCurrentOpenPeriod_();
    addPeriod_(current);
  } catch (e) {
    // Dashboard utama masih boleh berfungsi walaupun sumber tempoh semasa gagal.
  }

  // 2. Ambil semua tempoh yang mempunyai laporan sedia ada.
  //    READ-ONLY — tiada report/period baharu dicipta.
  try {
    const reports = getAllReports_();
    const periodIds = {};

    reports.forEach(function(report) {
      const pid = canonicalPeriodId_(
        report && (report.PeriodID || report.periodId || report.periodID)
      );
      if (pid) periodIds[pid] = true;
    });

    Object.keys(periodIds).forEach(function(pid) {
      try {
        const period = getPeriodById_(pid);
        if (period) {
          addPeriod_(period, pid);
        } else {
          addPeriod_({ PeriodID: pid }, pid);
        }
      } catch (e) {
        addPeriod_({ PeriodID: pid }, pid);
      }
    });
  } catch (e) {
    // Jangan gagalkan dashboard hanya kerana sejarah laporan tidak tersedia.
  }

  // 3. Fallback terakhir: baca REPORT_PERIODS jika ada rekod yang belum
  //    mempunyai laporan dalam REPORTS.
  try {
    const db = getDb_();
    const sh = db.getSheetByName(SHEETS.PERIODS || 'REPORT_PERIODS');

    if (sh) {
      const values = sh.getDataRange().getValues();
      if (values.length >= 2) {
        const headers = values[0].map(function(h) {
          return String(h || '').trim();
        });
        const idx = function(name) {
          return headers.findIndex(function(h) {
            return h.toLowerCase() === name.toLowerCase();
          });
        };

        const iPeriod = idx('PeriodID');
        const iMonth = idx('Month');
        const iYear = idx('Year');
        const iOpen = idx('OpenDate');
        const iClose = idx('CloseDate');
        const iStatus = idx('Status');

        if (iPeriod >= 0) {
          for (let r = 1; r < values.length; r++) {
            const pid = canonicalPeriodId_(values[r][iPeriod]);
            if (!pid) continue;

            addPeriod_({
              PeriodID: pid,
              Month: iMonth >= 0 ? values[r][iMonth] : '',
              Year: iYear >= 0 ? values[r][iYear] : '',
              OpenDate: iOpen >= 0 ? values[r][iOpen] : '',
              CloseDate: iClose >= 0 ? values[r][iClose] : '',
              Status: iStatus >= 0 ? values[r][iStatus] : ''
            }, pid);
          }
        }
      }
    }
  } catch (e) {
    // Sumber fallback tidak kritikal.
  }

  return result
    .sort(function(a, b) { return b._sort - a._sort; })
    .map(function(p) {
      delete p._sort;
      return p;
    });
}
