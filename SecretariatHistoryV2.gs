/**
 * ============================================================
 * CGSO - SEJARAH TEMPOH LAPORAN V2.3
 * ============================================================
 * READ-ONLY. Tidak mencipta, mengubah atau memadam rekod laporan.
 *
 * V2.3:
 * - Menyimpan hanya getSecretariatPeriodsV2().
 * - getSecretariatDashboardV2() dipusatkan dalam
 *   ZZZ_SecretariatDashboardFix.gs untuk mengelakkan duplicate function.
 * - Menyediakan tempoh sejarah dari 2025 sehingga bulan semasa.
 * - Menambah tempoh yang mempunyai rekod laporan dalam REPORTS.
 * ============================================================
 */
function getSecretariatPeriodsV2() {
  const user = getCurrentUser();
  assertAuthorized_(user);

  const role = String(user.role || '').trim().toUpperCase();
  if (role !== 'SECRETARIAT' && role !== 'ADMIN') {
    throw new Error('Akses ini hanya untuk Urus Setia/Admin.');
  }

  const tz = Session.getScriptTimeZone() || 'Asia/Kuala_Lumpur';
  const months = ['Januari','Februari','Mac','April','Mei','Jun','Julai','Ogos','September','Oktober','November','Disember'];
  const result = [];
  const seen = {};

  function addPeriod_(pid, status) {
    pid = normalizePeriodId_(pid);
    if (!pid || seen[pid]) return;

    const m = pid.match(/^(\d{4})-(\d{2})$/);
    if (!m) return;

    const year = Number(m[1]);
    const monthNo = Number(m[2]);
    if (monthNo < 1 || monthNo > 12) return;

    const openDate = new Date(year, monthNo - 1, 1, 0, 0, 0);
    const closeDate = new Date(year, monthNo, 7, 23, 59, 59);

    seen[pid] = true;
    result.push({
      PeriodID: pid,
      Month: months[monthNo - 1],
      Year: year,
      Status: status || '',
      OpenDate: openDate,
      CloseDate: closeDate,
      Label: months[monthNo - 1] + ' ' + year
    });
  }

  // 1. Baca tempoh rasmi daripada REPORT_PERIODS.
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

        const ip = idx('PeriodID');
        const im = idx('Month');
        const iy = idx('Year');
        const io = idx('OpenDate');
        const ic = idx('CloseDate');
        const ist = idx('Status');

        if (ip >= 0) {
          for (let r = 1; r < values.length; r++) {
            const raw = values[r][ip];
            let pid = '';

            if (Object.prototype.toString.call(raw) === '[object Date]' && !isNaN(raw.getTime())) {
              pid = Utilities.formatDate(raw, tz, 'yyyy-MM');
            } else {
              const text = String(raw == null ? '' : raw).trim();
              let x = text.match(/^(\d{4})-(\d{1,2})/);

              if (x) {
                pid = x[1] + '-' + String(x[2]).padStart(2, '0');
              }

              if (!pid) {
                x = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
                if (x) {
                  pid = x[3] + '-' + String(x[2]).padStart(2, '0');
                }
              }

              if (!pid) pid = text;
            }

            if (pid) {
              addPeriod_(pid, ist >= 0 ? values[r][ist] : '');
            }
          }
        }
      }
    }
  } catch (e) {
    // Jangan gagalkan dashboard jika REPORT_PERIODS tidak lengkap.
  }

  // 2. Tambah semua tempoh yang memang mempunyai laporan.
  try {
    (getAllReports_() || []).forEach(function(r) {
      addPeriod_(r.PeriodID, r.Status || 'HISTORICAL');
    });
  } catch (e) {
    // Abaikan dan teruskan dengan tempoh rasmi/sejarah.
  }

  // 3. Pastikan semua tempoh dari 2025 sehingga bulan semasa tersedia.
  const now = new Date();
  const currentYear = Number(Utilities.formatDate(now, tz, 'yyyy'));
  const currentMonth = Number(Utilities.formatDate(now, tz, 'M'));
  const startYear = 2025;

  for (let y = startYear; y <= currentYear; y++) {
    const lastMonth = y === currentYear ? currentMonth : 12;

    for (let m = 1; m <= lastMonth; m++) {
      const pid = y + '-' + String(m).padStart(2, '0');
      const status = (y === currentYear && m === currentMonth) ? 'OPEN' : 'HISTORICAL';
      addPeriod_(pid, status);
    }
  }

  result.sort(function(a, b) {
    return String(b.PeriodID).localeCompare(String(a.PeriodID));
  });

  return safeForClient_(result);
}
