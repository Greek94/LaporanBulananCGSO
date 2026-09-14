/**
 * ============================================================
 * CGSO - SECRETARIAT DASHBOARD FIX
 * ============================================================
 *
 * Tujuan:
 * - Mengatasi duplicate getSecretariatDashboardV2() dalam Code.gs
 *   dan SecretariatHistoryV2.gs.
 * - Pastikan Dashboard Urus Setia menerima periodId yang dipilih.
 * - Untuk DRAFT, kira kemajuan menggunakan calculateCompletion_()
 *   yang sama digunakan oleh Dashboard PIC.
 * - SUBMITTED/CLOSED dikekalkan dengan keutamaan status.
 *
 * READ-ONLY terhadap data laporan.
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

  if (!m) {
    throw new Error('PeriodID tidak sah: ' + pid);
  }

  const year = Number(m[1]);
  const monthNo = Number(m[2]);

  if (monthNo < 1 || monthNo > 12) {
    throw new Error('Bulan tidak sah: ' + pid);
  }

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

    // Untuk DRAFT yang masih menyimpan 0%, gunakan pengiraan yang sama
    // seperti Dashboard PIC. Nilai tidak ditulis kembali ke spreadsheet.
    if (report && status === 'DRAFT' && report.ReportID) {
      try {
        const calculated = Number(calculateCompletion_(report.ReportID, report.OrganisationID));
        if (isFinite(calculated) && calculated >= 0) {
          completion = calculated;
        }
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
