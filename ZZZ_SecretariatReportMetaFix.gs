/**
 * Secretariat report viewer metadata fix.
 * Enriches read-only report data with organisation name/code and
 * a month + year label for the Secretariat viewer.
 */
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
  if (p.Month && p.Year) {
    p.Label = String(p.Month) + ' ' + String(p.Year);
  }

  return data;
}
