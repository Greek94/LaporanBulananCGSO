/**
 * CGSO September 2026 focused diagnostics.
 * READ ONLY: does not edit or delete any spreadsheet data.
 * Run: diagnoseSeptemberReportHistory()
 */
function diagnoseSeptemberReportHistory() {
  const user = getCurrentUser();
  const role = String(user && user.role || '').trim().toUpperCase();
  if (!user || user.authorized !== true ||
      (role !== 'ADMIN' && role !== 'SECRETARIAT')) {
    throw new Error('Akses ditolak: ADMIN/SECRETARIAT sahaja.');
  }

  const ss = getDb_();
  const reportsSheet = ss.getSheetByName(SHEETS.REPORTS);
  const activitiesSheet = ss.getSheetByName(SHEETS.ACTIVITIES);
  if (!reportsSheet || !activitiesSheet) {
    throw new Error('Helaian REPORTS atau ACTIVITIES tidak dijumpai.');
  }

  function load(sheet) {
    const n = sheet.getLastRow();
    const m = sheet.getLastColumn();
    if (n < 2 || m < 1) return { headers: [], rows: [] };
    const data = sheet.getRange(1, 1, n, m).getValues();
    return {
      headers: data[0].map(v => String(v || '').trim()),
      rows: data.slice(1)
    };
  }
  function get(row, headers, key) {
    const i = headers.indexOf(key);
    return i < 0 ? '' : row[i];
  }
  function text(v) { return String(v == null ? '' : v).trim(); }
  function stamp(v) {
    if (v instanceof Date && !isNaN(v.getTime())) {
      return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    }
    return text(v);
  }
  function asMillis(v) {
    if (v instanceof Date && !isNaN(v.getTime())) return v.getTime();
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.getTime();
  }

  const reportData = load(reportsSheet);
  const activityData = load(activitiesSheet);
  const reportHeaders = reportData.headers;
  const activityHeaders = activityData.headers;
  ['ReportID', 'PeriodID', 'OrganisationID'].forEach(key => {
    if (reportHeaders.indexOf(key) < 0) throw new Error('Header REPORTS tiada: ' + key);
  });
  ['ActivityID', 'ReportID'].forEach(key => {
    if (activityHeaders.indexOf(key) < 0) throw new Error('Header ACTIVITIES tiada: ' + key);
  });

  const activityCounts = {};
  activityData.rows.forEach(row => {
    const id = text(get(row, activityHeaders, 'ReportID'));
    if (id) activityCounts[id] = (activityCounts[id] || 0) + 1;
  });

  const september = reportData.rows.map((row, i) => ({
    rowNumber: i + 2,
    reportId: text(get(row, reportHeaders, 'ReportID')),
    periodRaw: get(row, reportHeaders, 'PeriodID'),
    organisationId: text(get(row, reportHeaders, 'OrganisationID')),
    status: text(get(row, reportHeaders, 'Status')),
    updatedAt: get(row, reportHeaders, 'UpdatedAt'),
    submittedAt: get(row, reportHeaders, 'SubmittedAt'),
    createdAt: get(row, reportHeaders, 'CreatedAt'),
    activityCount: 0
  })).filter(item => {
    const raw = item.periodRaw;
    if (raw instanceof Date && !isNaN(raw.getTime())) {
      return Utilities.formatDate(raw, Session.getScriptTimeZone(), 'yyyy-MM') === '2026-09';
    }
    const str = text(raw);
    return /^2026-09(?:$|-)/.test(str) || /^\d{1,2}\/09\/2026/.test(str);
  });

  september.forEach(item => item.activityCount = activityCounts[item.reportId] || 0);

  const orgs = {};
  september.forEach(item => {
    if (!orgs[item.organisationId]) orgs[item.organisationId] = [];
    orgs[item.organisationId].push(item);
  });

  const summary = Object.keys(orgs).sort().map(org => {
    const list = orgs[org];
    const times = list.map(item => asMillis(item.updatedAt)).filter(v => v !== null).sort((a,b) => a-b);
    const first = list.slice().sort((a,b) => (asMillis(a.updatedAt) || 0) - (asMillis(b.updatedAt) || 0))[0];
    const last = list.slice().sort((a,b) => (asMillis(b.updatedAt) || 0) - (asMillis(a.updatedAt) || 0))[0];
    return {
      organisationId: org,
      reportCount: list.length,
      distinctReportIds: new Set(list.map(item => item.reportId).filter(Boolean)).size,
      statusCounts: list.reduce((acc,item) => { const k=item.status || '(blank)'; acc[k]=(acc[k]||0)+1; return acc; }, {}),
      reportsWithActivities: list.filter(item => item.activityCount > 0).length,
      activityLinkedRowsTotal: list.reduce((sum,item) => sum + item.activityCount, 0),
      firstUpdatedAt: first ? stamp(first.updatedAt) : '',
      firstReportId: first ? first.reportId : '',
      firstRow: first ? first.rowNumber : null,
      lastUpdatedAt: last ? stamp(last.updatedAt) : '',
      lastReportId: last ? last.reportId : '',
      lastRow: last ? last.rowNumber : null,
      updatedAtMinMaxMs: times.length ? [times[0], times[times.length-1]] : []
    };
  });

  const result = {
    ok: true,
    readOnly: true,
    generatedAt: new Date(),
    timezone: Session.getScriptTimeZone(),
    septemberReportRows: september.length,
    organisationCount: Object.keys(orgs).length,
    totalActivityRows: activityData.rows.length,
    linkedActivityRowsForSeptemberReports: september.reduce((sum,item) => sum + item.activityCount, 0),
    byOrganisation: summary
  };

  // Compact log (one JSON line) avoids large expanded sample arrays.
  console.log(JSON.stringify(result));
  return safeForClient_(result);
}
