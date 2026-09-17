/**
 * ============================================================
 * CGSO - USER DASHBOARD / HISTORICAL PERIODS
 * ============================================================
 * Read-only period/report lookup for PREPARER/SUPERVISOR.
 * Current report creation remains handled by getDashboardData().
 * ============================================================
 */

function getUserReportingPeriods() {
  const user = getCurrentUser();
  assertAuthorized_(user);

  const tz = Session.getScriptTimeZone() || 'Asia/Kuala_Lumpur';
  const months = ['Januari','Februari','Mac','April','Mei','Jun','Julai','Ogos','September','Oktober','November','Disember'];
  const seen = {};
  const result = [];

  function addPeriod_(pid, status, openDate, closeDate) {
    pid = normalizePeriodId_(pid);
    if (!pid || seen[pid]) return;
    const m = pid.match(/^(\d{4})-(\d{2})$/);
    if (!m) return;
    const year = Number(m[1]);
    const monthNo = Number(m[2]);
    if (monthNo < 1 || monthNo > 12) return;

    seen[pid] = true;
    result.push({
      PeriodID: pid,
      Month: months[monthNo - 1],
      Year: year,
      Status: status || '',
      OpenDate: openDate || new Date(year, monthNo - 1, 1, 0, 0, 0),
      CloseDate: closeDate || new Date(year, monthNo, 7, 23, 59, 59),
      Label: months[monthNo - 1] + ' ' + year
    });
  }

  try {
    const db = getDb_();
    const sh = db.getSheetByName(SHEETS.PERIODS || 'REPORT_PERIODS');
    if (sh) {
      const values = sh.getDataRange().getValues();
      if (values.length >= 2) {
        const headers = values[0].map(function(h) { return String(h || '').trim().toLowerCase(); });
        const idx = function(name) { return headers.indexOf(String(name).toLowerCase()); };
        const ip = idx('PeriodID');
        const ist = idx('Status');
        const io = idx('OpenDate');
        const ic = idx('CloseDate');
        if (ip >= 0) {
          for (let r = 1; r < values.length; r++) {
            addPeriod_(values[r][ip], ist >= 0 ? values[r][ist] : '', io >= 0 ? values[r][io] : null, ic >= 0 ? values[r][ic] : null);
          }
        }
      }
    }
  } catch (e) {}

  try {
    (getAllReports_() || []).forEach(function(r) {
      addPeriod_(r.PeriodID, r.Status || 'HISTORICAL');
    });
  } catch (e) {}

  const now = new Date();
  const currentYear = Number(Utilities.formatDate(now, tz, 'yyyy'));
  const currentMonth = Number(Utilities.formatDate(now, tz, 'M'));
  const startYear = 2025;

  for (let y = startYear; y <= currentYear; y++) {
    const lastMonth = y === currentYear ? currentMonth : 12;
    for (let m = 1; m <= lastMonth; m++) {
      addPeriod_(y + '-' + String(m).padStart(2, '0'), y === currentYear && m === currentMonth ? 'OPEN' : 'HISTORICAL');
    }
  }

  result.sort(function(a, b) { return String(b.PeriodID).localeCompare(String(a.PeriodID)); });
  return safeForClient_(result);
}

function getUserDashboardByPeriod(periodId) {
  const user = getCurrentUser();
  assertAuthorized_(user);

  const role = String(user.role || '').trim().toUpperCase();
  if (role === 'ADMIN' || role === 'SECRETARIAT') {
    throw new Error('Fungsi ini adalah untuk Penyedia Laporan/Penyelia.');
  }

  const pid = normalizePeriodId_(periodId);
  if (!pid) throw new Error('Tempoh laporan tidak sah.');

  const periods = getUserReportingPeriods();
  const period = periods.find(function(p) { return String(p.PeriodID) === pid; });
  if (!period) throw new Error('Tempoh laporan tidak ditemui: ' + pid);

  const reports = getAllReports_() || [];
  const orgId = String(user.organisationId || '').trim();
  let report = null;

  if (orgId) {
    const matches = reports.filter(function(r) {
      return String(r.PeriodID || '').trim() === pid && String(r.OrganisationID || '').trim() === orgId;
    });
    matches.sort(function(a, b) {
      const da = new Date(a.UpdatedAt || a.SubmittedAt || 0).getTime() || 0;
      const db = new Date(b.UpdatedAt || b.SubmittedAt || 0).getTime() || 0;
      return db - da;
    });
    report = matches.length ? matches[0] : null;
  }

  // Untuk tempoh semasa, kekalkan tingkah laku sedia ada: jika report belum wujud,
  // cipta satu melalui fungsi rasmi. Tempoh sejarah kekal read-only.
  const current = getCurrentOpenPeriod_();
  if (!report && current && String(current.PeriodID || '') === pid) {
    report = getOrCreateReport_(pid, orgId);
  }

  let reportUrl = '';
  if (report && report.ReportID) {
    const webAppUrl = ScriptApp.getService().getUrl();
    if (webAppUrl) {
      reportUrl = webAppUrl + '?page=report&reportId=' + encodeURIComponent(report.ReportID);
    }
  }

  return safeForClient_({
    ok: true,
    authorized: true,
    user: user,
    period: period,
    report: report,
    reportUrl: reportUrl
  });
}
