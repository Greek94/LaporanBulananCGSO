# CGSO Monthly Reporting System — Release Checklist

## Production architecture

- `Code.gs` — primary web-app routing and core reporting logic.
- `Index.html` — primary homepage/user dashboard.
- `Report.html` — report preparation/submission interface.
- `Secretariat.html` — Secretariat/Admin dashboard.
- `SecretariatDashboard.gs` — Secretariat dashboard backend, historical periods, read-only report, print/PDF helpers.
- `SecretariatHistory.gs` — historical reporting-period support.
- `Database_Setup.gs` — database/schema setup and maintenance.

## Required deployment checks

1. Deploy the current `main` branch code to Google Apps Script as a **new version**.
2. Execute/authorize the project if Apps Script requests permissions.
3. Open the web app using an authorized account.
4. Verify homepage loads.
5. Verify Secretariat/Admin account can open `?page=secretariat`.
6. Verify current reporting period appears correctly.
7. Verify year/month historical selection works.
8. Verify organisation counts and statuses.
9. Open a submitted/draft report from the Secretariat dashboard.
10. Verify report details are read-only.
11. Verify finance/BKPS-special data is returned when applicable.
12. Verify print action.
13. Verify report preparation and submission from a PREPARER/SUPERVISOR account.
14. Verify unauthorized roles cannot access Secretariat functions.

## Important

Google Apps Script must contain the files from the repository using Apps Script-compatible names. Do not create duplicate `.gs` and `.html` files with the same base name.

No database sheet should be renamed or deleted as part of UI cleanup.
