/**
 * ============================================================
 * CGSO USER DASHBOARD
 * ============================================================
 * Read-only dashboard data for PREPARER / SUPERVISOR.
 * Organisation scope is enforced server-side.
 * Does not reset or rebuild the database.
 * ============================================================
 */

function getUserDashboard() {
  const user = getCurrentUser();
  assertAuthorized_(user);
  const role = String(user.role || '').trim().toUpperCase();
  if (role !== 'PREPARER' && role !== 'SUPERVISOR') {
    throw new Error('Dashboard ini adalah untuk pengguna PREPARER/SUPERVISOR.');
  }
  if (!user.organisationId || String(user.organisationId).toUpperCase() === 'SYSTEM') {
    throw new Error('Organisasi pengguna tidak ditetapkan.');
  }

  const org = findOrganisation_(user.organisationId);
  if (!org) throw new Error('Organisasi pengguna tidak dijumpai.');

  const tz = Session.getScriptTimeZone() || 'Asia/Kuala_Lumpur';
  const months = ['Januari','Februari','Mac','April','Mei','Jun','Julai','Ogos','September','Oktober','November','Disember'];
  const currentId = Utilities.formatDate(new Date(), tz, 'yyyy-MM');
  const currentPeriod = getCurrentOpenPeriod_();
  const targetId = currentPeriod ? normalizePeriodId_(currentPeriod.PeriodID) : currentId;

  const allReports = getAllReports_() || [];
  const orgReports = allReports.filter(function(r) {
    return String(r.OrganisationID || '') === String(user.organisationId);
  });

  function rank_(s) {
    s = String(s || '').toUpperCase();
    if (s === 'CLOSED') return 4;
    if (s === 'SUBMITTED') return 3;
    if (s === 'DRAFT') return 2;
    return 1;
  }
  function best_(a,b) {
    const rd = rank_(b.Status) - rank_(a.Status);
    if (rd !== 0) return rd;
    const da = a.UpdatedAt ? new Date(a.UpdatedAt).getTime() : 0;
    const db = b.UpdatedAt ? new Date(b.UpdatedAt).getTime() : 0;
    return db - da;
  }

  const byPeriod = {};
  orgReports.forEach(function(r) {
    const pid = normalizePeriodId_(r.PeriodID);
    if (!pid) return;
    if (!byPeriod[pid] || best_(r, byPeriod[pid]) < 0) byPeriod[pid] = r;
  });

  let currentReport = byPeriod[targetId] || null;
  if (!currentReport && targetId) {
    currentReport = getOrCreateReport_(targetId, user.organisationId);
    byPeriod[targetId] = currentReport;
  }

  function periodMeta_(pid) {
    const m = String(pid || '').match(/^(\d{4})-(\d{2})$/);
    if (!m) return null;
    const y = Number(m[1]), mn = Number(m[2]);
    return {
      PeriodID: pid,
      Month: months[mn - 1] || '',
      Year: y,
      Label: (months[mn - 1] || '') + ' ' + y,
      OpenDate: new Date(y, mn - 1, 1),
      CloseDate: new Date(y, mn, 7, 23, 59, 59)
    };
  }

  const history = Object.keys(byPeriod).sort().reverse().map(function(pid) {
    const r = byPeriod[pid];
    const p = periodMeta_(pid);
    let completion = Number(r.CompletionPercent || 0);
    if (String(r.Status || '').toUpperCase() === 'DRAFT' && r.ReportID) {
      try {
        const calculated = Number(calculateCompletion_(r.ReportID, user.organisationId));
        if (isFinite(calculated) && calculated > completion) completion = calculated;
      } catch (e) {}
    }
    return {
      periodId: pid,
      label: p ? p.Label : pid,
      month: p ? p.Month : '',
      year: p ? p.Year : '',
      status: String(r.Status || 'DRAFT').toUpperCase(),
      completion: completion,
      reportId: String(r.ReportID || ''),
      submittedAt: r.SubmittedAt || '',
      updatedAt: r.UpdatedAt || ''
    };
  });

  const lastSix = history.slice(0, 6).reverse();
  const completedCount = history.filter(function(x){ return x.status === 'SUBMITTED' || x.status === 'CLOSED'; }).length;
  const draftCount = history.filter(function(x){ return x.status === 'DRAFT'; }).length;

  let current = currentReport ? {
    reportId: String(currentReport.ReportID || ''),
    periodId: targetId,
    label: periodMeta_(targetId).Label,
    status: String(currentReport.Status || 'DRAFT').toUpperCase(),
    completion: Number(currentReport.CompletionPercent || 0),
    submittedAt: currentReport.SubmittedAt || '',
    updatedAt: currentReport.UpdatedAt || '',
    closeDate: periodMeta_(targetId).CloseDate
  } : null;

  if (current && current.status === 'DRAFT' && current.reportId) {
    try {
      const c = Number(calculateCompletion_(current.reportId, user.organisationId));
      if (isFinite(c) && c > current.completion) current.completion = c;
    } catch (e) {}
  }

  return safeForClient_({
    ok: true,
    user: user,
    organisation: {
      id: org.OrganisationID,
      code: org.Code,
      name: org.OrganisationName
    },
    period: currentPeriod ? safeForClient_(currentPeriod) : periodMeta_(targetId),
    current: current,
    history: history,
    performance: {
      labels: lastSix.map(function(x){ return x.label; }),
      values: lastSix.map(function(x){ return Number(x.completion || 0); }),
      completedCount: completedCount,
      draftCount: draftCount,
      totalReports: history.length,
      averageCompletion: lastSix.length ? Math.round(lastSix.reduce(function(s,x){return s+Number(x.completion||0);},0)/lastSix.length) : 0
    },
    attention: {
      needsAction: !!current && current.status === 'DRAFT',
      message: current && current.status === 'DRAFT' ? 'Laporan bulan semasa masih DRAF.' : 'Tiada tindakan segera diperlukan.'
    }
  });
}

/** Read-only report access for the same organisation only. */
function getUserReadOnlyReport(reportId) {
  const user = getCurrentUser();
  assertAuthorized_(user);
  const role = String(user.role || '').trim().toUpperCase();
  if (role !== 'PREPARER' && role !== 'SUPERVISOR') throw new Error('Akses tidak dibenarkan.');
  const id = String(reportId || '').trim();
  if (!id) throw new Error('ReportID tidak sah.');

  const report = (getAllReports_() || []).find(function(r){ return String(r.ReportID || '') === id; });
  if (!report) throw new Error('Laporan tidak dijumpai.');
  if (String(report.OrganisationID || '') !== String(user.organisationId || '')) {
    throw new Error('Anda tidak dibenarkan melihat laporan organisasi lain.');
  }
  return safeForClient_(getReportForm(id));
}
