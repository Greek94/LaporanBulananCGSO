/**
 * ============================================================
 * CGSO - USER DASHBOARD / HISTORICAL PERIODS
 * ============================================================
 * Read-only period/report lookup for PREPARER/SUPERVISOR.
 * Current report creation remains handled by the existing report logic.
 * ============================================================
 */

function getUserReportingPeriods() {
  const user = getCurrentUser();
  assertAuthorized_(user);

  const months = ['Januari','Februari','Mac','April','Mei','Jun','Julai','Ogos','September','Oktober','November','Disember'];
  const result = [];
  const seen = {};

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

  // REPORT_PERIODS is the authoritative source for the period selector.
  // Avoid scanning the full REPORTS table here because this function is
  // called when the homepage first loads and again when a period is opened.
  try {
    const db = getDb_();
    const sh = db.getSheetByName(SHEETS.PERIODS || 'REPORT_PERIODS');

    if (sh) {
      const values = sh.getDataRange().getValues();

      if (values.length >= 2) {
        const headers = values[0].map(function(h) {
          return String(h || '').trim().toLowerCase();
        });

        const idx = function(name) {
          return headers.indexOf(String(name).toLowerCase());
        };

        const ip = idx('periodid');
        const ist = idx('status');
        const io = idx('opendate');
        const ic = idx('closedate');

        if (ip >= 0) {
          for (let r = 1; r < values.length; r++) {
            addPeriod_(
              values[r][ip],
              ist >= 0 ? values[r][ist] : '',
              io >= 0 ? values[r][io] : null,
              ic >= 0 ? values[r][ic] : null
            );
          }
        }
      }
    }
  } catch (e) {
    // Keep the selector usable even if the period sheet cannot be read.
  }

  // Safety fallback: ensure the current period is available to the user.
  if (!result.length) {
    const current = getCurrentOpenPeriod_();
    if (current) {
      addPeriod_(
        current.PeriodID,
        current.Status || 'OPEN',
        current.OpenDate,
        current.CloseDate
      );
    }
  }

  result.sort(function(a, b) {
    return String(b.PeriodID).localeCompare(String(a.PeriodID));
  });

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

  // Read the requested period directly. Do not rebuild the whole period list.
  let period = getPeriodById_(pid);

  // If the period exists in the sheet but PeriodID is stored as a Date/text
  // variant, fall back to the lightweight period list normalizer.
  if (!period) {
    const periods = getUserReportingPeriods();
    period = periods.find(function(p) {
      return String(p.PeriodID) === pid;
    }) || null;
  }

  if (!period) throw new Error('Tempoh laporan tidak ditemui: ' + pid);

  const reports = getAllReports_() || [];
  const orgId = String(user.organisationId || '').trim();
  let report = null;

  if (orgId) {
    const matches = reports.filter(function(r) {
      return String(normalizePeriodId_(r.PeriodID) || '').trim() === pid &&
             String(r.OrganisationID || '').trim() === orgId;
    });

    matches.sort(function(a, b) {
      const da = new Date(a.UpdatedAt || a.SubmittedAt || 0).getTime() || 0;
      const db = new Date(b.UpdatedAt || b.SubmittedAt || 0).getTime() || 0;
      return db - da;
    });

    report = matches.length ? matches[0] : null;
  }

  // Only the current open period may create a missing report.
  const current = getCurrentOpenPeriod_();
  if (!report && current && String(normalizePeriodId_(current.PeriodID)) === pid) {
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
