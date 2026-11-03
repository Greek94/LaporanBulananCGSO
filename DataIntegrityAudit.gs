/**
 * AUDIT INTEGRITI DATA CGSO
 *
 * READ-ONLY: fungsi ini hanya membaca helaian dan memulangkan kiraan
 * isu bersama sampel ID terhad. Ia tidak menambah, mengubah atau memadam data.
 * Hanya ADMIN dan SECRETARIAT dibenarkan menjalankannya.
 */

function auditDataIntegrity() {
  const user = getCurrentUser();
  const role = String(user && user.role || '').trim().toUpperCase();

  if (!user || user.authorized !== true ||
      (role !== 'ADMIN' && role !== 'SECRETARIAT')) {
    return {
      ok: false,
      message: 'Akses ditolak. Audit integriti hanya untuk ADMIN atau SECRETARIAT.'
    };
  }

  const db = getDb_();
  const issues = [];
  const counts = {};
  const sampleLimit = 20;

  function readSheet(name, requiredHeaders) {
    const sheet = db.getSheetByName(name);
    if (!sheet) {
      issues.push({
        code: 'MISSING_SHEET',
        sheet: name,
        count: 1,
        samples: [name],
        message: 'Helaian wajib tidak dijumpai.'
      });
      counts[name] = 0;
      return { headers: [], rows: [] };
    }

    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();
    if (lastRow < 1 || lastColumn < 1) {
      issues.push({
        code: 'MISSING_HEADERS',
        sheet: name,
        count: 1,
        samples: [name],
        message: 'Helaian tiada header.'
      });
      counts[name] = 0;
      return { headers: [], rows: [] };
    }

    const values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
    const headers = values[0].map(function(value) {
      return String(value || '').trim();
    });
    const missing = requiredHeaders.filter(function(header) {
      return headers.indexOf(header) < 0;
    });

    if (missing.length) {
      issues.push({
        code: 'MISSING_REQUIRED_HEADERS',
        sheet: name,
        count: missing.length,
        samples: missing.slice(0, sampleLimit),
        message: 'Header wajib tidak lengkap.'
      });
      counts[name] = Math.max(0, values.length - 1);
      return { headers: headers, rows: [] };
    }

    const rows = values.slice(1);
    counts[name] = rows.length;
    return { headers: headers, rows: rows };
  }

  function indexOf(headers, name) {
    return headers.indexOf(name);
  }

  function value(row, headers, name) {
    const index = indexOf(headers, name);
    return index >= 0 ? String(row[index] == null ? '' : row[index]).trim() : '';
  }

  function addIssue(code, sheet, records, message) {
    if (!records.length) return;
    issues.push({
      code: code,
      sheet: sheet,
      count: records.length,
      samples: records.slice(0, sampleLimit),
      message: message
    });
  }

  function duplicateKeys(rows, headers, keyBuilder, label) {
    const groups = {};
    rows.forEach(function(row, index) {
      const key = keyBuilder(row, headers);
      if (!key) return;
      if (!groups[key]) groups[key] = [];
      groups[key].push(index + 2);
    });

    return Object.keys(groups).filter(function(key) {
      return groups[key].length > 1;
    }).map(function(key) {
      return label + ': ' + key + ' (baris ' + groups[key].join(', ') + ')';
    });
  }

  const periods = readSheet(SHEETS.PERIODS, ['PeriodID']);
  const organisations = readSheet(SHEETS.ORGS, ['OrganisationID']);
  const reports = readSheet(SHEETS.REPORTS, ['ReportID', 'PeriodID', 'OrganisationID']);
  const activities = readSheet(SHEETS.ACTIVITIES, ['ActivityID', 'ReportID']);
  const statuses = readSheet(SHEETS.STATUS, ['RecordID', 'ReportID', 'ItemCode']);

  const periodIds = {};
  periods.rows.forEach(function(row) {
    const id = value(row, periods.headers, 'PeriodID');
    if (id) periodIds[id] = true;
  });

  const organisationIds = {};
  organisations.rows.forEach(function(row) {
    const id = value(row, organisations.headers, 'OrganisationID');
    if (id) organisationIds[id] = true;
  });

  const reportIds = {};
  const reportKeyDuplicates = duplicateKeys(
    reports.rows,
    reports.headers,
    function(row, headers) {
      const reportId = value(row, headers, 'ReportID');
      if (reportId) {
        if (reportIds[reportId]) return 'ReportID ' + reportId;
        reportIds[reportId] = true;
      }
      return '';
    },
    'Duplikasi'
  );

  const duplicatePeriodOrg = duplicateKeys(
    reports.rows,
    reports.headers,
    function(row, headers) {
      const periodId = value(row, headers, 'PeriodID');
      const orgId = value(row, headers, 'OrganisationID');
      return periodId && orgId ? periodId + '|' + orgId : '';
    },
    'PeriodID|OrganisationID'
  );

  addIssue('DUPLICATE_REPORT_ID', SHEETS.REPORTS, reportKeyDuplicates,
    'ReportID digunakan lebih daripada sekali.');
  addIssue('DUPLICATE_REPORT_PERIOD_ORG', SHEETS.REPORTS, duplicatePeriodOrg,
    'Lebih daripada satu laporan ditemui bagi organisasi dan tempoh yang sama.');

  const missingReportFields = [];
  const unknownPeriods = [];
  const unknownOrganisations = [];

  reports.rows.forEach(function(row, index) {
    const reportId = value(row, reports.headers, 'ReportID');
    const periodId = value(row, reports.headers, 'PeriodID');
    const orgId = value(row, reports.headers, 'OrganisationID');
    const rowLabel = 'baris ' + (index + 2) + (reportId ? ' [' + reportId + ']' : '');

    if (!reportId || !periodId || !orgId) missingReportFields.push(rowLabel);
    if (periodId && !periodIds[periodId]) unknownPeriods.push(rowLabel + ' PeriodID=' + periodId);
    if (orgId && !organisationIds[orgId]) unknownOrganisations.push(rowLabel + ' OrganisationID=' + orgId);
  });

  addIssue('REPORT_MISSING_KEY_FIELDS', SHEETS.REPORTS, missingReportFields,
    'ReportID, PeriodID atau OrganisationID kosong.');
  addIssue('REPORT_UNKNOWN_PERIOD', SHEETS.REPORTS, unknownPeriods,
    'Report merujuk PeriodID yang tiada dalam REPORT_PERIODS.');
  addIssue('REPORT_UNKNOWN_ORGANISATION', SHEETS.REPORTS, unknownOrganisations,
    'Report merujuk OrganisationID yang tiada dalam ORGANISATIONS.');

  const orphanActivities = [];
  const duplicateActivityIds = duplicateKeys(
    activities.rows,
    activities.headers,
    function(row, headers) {
      const id = value(row, headers, 'ActivityID');
      return id || '';
    },
    'ActivityID'
  );

  activities.rows.forEach(function(row, index) {
    const reportId = value(row, activities.headers, 'ReportID');
    if (!reportId || !reportIds[reportId]) {
      orphanActivities.push('baris ' + (index + 2) + ' ActivityID=' +
        value(row, activities.headers, 'ActivityID') + ' ReportID=' + reportId);
    }
  });

  addIssue('ACTIVITY_ORPHAN_REPORT', SHEETS.ACTIVITIES, orphanActivities,
    'Aktiviti tiada ReportID atau merujuk laporan yang tiada.');
  addIssue('DUPLICATE_ACTIVITY_ID', SHEETS.ACTIVITIES, duplicateActivityIds,
    'ActivityID digunakan lebih daripada sekali.');

  const orphanStatuses = [];
  const duplicateStatusKeys = duplicateKeys(
    statuses.rows,
    statuses.headers,
    function(row, headers) {
      const reportId = value(row, headers, 'ReportID');
      const itemCode = value(row, headers, 'ItemCode');
      return reportId && itemCode ? reportId + '|' + itemCode : '';
    },
    'ReportID|ItemCode'
  );

  statuses.rows.forEach(function(row, index) {
    const reportId = value(row, statuses.headers, 'ReportID');
    if (!reportId || !reportIds[reportId]) {
      orphanStatuses.push('baris ' + (index + 2) + ' RecordID=' +
        value(row, statuses.headers, 'RecordID') + ' ReportID=' + reportId);
    }
  });

  addIssue('STATUS_ORPHAN_REPORT', SHEETS.STATUS, orphanStatuses,
    'Status item tiada ReportID atau merujuk laporan yang tiada.');
  addIssue('DUPLICATE_REPORT_ITEM_STATUS', SHEETS.STATUS, duplicateStatusKeys,
    'Pasangan ReportID dan ItemCode mempunyai lebih daripada satu rekod status.');

  return safeForClient_({
    ok: true,
    readOnly: true,
    generatedAt: new Date(),
    spreadsheetName: db.getName(),
    counts: counts,
    issueCount: issues.reduce(function(total, issue) {
      return total + issue.count;
    }, 0),
    issues: issues
  });
}
