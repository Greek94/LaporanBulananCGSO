/**
 * CGSO September 2026 report-content diagnostics.
 * READ ONLY: reports field values are never printed; only counts/IDs.
 * Run: diagnoseSeptemberReportContent()
 * ADMIN/SECRETARIAT only.
 */
function diagnoseSeptemberReportContent() {
  const user = getCurrentUser();
  const role = String(user && user.role || '').trim().toUpperCase();
  if (!user || user.authorized !== true ||
      (role !== 'ADMIN' && role !== 'SECRETARIAT')) {
    throw new Error('Akses ditolak: ADMIN/SECRETARIAT sahaja.');
  }

  const ss = getDb_();
  const reportSheet = ss.getSheetByName(SHEETS.REPORTS);
  const activitySheet = ss.getSheetByName(SHEETS.ACTIVITIES);
  if (!reportSheet || !activitySheet) {
    throw new Error('Helaian REPORTS atau ACTIVITIES tidak dijumpai.');
  }

  function readSheet(sheet) {
    const rowCount = sheet.getLastRow();
    const colCount = sheet.getLastColumn();
    if (rowCount < 2 || colCount < 1) return { headers: [], rows: [] };
    const values = sheet.getRange(1, 1, rowCount, colCount).getValues();
    return {
      headers: values[0].map(v => String(v == null ? '' : v).trim()),
      rows: values.slice(1)
    };
  }
  function str(v) { return String(v == null ? '' : v).trim(); }
  function value(row, headers, name) {
    const index = headers.indexOf(name);
    return index < 0 ? '' : row[index];
  }
  function isSeptember(v) {
    if (v instanceof Date && !isNaN(v.getTime())) {
      return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM') === '2026-09';
    }
    const s = str(v);
    return /^2026-09(?:$|-)/.test(s) || /^\d{1,2}\/09\/2026/.test(s);
  }
  function timestamp(v) {
    if (v instanceof Date && !isNaN(v.getTime())) return v.getTime();
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.getTime();
  }

  const reports = readSheet(reportSheet);
  const activities = readSheet(activitySheet);
  ['ReportID', 'PeriodID', 'OrganisationID'].forEach(name => {
    if (reports.headers.indexOf(name) < 0) throw new Error('Header REPORTS tiada: ' + name);
  });
  ['ActivityID', 'ReportID'].forEach(name => {
    if (activities.headers.indexOf(name) < 0) throw new Error('Header ACTIVITIES tiada: ' + name);
  });

  const activityCountByReport = {};
  activities.rows.forEach(row => {
    const id = str(value(row, activities.headers, 'ReportID'));
    if (id) activityCountByReport[id] = (activityCountByReport[id] || 0) + 1;
  });

  const september = reports.rows.map((row, i) => {
    const filledFields = [];
    reports.headers.forEach((header, j) => {
      if (header && str(row[j]) !== '') filledFields.push(header);
    });
    return {
      sheetRow: i + 2,
      reportId: str(value(row, reports.headers, 'ReportID')),
      organisationId: str(value(row, reports.headers, 'OrganisationID')),
      status: str(value(row, reports.headers, 'Status')),
      updatedAt: value(row, reports.headers, 'UpdatedAt'),
      submittedAt: value(row, reports.headers, 'SubmittedAt'),
      createdAt: value(row, reports.headers, 'CreatedAt'),
      activityCount: 0,
      nonEmptyFieldCount: filledFields.length,
      nonEmptyFields: filledFields
    };
  }).filter(item => isSeptember(value(reports.rows[item.sheetRow - 2], reports.headers, 'PeriodID')));

  september.forEach(item => item.activityCount = activityCountByReport[item.reportId] || 0);

  const byOrg = {};
  september.forEach(item => {
    if (!byOrg[item.organisationId]) byOrg[item.organisationId] = [];
    byOrg[item.organisationId].push(item);
  });

  const summary = Object.keys(byOrg).sort().map(orgId => {
    const list = byOrg[orgId];
    const ranked = list.slice().sort((a, b) =>
      (b.activityCount - a.activityCount) ||
      (b.nonEmptyFieldCount - a.nonEmptyFieldCount) ||
      ((timestamp(b.updatedAt) || 0) - (timestamp(a.updatedAt) || 0))
    );
    const withActivities = list.filter(x => x.activityCount > 0);
    return {
      organisationId: orgId,
      count: list.length,
      statusCounts: list.reduce((acc, item) => {
        const key = item.status || '(blank)';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {}),
      reportsWithActivities: withActivities.length,
      linkedActivityRows: withActivities.reduce((sum, item) => sum + item.activityCount, 0),
      maxNonEmptyFieldCount: Math.max.apply(null, list.map(x => x.nonEmptyFieldCount)),
      candidateTop3: ranked.slice(0, 3).map(item => ({
        row: item.sheetRow,
        reportId: item.reportId,
        status: item.status,
        updatedAt: item.updatedAt,
        submittedAt: item.submittedAt,
        createdAt: item.createdAt,
        activityCount: item.activityCount,
        nonEmptyFieldCount: item.nonEmptyFieldCount,
        nonEmptyFields: item.nonEmptyFields
      }))
    };
  });

  const result = {
    ok: true,
    readOnly: true,
    generatedAt: new Date(),
    timezone: Session.getScriptTimeZone(),
    septemberRows: september.length,
    organisations: summary.length,
    reportColumns: reports.headers,
    activityRows: activities.rows.length,
    activityRowsLinkedToSeptember: september.reduce((sum, item) => sum + item.activityCount, 0),
    byOrganisation: summary
  };
  console.log(JSON.stringify(result));
  return safeForClient_(result);
}
