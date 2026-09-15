/**
 * ============================================================
 * CGSO - SECRETARIAT DASHBOARD
 * ============================================================
 * Production backend for Dashboard Urus Setia.
 * Consolidates the previous dashboard fix, read-only report
 * metadata, print HTML and PDF generation in one file.
 *
 * READ-ONLY terhadap data laporan kecuali audit log / generated files.
 * ============================================================
 */

function getSecretariatDashboardV2(periodId) {
  const user = getCurrentUser();
  assertAuthorized_(user);

  const role = String(user.role || '').trim().toUpperCase();
  if (role !== 'ADMIN' && role !== 'SECRETARIAT') {
    throw new Error('Akses ini hanya untuk Urus Setia/Admin.');
  }

  const tz = Session.getScriptTimeZone() || 'Asia/Kuala_Lumpur';
  const months = ['Januari','Februari','Mac','April','Mei','Jun','Julai','Ogos','September','Oktober','November','Disember'];
  const currentId = Utilities.formatDate(new Date(), tz, 'yyyy-MM');
  const pid = normalizePeriodId_(periodId || currentId);
  const m = String(pid).match(/^(\d{4})-(\d{2})$/);

  if (!m) throw new Error('PeriodID tidak sah: ' + pid);

  const year = Number(m[1]);
  const monthNo = Number(m[2]);
  if (monthNo < 1 || monthNo > 12) throw new Error('Bulan tidak sah: ' + pid);

  const period = {
    PeriodID: pid,
    Month: months[monthNo - 1],
    Year: year,
    Status: pid === currentId ? 'OPEN' : 'HISTORICAL',
    OpenDate: new Date(year, monthNo - 1, 1, 0, 0, 0),
    CloseDate: new Date(year, monthNo, 7, 23, 59, 59),
    Label: months[monthNo - 1] + ' ' + year
  };

  const allReports = getAllReports_() || [];
  const reports = allReports.filter(function(r) {
    return normalizePeriodId_(r.PeriodID) === pid;
  });

  const rank = function(status) {
    status = String(status || '').trim().toUpperCase();
    if (status === 'CLOSED') return 3;
    if (status === 'SUBMITTED') return 2;
    if (status === 'DRAFT') return 1;
    return 0;
  };

  const orgs = getActiveOrganisations_() || [];
  const rows = orgs.map(function(org) {
    const matches = reports.filter(function(r) {
      return String(r.OrganisationID || '').trim() === String(org.OrganisationID || '').trim();
    });

    matches.sort(function(a, b) {
      const rd = rank(b.Status) - rank(a.Status);
      if (rd !== 0) return rd;

      const ac = Number(a.CompletionPercent || 0);
      const bc = Number(b.CompletionPercent || 0);
      if (bc !== ac) return bc - ac;

      const ad = parseDate_(a.UpdatedAt) || parseDate_(a.CreatedAt) || new Date(0);
      const bd = parseDate_(b.UpdatedAt) || parseDate_(b.CreatedAt) || new Date(0);
      return bd.getTime() - ad.getTime();
    });

    const report = matches[0] || null;
    let completion = report ? Number(report.CompletionPercent || 0) : 0;
    const status = report ? String(report.Status || 'DRAFT').trim().toUpperCase() : 'NOT_STARTED';

    if (report && status === 'DRAFT' && report.ReportID) {
      try {
        const calculated = Number(calculateCompletion_(report.ReportID, report.OrganisationID));
        if (isFinite(calculated) && calculated >= 0) completion = calculated;
      } catch (e) {
        // Kekalkan nilai tersimpan jika pengiraan gagal.
      }
    }

    completion = Math.max(0, Math.min(100, completion));

    return {
      organisationId: org.OrganisationID || '',
      code: org.Code || '',
      name: org.OrganisationName || '',
      status: status,
      completion: completion,
      reportId: report ? String(report.ReportID || '') : '',
      submittedAt: report ? report.SubmittedAt || '' : '',
      updatedAt: report ? report.UpdatedAt || '' : ''
    };
  });

  const submitted = rows.filter(function(r){ return r.status === 'SUBMITTED'; }).length;
  const draft = rows.filter(function(r){ return r.status === 'DRAFT'; }).length;
  const closed = rows.filter(function(r){ return r.status === 'CLOSED'; }).length;
  const notStarted = rows.filter(function(r){ return r.status === 'NOT_STARTED'; }).length;
  const total = rows.length;
  const overallCompletion = total
    ? Math.round(rows.reduce(function(sum, r){ return sum + Number(r.completion || 0); }, 0) / total * 100) / 100
    : 0;

  return safeForClient_({
    ok: true,
    user: user,
    period: period,
    summary: {
      total: total,
      totalExpected: total,
      totalOrganisations: total,
      totalOrganizations: total,
      submitted: submitted,
      submittedCount: submitted,
      draft: draft,
      draftCount: draft,
      closed: closed,
      closedCount: closed,
      notStarted: notStarted,
      notStartedCount: notStarted,
      completionRate: overallCompletion,
      completionPercent: overallCompletion,
      rows: rows,
      organisations: rows,
      organizations: rows
    },
    rows: rows
  });
}

/** Read-only report data for Secretariat/Admin, enriched with organisation metadata. */
function getReadOnlyReport(reportId) {
  const user = getCurrentUser();
  assertAuthorized_(user);
  if (!['SECRETARIAT','ADMIN'].includes(String(user.role).toUpperCase())) {
    throw new Error('Akses ini hanya untuk Urus Setia/Admin.');
  }

  const data = getReportForm(reportId);
  if (!data || !data.report) return data;

  const r = data.report;
  const org = findOrganisation_(r.OrganisationID);
  if (org) {
    r.OrganisationName = org.OrganisationName || '';
    r.OrganisationCode = org.Code || '';
    r.Code = org.Code || '';
  }

  const p = data.period || {};
  if (p.Month && p.Year) p.Label = String(p.Month) + ' ' + String(p.Year);

  return data;
}

/** Create a print-ready HTML file in Drive. */
function generateReportPrintHtml(reportId) {
  const user = getCurrentUser();
  assertAuthorized_(user);
  if (!['SECRETARIAT','ADMIN','PREPARER','SUPERVISOR'].includes(String(user.role).toUpperCase())) {
    throw new Error('Akses tidak dibenarkan.');
  }

  const form = getReportForm(reportId);
  const html = buildPrintableReportHtml_(form);
  const file = DriveApp.createFile(
    `CGSO_${form.report.OrganisationID}_${form.period.PeriodID}.html`,
    html,
    MimeType.HTML
  );

  writeAudit_(reportId, user.userId, 'GENERATE_PRINT_HTML', file.getName());
  return {fileId:file.getId(), fileName:file.getName(), url:file.getUrl()};
}

/** Generate a PDF in Drive using an HTML blob. */
function generateReportPdf(reportId) {
  const user = getCurrentUser();
  assertAuthorized_(user);
  if (!['SECRETARIAT','ADMIN','PREPARER','SUPERVISOR'].includes(String(user.role).toUpperCase())) {
    throw new Error('Akses tidak dibenarkan.');
  }

  const form = getReportForm(reportId);
  const html = buildPrintableReportHtml_(form);
  const htmlBlob = Utilities.newBlob(html, MimeType.HTML,
    `CGSO_${form.report.OrganisationID}_${form.period.PeriodID}.html`);
  const pdfBlob = htmlBlob.getAs(MimeType.PDF)
    .setName(`CGSO_${form.report.OrganisationID}_${form.period.PeriodID}.pdf`);
  const file = DriveApp.createFile(pdfBlob);

  writeAudit_(reportId, user.userId, 'GENERATE_PDF', file.getName());
  return {fileId:file.getId(), fileName:file.getName(), url:file.getUrl()};
}

function buildPrintableReportHtml_(form) {
  const p = form.period;
  const r = form.report;
  const org = findOrganisation_(r.OrganisationID);
  const sections = {};

  form.items.forEach(function(item) {
    if (!sections[item.Section]) sections[item.Section] = [];
    sections[item.Section].push(item);
  });

  let body = `
    <div class="header">
      <h1>SISTEM LAPORAN BULANAN CGSO</h1>
      <h2>LAPORAN BULANAN</h2>
      <p><b>${escPrint_(org ? org.OrganisationName : r.OrganisationID)}</b></p>
      <p>${escPrint_(p.Month)} ${p.Year}</p>
    </div>
    <table class="meta">
      <tr><th>Status</th><td>${escPrint_(r.Status)}</td></tr>
      <tr><th>Tarikh Hantar</th><td>${escPrint_(formatDateTime_(r.SubmittedAt))}</td></tr>
      <tr><th>Tarikh Tutup</th><td>${escPrint_(formatDateTime_(p.CloseDate))}</td></tr>
    </table>`;

  Object.keys(sections).sort(function(a,b){ return Number(a)-Number(b); }).forEach(function(sec) {
    body += `<h2>Bahagian ${escPrint_(sec)}</h2><table class="items">
      <tr><th style="width:12%">Kod</th><th>Perkara</th><th style="width:15%">Status</th></tr>`;

    sections[sec].forEach(function(item) {
      const st = form.itemStatus[item.ItemCode] ? form.itemStatus[item.ItemCode].status : '-';
      body += `<tr><td>${escPrint_(item.ItemCode)}</td><td>${escPrint_(item.ItemName)}</td><td>${escPrint_(st)}</td></tr>`;

      const acts = form.activities.filter(function(a){ return String(a.ItemCode) === String(item.ItemCode); });
      if (acts.length) {
        body += `<tr><td></td><td colspan="2"><table class="records">
          <tr><th>Tarikh</th><th>Tajuk/Perkara</th><th>Lokasi</th><th>Pegawai</th><th>Catatan</th></tr>`;
        acts.forEach(function(a) {
          body += `<tr>
            <td>${escPrint_(a.StartDate || '')}${a.EndDate && a.EndDate !== a.StartDate ? ' - '+escPrint_(a.EndDate) : ''}</td>
            <td>${escPrint_(a.Title || '')}</td>
            <td>${escPrint_(a.Location || '')}</td>
            <td>${escPrint_(a.Officers || '')}</td>
            <td>${escPrint_(a.Notes || '')}</td>
          </tr>`;
        });
        body += `</table></td></tr>`;
      }
    });
    body += `</table>`;
  });

  return `<!doctype html><html><head><meta charset="utf-8">
    <style>
      @page{size:A4;margin:15mm}
      body{font-family:Arial,sans-serif;font-size:10pt;color:#222}
      h1{text-align:center;font-size:18pt;margin:0}
      h2{text-align:center;font-size:13pt;margin:5px 0 14px}
      .header{text-align:center;border-bottom:2px solid #222;padding-bottom:12px;margin-bottom:15px}
      table{width:100%;border-collapse:collapse;margin:8px 0 16px}
      th,td{border:1px solid #777;padding:6px;vertical-align:top}
      th{background:#eee}
      .meta th{width:25%;text-align:left}
      .items{page-break-inside:auto}
      .records{font-size:9pt;margin:0}
    </style></head><body>${body}</body></html>`;
}

function escPrint_(v) {
  return String(v == null ? '' : v)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}
