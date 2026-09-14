/**
 * ============================================================
 * CGSO - SEJARAH TEMPOH LAPORAN V2.2
 * ============================================================
 * READ-ONLY. Tidak mencipta, mengubah atau memadam rekod laporan.
 *
 * V2.2:
 * - Status SUBMITTED/CLOSED diberi keutamaan berbanding DRAFT.
 * - Untuk DRAFT, CompletionPercent dikira semula daripada status item
 *   sebenar jika nilai yang tersimpan masih lebih rendah.
 * ============================================================
 */

function getSecretariatPeriodsV2() {
  const user = getCurrentUser();
  assertAuthorized_(user);
  const role = String(user.role || '').trim().toUpperCase();
  if (role !== 'SECRETARIAT' && role !== 'ADMIN') {
    throw new Error('Akses ini hanya untuk Urus Setia/Admin.');
  }

  const tz = Session.getScriptTimeZone() || 'Asia/Kuala_Lumpur';
  const months = ['Januari','Februari','Mac','April','Mei','Jun','Julai','Ogos','September','Oktober','November','Disember'];
  const result = [];
  const seen = {};

  function addPeriod_(pid, status) {
    pid = normalizePeriodId_(pid);
    const m = pid.match(/^(\d{4})-(\d{2})$/);
    if (!m || seen[pid]) return;

    const year = Number(m[1]);
    const monthNo = Number(m[2]);
    if (monthNo < 1 || monthNo > 12) return;

    const openDate = new Date(year, monthNo - 1, 1);
    const closeDate = new Date(year, monthNo, 7, 23, 59, 59);

    seen[pid] = true;
    result.push({
      PeriodID: pid,
      Month: months[monthNo - 1],
      Year: year,
      Status: status || '',
      OpenDate: openDate,
      CloseDate: closeDate,
      Label: months[monthNo - 1] + ' ' + year
    });
  }

  const now = new Date();
  const currentYear = Number(Utilities.formatDate(now, tz, 'yyyy'));
  const currentMonth = Number(Utilities.formatDate(now, tz, 'M'));
  const startYear = 2025;

  for (let y = startYear; y <= currentYear; y++) {
    const lastMonth = (y === currentYear) ? currentMonth : 12;
    for (let m = 1; m <= lastMonth; m++) {
      const pid = y + '-' + String(m).padStart(2, '0');
      addPeriod_(pid, pid === y + '-' + String(lastMonth).padStart(2, '0') && y === currentYear ? 'OPEN' : 'HISTORICAL');
    }
  }

  try {
    getAllReports_().forEach(function(r) {
      addPeriod_(r.PeriodID, r.Status || 'HISTORICAL');
    });
  } catch (e) {}

  result.sort(function(a, b) {
    return String(b.PeriodID).localeCompare(String(a.PeriodID));
  });

  return safeForClient_(result);
}

function getSecretariatDashboardV2(periodId) {
  const user = getCurrentUser();
  assertAuthorized_(user);
  const role = String(user.role || '').trim().toUpperCase();
  if (role !== 'SECRETARIAT' && role !== 'ADMIN') {
    throw new Error('Akses ini hanya untuk Urus Setia/Admin.');
  }

  const tz = Session.getScriptTimeZone() || 'Asia/Kuala_Lumpur';
  const months = ['Januari','Februari','Mac','April','Mei','Jun','Julai','Ogos','September','Oktober','November','Disember'];
  const currentId = Utilities.formatDate(new Date(), tz, 'yyyy-MM');
  const pid = normalizePeriodId_(periodId || currentId);
  const match = pid.match(/^(\d{4})-(\d{2})$/);
  if (!match) throw new Error('PeriodID tidak sah: ' + pid);

  const year = Number(match[1]);
  const monthNo = Number(match[2]);
  if (monthNo < 1 || monthNo > 12) throw new Error('Bulan tidak sah: ' + pid);

  const period = {
    PeriodID: pid,
    Month: months[monthNo - 1],
    Year: year,
    Status: pid === currentId ? 'OPEN' : 'HISTORICAL',
    OpenDate: new Date(year, monthNo - 1, 1),
    CloseDate: new Date(year, monthNo, 7, 23, 59, 59),
    Label: months[monthNo - 1] + ' ' + year
  };

  const reports = getAllReports_().filter(function(r) {
    return normalizePeriodId_(r.PeriodID) === pid;
  });

  const statusRank_ = function(status) {
    status = String(status || '').trim().toUpperCase();
    if (status === 'CLOSED') return 3;
    if (status === 'SUBMITTED') return 2;
    if (status === 'DRAFT') return 1;
    return 0;
  };

  const orgs = getActiveOrganisations_();
  const rows = orgs.map(function(org) {
    const matches = reports.filter(function(r) {
      return String(r.OrganisationID) === String(org.OrganisationID);
    });

    matches.sort(function(a, b) {
      const rankDiff = statusRank_(b.Status) - statusRank_(a.Status);
      if (rankDiff !== 0) return rankDiff;

      const da = a.UpdatedAt ? new Date(a.UpdatedAt).getTime() : 0;
      const db = b.UpdatedAt ? new Date(b.UpdatedAt).getTime() : 0;
      return db - da;
    });

    const r = matches[0];
    let completion = r ? Number(r.CompletionPercent || 0) : 0;

    // DRAFT: jangan bergantung sepenuhnya pada CompletionPercent lama.
    // Kira semula berdasarkan REPORT_ITEM_STATUS supaya draf yang telah
    // diisi memaparkan kemajuan sebenar.
    if (r && String(r.Status || '').trim().toUpperCase() === 'DRAFT' && r.ReportID) {
      try {
        const calculated = Number(calculateCompletion_(r.ReportID, org.OrganisationID));
        if (isFinite(calculated) && calculated > completion) {
          completion = calculated;
        }
      } catch (e) {
        // Kekalkan nilai tersimpan jika pengiraan tidak dapat dibuat.
      }
    }

    return {
      organisationId: org.OrganisationID,
      code: org.Code,
      name: org.OrganisationName,
      status: r ? String(r.Status || 'DRAFT').trim().toUpperCase() : 'NOT_STARTED',
      completion: completion,
      submittedAt: r ? r.SubmittedAt : '',
      updatedAt: r ? r.UpdatedAt : '',
      reportId: r ? r.ReportID : ''
    };
  });

  return safeForClient_({
    period: period,
    summary: {
      total: rows.length,
      submitted: rows.filter(function(x){ return x.status === 'SUBMITTED'; }).length,
      draft: rows.filter(function(x){ return x.status === 'DRAFT'; }).length,
      closed: rows.filter(function(x){ return x.status === 'CLOSED'; }).length,
      notStarted: rows.filter(function(x){ return x.status === 'NOT_STARTED'; }).length
    },
    rows: rows
  });
}
