/**
 * CGSO DATA INTEGRITY DIAGNOSTICS — READ ONLY
 *
 * Compact report to investigate duplicate REPORTS rows without changing data.
 * Run: diagnoseReportDuplicates()
 * Admin/Secretariat only.
 */

function diagnoseReportDuplicates() {
  const user = getCurrentUser();
  const role = String(user && user.role || '').trim().toUpperCase();

  if (!user || user.authorized !== true ||
      (role !== 'ADMIN' && role !== 'SECRETARIAT')) {
    const denied = {
      ok: false,
      readOnly: true,
      message: 'Akses ditolak. Diagnostik hanya untuk ADMIN atau SECRETARIAT.'
    };
    console.log(JSON.stringify(denied));
    return denied;
  }

  const ss = getDb_();
  const sheet = ss.getSheetByName(SHEETS.REPORTS);
  if (!sheet) throw new Error('Helaian REPORTS tidak dijumpai.');

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) {
    const empty = { ok: true, readOnly: true, rows: 0, groups: [], message: 'Tiada rekod REPORTS.' };
    console.log(JSON.stringify(empty, null, 2));
    return empty;
  }

  const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = values[0].map(function(v) { return String(v || '').trim(); });
  const rows = values.slice(1);

  function idx(name) { return headers.indexOf(name); }
  function cell(row, name) {
    const i = idx(name);
    return i < 0 ? '' : row[i];
  }
  function str(value) {
    return String(value == null ? '' : value).trim();
  }
  function dateKey(value) {
    if (value instanceof Date && !isNaN(value.getTime())) {
      return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
    const text = str(value);
    const parsed = new Date(text);
    if (text && !isNaN(parsed.getTime())) {
      return Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
    return text;
  }

  const groups = {};
  const emptyKeys = [];
  rows.forEach(function(row, i) {
    const reportId = str(cell(row, 'ReportID'));
    const periodRaw = cell(row, 'PeriodID');
    const period = dateKey(periodRaw);
    const org = str(cell(row, 'OrganisationID'));

    if (!reportId || !period || !org) {
      emptyKeys.push({
        row: i + 2,
        reportId: reportId,
        periodId: period,
        organisationId: org
      });
      return;
    }

    const key = period + '|' + org;
    if (!groups[key]) {
      groups[key] = {
        periodId: period,
        organisationId: org,
        count: 0,
        reports: []
      };
    }

    groups[key].count++;
    if (groups[key].reports.length < 8) {
      groups[key].reports.push({
        row: i + 2,
        reportId: reportId,
        status: str(cell(row, 'Status')),
        updatedAt: str(cell(row, 'UpdatedAt')),
        submittedAt: str(cell(row, 'SubmittedAt')),
        createdAt: str(cell(row, 'CreatedAt'))
      });
    }
  });

  const duplicates = Object.keys(groups)
    .map(function(key) { return groups[key]; })
    .filter(function(group) { return group.count > 1; })
    .sort(function(a, b) {
      if (a.periodId !== b.periodId) return a.periodId < b.periodId ? 1 : -1;
      return a.organisationId.localeCompare(b.organisationId);
    });

  const periodTotals = {};
  rows.forEach(function(row) {
    const p = dateKey(cell(row, 'PeriodID'));
    if (!p) return;
    if (!periodTotals[p]) periodTotals[p] = { periodId: p, reportRows: 0, organisations: {} };
    periodTotals[p].reportRows++;
    const org = str(cell(row, 'OrganisationID'));
    if (org) periodTotals[p].organisations[org] = true;
  });

  const periodSummary = Object.keys(periodTotals)
    .map(function(key) {
      const item = periodTotals[key];
      return {
        periodId: item.periodId,
        reportRows: item.reportRows,
        distinctOrganisations: Object.keys(item.organisations).length
      };
    })
    .sort(function(a, b) { return a.periodId < b.periodId ? 1 : -1; })
    .slice(0, 15);

  const duplicateReportIds = {};
  rows.forEach(function(row, i) {
    const id = str(cell(row, 'ReportID'));
    if (!id) return;
    if (!duplicateReportIds[id]) duplicateReportIds[id] = [];
    duplicateReportIds[id].push(i + 2);
  });

  const duplicateIdSamples = Object.keys(duplicateReportIds)
    .filter(function(id) { return duplicateReportIds[id].length > 1; })
    .slice(0, 10)
    .map(function(id) {
      return { reportId: id, rows: duplicateReportIds[id].slice(0, 8), occurrences: duplicateReportIds[id].length };
    });

  const result = {
    ok: true,
    readOnly: true,
    generatedAt: new Date(),
    spreadsheetName: ss.getName(),
    timezone: Session.getScriptTimeZone(),
    totalReportRows: rows.length,
    distinctPeriodOrganisationPairs: Object.keys(groups).length,
    duplicatePairGroups: duplicates.length,
    duplicatePairRowsExtra: duplicates.reduce(function(total, group) { return total + group.count - 1; }, 0),
    duplicateReportIdCount: Object.keys(duplicateReportIds).filter(function(id) { return duplicateReportIds[id].length > 1; }).length,
    duplicateReportIdSamples: duplicateIdSamples,
    missingKeyRowsCount: emptyKeys.length,
    missingKeyRowsSamples: emptyKeys.slice(0, 10),
    periodSummaryRecent15: periodSummary,
    duplicateGroupsSamples: duplicates.slice(0, 8)
  };

  console.log('CGSO REPORT DUPLICATE DIAGNOSTICS (READ ONLY)');
  console.log(JSON.stringify(result, null, 2));
  return safeForClient_(result);
}
