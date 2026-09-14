/**
 * CGSO Apps Script v4 — Secretariat Dashboard + Print/PDF
 *
 * Merge with v3/Phase 2 Code.gs. These functions add:
 * - Secretariat dashboard
 * - organisation status table
 * - read-only report view for Secretariat/Admin
 * - print-friendly HTML report
 * - PDF generation to Google Drive
 *
 * Access is server-side: PREPARER/SUPERVISOR cannot use these functions
 * for other organisations.
 */

function getSecretariatDashboard(periodId) {
  const user = getCurrentUser();
  assertAuthorized_(user);
  if (!['SECRETARIAT','ADMIN'].includes(String(user.role).toUpperCase())) {
    throw new Error('Akses ini hanya untuk Urus Setia/Admin.');
  }

  let period = periodId ? getPeriodById_(periodId) : getCurrentOpenPeriod_();

  // Jika tempoh sejarah tiada lagi dalam REPORT_PERIODS tetapi wujud dalam
  // REPORTS, bina metadata tempoh secara read-only supaya sejarah masih boleh
  // dipaparkan. Tiada data baharu ditulis ke spreadsheet.
  if (!period && periodId) {
    const pid = normalizePeriodId_(periodId);
    const m = String(pid || '').match(/^(\d{4})-(\d{2})$/);
    if (m) {
      const year = Number(m[1]);
      const monthNo = Number(m[2]);
      const months = ['Januari','Februari','Mac','April','Mei','Jun','Julai','Ogos','September','Oktober','November','Disember'];
      if (monthNo >= 1 && monthNo <= 12) {
        const openDate = new Date(year, monthNo - 1, 1);
        const closeDate = new Date(year, monthNo, 7, 23, 59, 59);
        period = {PeriodID: pid, Month: months[monthNo - 1], Year: year, Status: 'HISTORY', OpenDate: openDate, CloseDate: closeDate};
      }
    }
  }

  if (!period) throw new Error('Tempoh laporan tidak dijumpai.');

  const targetPeriodId = normalizePeriodId_(period.PeriodID) || String(period.PeriodID);
  const orgs = getActiveOrganisations_();
  const reports = getAllReports_().filter(r => {
    return (normalizePeriodId_(r.PeriodID) || String(r.PeriodID)) === targetPeriodId;
  });

  const rows = orgs.map(org => {
    const r = reports.find(x => String(x.OrganisationID) === String(org.OrganisationID));
    return {
      organisationId: org.OrganisationID,
      code: org.Code,
      name: org.OrganisationName,
      status: r ? r.Status : 'NOT_STARTED',
      completion: r ? Number(r.CompletionPercent || 0) : 0,
      submittedAt: r ? r.SubmittedAt : '',
      updatedAt: r ? r.UpdatedAt : '',
      reportId: r ? r.ReportID : ''
    };
  });

  return {
    period,
    summary: {
      total: rows.length,
      submitted: rows.filter(x => x.status === 'SUBMITTED').length,
      draft: rows.filter(x => x.status === 'DRAFT').length,
      closed: rows.filter(x => x.status === 'CLOSED').length,
      notStarted: rows.filter(x => x.status === 'NOT_STARTED').length
    },
    completionPercent: rows.length ? (rows.reduce((sum,x) => sum + Number(x.completion || 0), 0) / rows.length) : 0,
    rows
  };
}

/** Read-only report data for Secretariat/Admin. */
function getReadOnlyReport(reportId) {
  const user = getCurrentUser();
  assertAuthorized_(user);
  if (!['SECRETARIAT','ADMIN'].includes(String(user.role).toUpperCase())) {
    throw new Error('Akses ini hanya untuk Urus Setia/Admin.');
  }
  return getReportForm(reportId);
}

/**
 * Create a print-ready HTML file in Drive.
 * The generated HTML can be printed from the browser.
 */
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

/**
 * Generate a PDF in Drive using an HTML blob.
 */
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

  return {
    fileId:file.getId(),
    fileName:file.getName(),
    url:file.getUrl()
  };
}

function buildPrintableReportHtml_(form) {
  const p = form.period;
  const r = form.report;
  const org = findOrganisation_(r.OrganisationID);

  const sections = {};
  form.items.forEach(item => {
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

  Object.keys(sections).sort((a,b)=>Number(a)-Number(b)).forEach(sec => {
    body += `<h2>Bahagian ${escPrint_(sec)}</h2><table class="items">
      <tr><th style="width:12%">Kod</th><th>Perkara</th><th style="width:15%">Status</th></tr>`;

    sections[sec].forEach(item => {
      const st = form.itemStatus[item.ItemCode]?.status || '-';
      body += `<tr><td>${escPrint_(item.ItemCode)}</td><td>${escPrint_(item.ItemName)}</td><td>${escPrint_(st)}</td></tr>`;

      const acts = form.activities.filter(a => String(a.ItemCode) === String(item.ItemCode));
      if (acts.length) {
        body += `<tr><td></td><td colspan="2"><table class="records">
          <tr><th>Tarikh</th><th>Tajuk/Perkara</th><th>Lokasi</th><th>Pegawai</th><th>Catatan</th></tr>`;
        acts.forEach(a => {
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
