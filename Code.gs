/**
 * ============================================================
 * SISTEM LAPORAN BULANAN CGSO
 * VERSION 6.3
 * ============================================================
 *
 * AUTHENTICATION:
 * - Menggunakan Google Workspace account
 * - E-mel pengguna TIDAK di-hardcode
 * - Semua pengguna mesti wujud dalam USERS
 *
 * ADMIN / SECRETARIAT / SUPERVISOR / PREPARER
 * ditentukan berdasarkan column Role dalam USERS.
 *
 * ============================================================
 */


/* ============================================================
   CONFIGURATION
   ============================================================ */

const SHEETS = {
  CONFIG: 'CONFIG',
  ORGS: 'ORGANISATIONS',
  USERS: 'USERS',
  PERIODS: 'REPORT_PERIODS',
  REPORTS: 'REPORTS',
  ITEMS: 'REPORT_ITEMS',
  ACCESS: 'ORGANISATION_ITEM_ACCESS',
  STATUS: 'REPORT_ITEM_STATUS',
  ACTIVITIES: 'ACTIVITIES',
  MODULES: 'ORGANISATION_MODULE_ACCESS',
  FINANCE: 'FINANCE_BKP',
  BKPS: 'BKPS_SPECIAL',
  NOTIFICATIONS: 'NOTIFICATIONS',
  AUDIT: 'AUDIT_LOG'
};


/* ============================================================
   WEB APP
   ============================================================ */

function doGet(e) {

  try {

    /* ========================================================
       SYSTEM DIAGNOSTIC
       Boleh dibuka dengan ?page=health
       Tidak bergantung kepada JavaScript dashboard.
       ======================================================== */
    if (
      e &&
      e.parameter &&
      e.parameter.page === 'health'
    ) {

      const healthUser = getCurrentUser();
      if (
        !healthUser ||
        healthUser.authorized !== true ||
        !(hasRole_(healthUser, 'ADMIN') || hasRole_(healthUser, 'SECRETARIAT'))
      ) {
        return HtmlService.createHtmlOutput(
          '<h2>Akses Ditolak</h2><p>Semakan sistem hanya untuk ADMIN atau SECRETARIAT.</p>'
        );
      }

      const health = healthCheck();

      return HtmlService
        .createHtmlOutput(
          '<!doctype html><html><head><meta charset="UTF-8">' +
          '<title>CGSO System Health</title>' +
          '<style>body{font-family:Arial,sans-serif;background:#f4f7fb;padding:30px;color:#172b4d}' +
          '.card{max-width:900px;margin:auto;background:#fff;border-radius:14px;padding:28px;box-shadow:0 4px 18px rgba(0,0,0,.08)}' +
          'h1{margin-top:0}.ok{color:#087f5b}.bad{color:#b42318}pre{white-space:pre-wrap;background:#f7f8fa;padding:18px;border-radius:10px;line-height:1.5}' +
          '</style></head><body><div class="card">' +
          '<h1>CGSO System Health Check</h1>' +
          '<p class="' + (health.ok ? 'ok' : 'bad') + '"><b>' +
          (health.ok ? 'SYSTEM OK' : 'SYSTEM CHECK FAILED') +
          '</b></p><pre>' +
          escapeHtml_(JSON.stringify(health, null, 2)) +
          '</pre></div></body></html>'
        )
        .setXFrameOptionsMode(
          HtmlService.XFrameOptionsMode.ALLOWALL
        );
    }


    /* ========================================================
       DASHBOARD URUS SETIA / SECRETARIAT
       ======================================================== */
    if (
      e &&
      e.parameter &&
      e.parameter.page === 'secretariat'
    ) {

      const user = getCurrentUser();

      if (
        !user ||
        user.authorized !== true
      ) {
        return HtmlService.createHtmlOutput(
          '<h2>Akses Ditolak</h2><p>Pengguna tidak dibenarkan.</p>'
        );
      }

      const role = String(user.role || '').trim().toUpperCase();

      if (role !== 'ADMIN' && role !== 'SECRETARIAT') {
        return HtmlService.createHtmlOutput(
          '<h2>Akses Ditolak</h2><p>Dashboard Urus Setia hanya boleh diakses oleh ADMIN atau SECRETARIAT.</p>'
        );
      }

      return HtmlService
        .createTemplateFromFile('Secretariat')
        .evaluate()
        .setTitle('Dashboard Urus Setia - Sistem Laporan Bulanan CGSO')
        .setXFrameOptionsMode(
          HtmlService.XFrameOptionsMode.ALLOWALL
        );
    }


    if (
      e &&
      e.parameter &&
      e.parameter.page === 'report'
    ) {

      const template =
        HtmlService.createTemplateFromFile('Report');

      template.reportId =
        e.parameter.reportId || '';

      return template
        .evaluate()
        .setTitle('Borang Laporan Bulanan CGSO')
        .setXFrameOptionsMode(
          HtmlService.XFrameOptionsMode.ALLOWALL
        );
    }


    return HtmlService
      .createTemplateFromFile('Index')
      .evaluate()
      .setTitle('Sistem Laporan Bulanan CGSO')
      .setXFrameOptionsMode(
        HtmlService.XFrameOptionsMode.ALLOWALL
      );

  }

  catch (err) {

    // Jangan dedahkan stack trace kepada pengguna; log untuk pentadbir.
    console.error(err && err.stack ? err.stack : err);

    return HtmlService.createHtmlOutput(
      '<h2>Ralat Sistem</h2>' +
      '<p>' +
      escapeHtml_(err && err.message ? err.message : err) +
      '</p>'
    );
  }
}


function include(filename) {

  return HtmlService
    .createHtmlOutputFromFile(filename)
    .getContent();
}


/* ============================================================
   AUTHENTICATION
   ============================================================ */

/**
 * Mendapatkan pengguna berdasarkan Google Workspace account.
 *
 * TIADA e-mel yang di-hardcode.
 */
function getWebAppUrl(){
  return ScriptApp.getService().getUrl() || '';
}

function getCurrentUser() {

  try {

    const email =
      String(
        Session.getActiveUser().getEmail() || ''
      )
      .trim()
      .toLowerCase();


    if (!email) {

      return {
        authorized: false,
        reason: 'NO_EMAIL',
        email: '',
        message:
          'E-mel Google Workspace tidak dapat dikenal pasti.'
      };
    }


    /*
     * Cari pengguna dalam USERS.
     */
    const user =
      findUserByEmail_(email);


    /*
     * Jika tiada rekod dalam USERS.
     */
    if (!user) {

      return {

        authorized: false,

        reason: 'USER_NOT_FOUND',

        email: email,

        message:
          'Akaun ini belum didaftarkan dalam USERS.'
      };
    }


    /*
     * Semak status.
     */
    if (
      String(user.Status || '')
        .trim()
        .toUpperCase() !== 'ACTIVE'
    ) {

      return {

        authorized: false,

        reason: 'USER_INACTIVE',

        email: email,

        message:
          'Akaun anda tidak aktif dalam sistem.'
      };
    }


    /*
     * Cari organisasi pengguna.
     *
     * ADMIN / SECRETARIAT mungkin menggunakan
     * OrganisationID = SYSTEM.
     */
    let organisation = null;

    if (
      user.OrganisationID &&
      String(user.OrganisationID)
        .toUpperCase() !== 'SYSTEM'
    ) {

      organisation =
        findOrganisation_(
          user.OrganisationID
        );
    }


    return {

      authorized: true,

      email: email,

      userId:
        user.UserID || '',

      fullName:
        user.FullName ||
        email,

      role:
        String(user.Role || '')
          .trim()
          .toUpperCase(),

      roles:
        getAssignedRoles_(user.UserID || '', user.Role),

      organisationId:
        user.OrganisationID || '',

      organisationCode:
        organisation
          ? organisation.Code
          : 'SYSTEM',

      organisationName:
        organisation
          ? organisation.OrganisationName
          : 'Urus Setia / Pentadbir'
    };

  }

  catch (err) {

    /*
     * JANGAN pulangkan null.
     */
    return {

      authorized: false,

      reason: 'AUTH_ERROR',

      email: '',

      message:
        'Ralat authentication: ' +
        String(err.message || err)
    };
  }
}


/* ============================================================
   SYSTEM HEALTH CHECK
   READ-ONLY - tidak mencipta/mengubah laporan.
   ============================================================ */
function healthCheck() {

  const result = {
    ok: false,
    timestamp: new Date(),
    steps: [],
    user: null,
    spreadsheet: null,
    sheets: {},
    error: ''
  };

  try {
    result.steps.push('START');

    const db = getDb_();
    result.spreadsheet = {
      name: db.getName(),
      id: db.getId()
    };
    result.steps.push('SPREADSHEET_OK');

    const required = [
      SHEETS.CONFIG,
      SHEETS.ORGS,
      SHEETS.USERS,
      SHEETS.PERIODS,
      SHEETS.REPORTS,
      SHEETS.ITEMS,
      SHEETS.ACCESS,
      SHEETS.STATUS,
      SHEETS.ACTIVITIES
    ];

    required.forEach(function(name) {
      const sheet = db.getSheetByName(name);
      result.sheets[name] = !!sheet;
      if (!sheet) {
        throw new Error('Sheet "' + name + '" tidak dijumpai.');
      }
    });

    result.steps.push('SHEETS_OK');

    result.user = getCurrentUser();

    if (!result.user || result.user.authorized !== true) {
      result.steps.push('AUTH_FAILED');
      result.error = result.user && result.user.message
        ? result.user.message
        : 'Authentication gagal.';
      return safeForClient_(result);
    }

    result.steps.push('AUTH_OK');

    const period = getCurrentOpenPeriod_();
    result.period = period || null;
    result.steps.push('PERIOD_OK');

    result.ok = true;
    return safeForClient_(result);

  } catch (err) {
    result.error = String(err.stack || err.message || err);
    result.steps.push('ERROR');
    return safeForClient_(result);
  }
}


/* ============================================================
   DASHBOARD
   ============================================================ */

function getDashboardData() {

  const user =
    getCurrentUser();

  if (!user || user.authorized !== true) {
    return user || {
      authorized: false,
      reason: 'EMPTY_AUTH_RESPONSE',
      message: 'Maklumat pengguna tidak diterima.'
    };
  }

  try {

    /*
     * ========================================================
     * DASHBOARD ADALAH READ-ONLY
     * ========================================================
     *
     * Jangan panggil ensureCurrentReportingCycle_() di sini.
     * Fungsi tersebut mencipta period/report dan boleh menyebabkan
     * bilangan rekod berubah setiap kali dashboard dibuka/refresh.
     */
    const period =
      getCurrentOpenPeriod_();

    const result = {
      ok: true,
      authorized: true,
      user: user,
      period: safeForClient_(period),
      report: null,
      summary: {
        total: 0,
        totalOrganisations: 0,
        totalOrganizations: 0,
        organisationCount: 0,
        organizationCount: 0,
        submitted: 0,
        submittedCount: 0,
        draft: 0,
        draftCount: 0,
        closed: 0,
        closedCount: 0,
        notStarted: 0,
        notStartedCount: 0,
        completionPercent: 0,
        completionRate: 0,
        periodId: period ? period.PeriodID : '',
        totalExpected: 0,
        totalRecords: 0,
        rows: [],
        organisations: [],
        organizations: []
      },
      reportUrl: '',
      systemError: ''
    };

    /*
     * ========================================================
     * TIADA PERIOD OPEN
     * ========================================================
     */
    if (!period) {
      const organisations =
        getActiveOrganisations_() || [];

      const rows = organisations.map(function(org) {
        return {
          organisationId: org.OrganisationID || '',
          code: org.Code || '',
          name: org.OrganisationName || '',
          status: 'NOT_STARTED',
          completion: 0,
          reportId: '',
          submittedAt: '',
          updatedAt: ''
        };
      });

      result.summary.total = rows.length;
      result.summary.totalOrganisations = rows.length;
      result.summary.totalOrganizations = rows.length;
      result.summary.organisationCount = rows.length;
      result.summary.organizationCount = rows.length;
      result.summary.notStarted = rows.length;
      result.summary.notStartedCount = rows.length;
      result.summary.totalExpected = rows.length;
      result.summary.totalRecords = 0;
      result.summary.rows = rows;
      result.summary.organisations = rows;
      result.summary.organizations = rows;

      return safeForClient_(result);
    }

    /*
     * ========================================================
     * ADMIN / SECRETARIAT
     * ========================================================
     *
     * Baca ORGANISATIONS + REPORTS sahaja.
     * Tidak mencipta REPORTS.
     */
    const isAdmin =
      user.role === 'ADMIN' ||
      user.role === 'SECRETARIAT';

    if (isAdmin) {

      const organisations =
        getActiveOrganisations_() || [];

      const wantedPeriod =
        String(period.PeriodID || '').trim();

      const periodReports =
        getReportsByPeriod_(wantedPeriod) || [];

      /*
       * Jika terdapat duplicate report untuk organisasi yang sama,
       * pilih rekod terbaik supaya kiraan dashboard tidak berganda.
       */
      const reportMap = {};

      periodReports.forEach(function(report) {

        const orgId =
          String(report.OrganisationID || '').trim();

        if (!orgId) return;

        if (!reportMap[orgId]) {
          reportMap[orgId] = report;
        } else {
          reportMap[orgId] = findBestReportRecord_([
            reportMap[orgId],
            report
          ]);
        }
      });

      const rows =
        organisations.map(function(org) {

          const orgId =
            String(org.OrganisationID || '').trim();

          const report =
            reportMap[orgId] || null;

          let status = 'NOT_STARTED';
          let completion = 0;
          let reportId = '';
          let submittedAt = '';
          let updatedAt = '';

          if (report) {
            status = String(
              report.Status || 'DRAFT'
            ).trim().toUpperCase();

            // SubmittedAt ialah bukti penghantaran (rekod lama mungkin
            // telah ditukar kepada CLOSED oleh versi kod terdahulu).
            if (report.SubmittedAt) {
              status = 'SUBMITTED';
            }

            completion = Number(
              report.CompletionPercent || 0
            );

            reportId = String(
              report.ReportID || ''
            );

            submittedAt =
              report.SubmittedAt || '';

            updatedAt =
              report.UpdatedAt || '';
          }

          return {
            organisationId: org.OrganisationID || '',
            code: org.Code || '',
            name: org.OrganisationName || '',
            status: status,
            completion: completion,
            reportId: reportId,
            submittedAt: submittedAt,
            updatedAt: updatedAt
          };
        });

      const submitted =
        rows.filter(function(row) {
          return row.status === 'SUBMITTED';
        }).length;

      const draft =
        rows.filter(function(row) {
          return row.status === 'DRAFT';
        }).length;

      const closed =
        rows.filter(function(row) {
          return row.status === 'CLOSED';
        }).length;

      const notStarted =
        rows.filter(function(row) {
          return row.status === 'NOT_STARTED';
        }).length;

      const total = rows.length;

      const completionPercent =
        total > 0
          ? Math.round((submitted / total) * 100)
          : 0;

      result.summary = {
        periodId: wantedPeriod,
        total: total,
        totalExpected: total,
        totalRecords: periodReports.length,

        totalOrganisations: total,
        totalOrganizations: total,
        organisationCount: total,
        organizationCount: total,

        submitted: submitted,
        submittedCount: submitted,

        draft: draft,
        draftCount: draft,

        closed: closed,
        closedCount: closed,

        notStarted: notStarted,
        notStartedCount: notStarted,

        completionPercent: completionPercent,
        completionRate: completionPercent,

        rows: rows,
        organisations: rows,
        organizations: rows
      };

    } else {

      /*
       * ========================================================
       * PREPARER / SUPERVISOR
       * ========================================================
       *
       * Pengguna biasa hanya mendapatkan report organisasinya.
       * Jika report belum wujud, barulah ia dicipta.
       */
      if (
        user.organisationId &&
        String(user.organisationId).toUpperCase() !== 'SYSTEM'
      ) {

        const report =
          getOrCreateReport_(
            period.PeriodID,
            user.organisationId
          );

        result.report =
          safeForClient_(report);

        const webAppUrl =
          ScriptApp.getService().getUrl();

        if (
          webAppUrl &&
          report &&
          report.ReportID
        ) {
          result.reportUrl =
            webAppUrl +
            '?page=report&reportId=' +
            encodeURIComponent(report.ReportID);
        }
      }
    }

    return safeForClient_(result);

  } catch (err) {

    return safeForClient_({
      ok: false,
      authorized: true,
      user: user,
      period: null,
      report: null,
      summary: {
        total: 0,
        totalOrganisations: 0,
        totalOrganizations: 0,
        organisationCount: 0,
        organizationCount: 0,
        submitted: 0,
        submittedCount: 0,
        draft: 0,
        draftCount: 0,
        closed: 0,
        closedCount: 0,
        notStarted: 0,
        notStartedCount: 0,
        completionPercent: 0,
        completionRate: 0,
        rows: [],
        organisations: [],
        organizations: []
      },
      reportUrl: '',
      systemError: String(err.message || err),
      systemErrorDetail: String(err.stack || '')
    });
  }
}


/* ============================================================
   REPORTING PERIOD
   ============================================================ */

function ensureCurrentReportingCycle_() {
  // Semua langkah dalam satu lock: closeExpiredReportsAsSystem_() menulis
  // semula keseluruhan kolum Status dalam REPORTS. Tanpa lock, status
  // SUBMITTED yang baru disimpan oleh pengguna boleh ditimpa nilai lama.
  return withWriteLock_(function() {
  closeExpiredReportsAsSystem_();
  const period = createOrGetCurrentPeriod_();
  const organisations = getActiveOrganisations_() || [];
  if (!organisations.length) return period;

  // Baca REPORTS sekali dan indeks organisasi bagi tempoh ini.
  // Elakkan 24 panggilan findReport_ yang setiap satunya membaca seluruh sheet.
  {
    const sheet = getRequiredSheet_(SHEETS.REPORTS);
    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();
    if (lastColumn < 1) throw new Error('REPORTS tidak mempunyai header.');

    const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String);
    const periodIndex = headers.indexOf('PeriodID');
    const organisationIndex = headers.indexOf('OrganisationID');
    if (periodIndex < 0 || organisationIndex < 0) {
      throw new Error('Kolum PeriodID atau OrganisationID tidak dijumpai dalam REPORTS.');
    }

    const existing = new Set();
    if (lastRow >= 2) {
      const values = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
      values.forEach(function(row) {
        if (normalizePeriodId_(row[periodIndex]) === normalizePeriodId_(period.PeriodID)) {
          existing.add(String(row[organisationIndex] || '').trim());
        }
      });
    }

    const missing = organisations.filter(function(org) {
      return !existing.has(String(org.OrganisationID || '').trim());
    });

    if (missing.length) {
      const rows = missing.map(function(org) {
        const row = new Array(headers.length).fill('');
        setByHeader_(headers, row, 'ReportID', 'R-' + Utilities.getUuid());
        setByHeader_(headers, row, 'PeriodID', normalizePeriodId_(period.PeriodID));
        setByHeader_(headers, row, 'OrganisationID', org.OrganisationID);
        setByHeader_(headers, row, 'Status', 'DRAFT');
        setByHeader_(headers, row, 'CompletionPercent', 0);
        setByHeader_(headers, row, 'UpdatedAt', new Date());
        return row;
      });

      // Satu penulisan pukal, bukannya appendRow berulang.
      ensureTextColumn_(sheet, headers, 'PeriodID');
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
    }
  }

  return period;
  });
}

/* getUserReportingPeriods() ditakrif dalam UserDashboard.gs.
   Versi pendua di sini telah dibuang supaya tiada konflik nama. */


/* ============================================================
   CREATE / GET CURRENT PERIOD
   ============================================================ */

function createOrGetCurrentPeriod_() {

  const sheet =
    getRequiredSheet_(
      SHEETS.PERIODS
    );


  const values =
    sheet
      .getDataRange()
      .getValues();


  if (!values.length) {

    throw new Error(
      'REPORT_PERIODS tidak mempunyai header.'
    );
  }


  const headers =
    values.shift();


  const idx =
    headerIndexes_(
      headers,
      [
        'PeriodID',
        'Month',
        'Year',
        'OpenDate',
        'CloseDate',
        'Status'
      ]
    );


  const now =
    new Date();


  const timezone =
    Session.getScriptTimeZone() ||
    'Asia/Kuala_Lumpur';


  const periodId =
    Utilities.formatDate(
      now,
      timezone,
      'yyyy-MM'
    );


  /*
   * Cari tempoh sedia ada.
   */
  const existingIndex =
    values.findIndex(
      function(row) {

        return normalizePeriodId_(
          row[idx.PeriodID]
        ) === periodId;

      }
    );


  /*
   * Jika sudah wujud.
   */
  if (existingIndex >= 0) {

    const row =
      values[existingIndex];


    const openDate =
      parseDate_(
        row[idx.OpenDate]
      ) ||
      new Date(
        now.getFullYear(),
        now.getMonth(),
        1,
        0,
        0,
        0
      );


    const closeDate =
      parseDate_(
        row[idx.CloseDate]
      ) ||
      new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        7,
        23,
        59,
        59
      );


    row[idx.OpenDate] =
      openDate;

    row[idx.CloseDate] =
      closeDate;


    row[idx.Status] =
      new Date() <= closeDate
        ? 'OPEN'
        : 'CLOSED';

    // Tulis semula PeriodID sebagai teks kanonik (YYYY-MM).
    row[idx.PeriodID] =
      periodId;

    ensureTextColumn_(
      sheet,
      headers,
      'PeriodID'
    );


    sheet
      .getRange(
        existingIndex + 2,
        1,
        1,
        row.length
      )
      .setValues([row]);


    return rowToObject_(
      headers,
      row
    );
  }


  /*
   * Tempoh baharu.
   */
  const openDate =
    new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      0,
      0,
      0
    );


  const closeDate =
    new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      7,
      23,
      59,
      59
    );


  const row =
    new Array(
      headers.length
    ).fill('');


  row[idx.PeriodID] =
    periodId;


  row[idx.Month] =
    Utilities.formatDate(
      openDate,
      timezone,
      'MMMM'
    );


  row[idx.Year] =
    now.getFullYear();


  row[idx.OpenDate] =
    openDate;


  row[idx.CloseDate] =
    closeDate;


  row[idx.Status] =
    'OPEN';


  if (
    idx.CreatedAt !== undefined
  ) {

    row[idx.CreatedAt] =
      new Date();
  }


  ensureTextColumn_(
    sheet,
    headers,
    'PeriodID'
  );

  sheet.appendRow(row);


  return rowToObject_(
    headers,
    row
  );
}



/* ============================================================
   PERIOD ID NORMALIZER
   Handles Google Sheets Date values and text date values.
   Returns canonical YYYY-MM.
   ============================================================ */

function normalizePeriodId_(value) {

  if (value === null || value === undefined || value === '') {
    return '';
  }

  /* Google Sheets may return PeriodID as a Date object. */
  if (Object.prototype.toString.call(value) === '[object Date]') {

    if (isNaN(value.getTime())) {
      return '';
    }

    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone() || 'Asia/Kuala_Lumpur',
      'yyyy-MM'
    );
  }

  const text = String(value).trim();

  if (!text) {
    return '';
  }

  /* Already canonical: YYYY-MM */
  let m = text.match(/^(\d{4})-(\d{1,2})$/);

  if (m) {
    return m[1] + '-' + String(m[2]).padStart(2, '0');
  }

  /* ISO date/time: YYYY-MM-DD... */
  m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);

  if (m) {
    return m[1] + '-' + String(m[2]).padStart(2, '0');
  }

  /*
   * Google Sheets can stringify a Date as:
   * 01/09/2026
   * 01/09/2026 08:00:00
   * 01/09/2026 08:00:00 GMT+0800 (...)
   */
  m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);

  if (m) {
    return m[3] + '-' + String(m[2]).padStart(2, '0');
  }

  /*
   * Last-resort date parsing. Only accept if JavaScript can
   * parse it and the resulting year/month are sensible.
   */
  const parsed = new Date(text);

  if (!isNaN(parsed.getTime())) {

    return Utilities.formatDate(
      parsed,
      Session.getScriptTimeZone() || 'Asia/Kuala_Lumpur',
      'yyyy-MM'
    );
  }

  return text;
}

/* ============================================================
   GET CURRENT OPEN PERIOD
   ============================================================ */

function getCurrentOpenPeriod_() {

  const sheet =
    getDb_()
      .getSheetByName(
        SHEETS.PERIODS
      );


  if (!sheet) return null;


  const values =
    sheet
      .getDataRange()
      .getValues();


  if (values.length < 2) {
    return null;
  }


  const headers =
    values.shift();


  const now =
    new Date();


  const periods =
    values

      .map(
        function(row) {

          return rowToObject_(
            headers,
            row
          );

        }
      )

      .map(
        function(period) {

          period.OpenDate =
            parseDate_(
              period.OpenDate
            );

          period.CloseDate =
            parseDate_(
              period.CloseDate
            );

          return period;

        }
      )

      .filter(
        function(period) {

          return (
            period.PeriodID &&
            period.OpenDate &&
            period.CloseDate
          );

        }
      )

      .filter(
        function(period) {

          return (
            now >= period.OpenDate &&
            now <= period.CloseDate
          );

        }
      )

      .filter(
        function(period) {

          return (
            String(
              period.Status
            ).toUpperCase() !==
            'CLOSED'
          );

        }
      )

      /*
       * Tempoh bulan M dibuka 1hb M dan ditutup 7hb M+1, jadi pada
       * 1–7hb dua tempoh terbuka serentak. Tempoh "semasa" ialah yang
       * PALING HAMPIR TUTUP (yang perlu dihantar dahulu), bukan yang
       * terbaharu. Ini mempengaruhi dashboard pengguna dan e-mel reminder.
       */
      .sort(
        function(a,b) {

          const diff =
            a.CloseDate.getTime() -
            b.CloseDate.getTime();

          if (diff !== 0) return diff;

          return String(
            normalizePeriodId_(a.PeriodID)
          ).localeCompare(
            String(normalizePeriodId_(b.PeriodID))
          );

        }
      );


  return periods[0] || null;
}


/* ============================================================
   REPORT
   ============================================================ */

function getOrCreateReport_(
  periodId,
  organisationId
) {

  /*
   * Mencegah duplicate REPORT apabila beberapa request Dashboard
   * berjalan serentak.
   */
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(30000)) {
    throw new Error(
      'Sistem sedang memproses laporan. Sila cuba semula sebentar lagi.'
    );
  }

  try {

    /* Semakan pertama. */
    let existing =
      findReport_(
        periodId,
        organisationId
      );

    if (existing) {
      return existing;
    }

    /* Semakan kedua selepas lock diperoleh. */
    existing =
      findReport_(
        periodId,
        organisationId
      );

    if (existing) {
      return existing;
    }

    const sheet =
      getRequiredSheet_(
        SHEETS.REPORTS
      );

    const headers =
      sheet
        .getRange(
          1,
          1,
          1,
          sheet.getLastColumn()
        )
        .getValues()[0];

    const reportId =
      'R-' +
      Utilities.getUuid();

    const row =
      new Array(
        headers.length
      ).fill('');

    setByHeader_(
      headers,
      row,
      'ReportID',
      reportId
    );

    setByHeader_(
      headers,
      row,
      'PeriodID',
      normalizePeriodId_(periodId)
    );

    setByHeader_(
      headers,
      row,
      'OrganisationID',
      organisationId
    );

    setByHeader_(
      headers,
      row,
      'Status',
      'DRAFT'
    );

    setByHeader_(
      headers,
      row,
      'CompletionPercent',
      0
    );

    setByHeader_(
      headers,
      row,
      'UpdatedAt',
      new Date()
    );

    ensureTextColumn_(
      sheet,
      headers,
      'PeriodID'
    );

    sheet.appendRow(row);

    return getReportById_(
      reportId
    );

  }
  finally {
    lock.releaseLock();
  }
}


/* ============================================================
   REPORT FORM
   ============================================================ */

function getReportForm(
  reportId
) {

  const user =
    getCurrentUser();


  assertAuthorized_(
    user
  );


  const report =
    getReportById_(
      reportId
    );


  assertReportAccess_(
    user,
    report
  );


  const period =
    getPeriodById_(
      report.PeriodID
    );


  if (!period) {

    throw new Error(
      'Tempoh laporan tidak dijumpai.'
    );
  }


  return safeForClient_({

    user: user,

    report: report,

    period: period,

    items:
      getVisibleItemsForOrganisation_(
        report.OrganisationID
      ),

    itemStatus:
      getItemStatuses_(
        reportId
      ),

    activities:
      getActivities_(
        reportId
      ),

    editable:
      isReportEditable_(
        report,
        period
      ),

    modules:
      getModulesForOrganisation_(
        report.OrganisationID
      ),

    finance:
      hasModule_(report.OrganisationID, 'FINANCE_BKP')
        ? getFinanceRows_(reportId)
        : [],

    bkpsSpecial:
      hasModule_(report.OrganisationID, 'SPECIAL_BKPS')
        ? getBkpsRows_(reportId)
        : []
  });
}


function hasModule_(
  organisationId,
  moduleCode
) {
  return getModulesForOrganisation_(organisationId).some(function(m) {
    return String(m.ModuleCode || '').trim().toUpperCase() === moduleCode;
  });
}


/* ============================================================
   SAVE REPORT
   ============================================================ */

function saveReportForm(
  reportId,
  formData
) {

  const user =
    getCurrentUser();

  assertAuthorized_(
    user
  );

  /*
   * Semua penulisan bagi satu simpanan dijalankan dalam SATU lock.
   * replaceActivities_() memadam dan menambah baris; tanpa lock,
   * dua simpanan serentak boleh memadam baris milik laporan lain.
   */
  withWriteLock_(function() {
    saveReportFormUnlocked_(
      user,
      reportId,
      formData
    );
  });

  return getReportForm(
    reportId
  );
}


/**
 * Simpan draf tanpa mengambil lock.
 * MESTI dipanggil dari dalam withWriteLock_().
 */
function saveReportFormUnlocked_(
  user,
  reportId,
  formData
) {

  const report =
    getReportById_(
      reportId
    );

  assertReportAccess_(
    user,
    report
  );

  assertEditable_(
    report
  );

  const allowed =
    new Set(
      getVisibleItemsForOrganisation_(
        report.OrganisationID
      )
      .map(
        function(item) {
          return String(
            item.ItemCode
          );
        }
      )
    );

  const items =
    formData &&
    Array.isArray(
      formData.items
    )
      ? formData.items
      : [];

  const validItems = items.filter(function(item) {
    return item && allowed.has(String(item.itemCode));
  });

  upsertItemStatuses_(
    reportId,
    validItems,
    user.userId
  );

  replaceActivities_(
    reportId,
    formData &&
    Array.isArray(
      formData.activities
    )
      ? formData.activities
      : [],
    allowed,
    user.userId
  );

  /*
   * Modul khas: hanya disimpan jika organisasi mempunyai modul tersebut
   * dalam ORGANISATION_MODULE_ACCESS.
   */
  const moduleCodes =
    getModulesForOrganisation_(
      report.OrganisationID
    ).map(function(m) {
      return String(m.ModuleCode || '').trim().toUpperCase();
    });

  if (moduleCodes.indexOf('FINANCE_BKP') >= 0) {
    replaceFinanceRows_(
      reportId,
      formData && Array.isArray(formData.finance) ? formData.finance : [],
      user.userId
    );
  }

  if (moduleCodes.indexOf('SPECIAL_BKPS') >= 0) {
    replaceBkpsRows_(
      reportId,
      formData && Array.isArray(formData.bkpsSpecial) ? formData.bkpsSpecial : [],
      user.userId
    );
  }

  SpreadsheetApp.flush();

  const completion =
    calculateCompletion_(
      reportId,
      report.OrganisationID
    );

  updateReport_(
    reportId,
    {
      UpdatedAt:
        new Date(),

      CompletionPercent:
        completion
    }
  );

  writeAudit_(
    reportId,
    user.userId,
    'EDIT_FORM',
    'Simpan draf. Completion=' +
      completion +
      '%'
  );

  return report;
}


/* ============================================================
   SUBMIT REPORT
   ============================================================ */

function submitReportForm(
  reportId,
  formData
) {

  const user =
    getCurrentUser();

  assertAuthorized_(
    user
  );

  /*
   * Semakan awal di luar lock supaya ralat validasi
   * dipulangkan dengan cepat tanpa menunggu lock.
   */
  const precheck =
    getReportById_(
      reportId
    );

  assertReportAccess_(
    user,
    precheck
  );

  assertEditable_(
    precheck
  );

  const validation =
    validateReportForm_(
      precheck,
      formData
    );

  if (!validation.ok) {
    return {
      ok: false,
      errors:
        validation.errors
    };
  }

  /*
   * Simpan + tukar status secara atomik dalam satu lock.
   */
  withWriteLock_(function() {

    saveReportFormUnlocked_(
      user,
      reportId,
      formData
    );

    updateReport_(
      reportId,
      {
        Status:
          'SUBMITTED',

        SubmittedBy:
          user.userId,

        SubmittedAt:
          new Date(),

        UpdatedAt:
          new Date(),

        CompletionPercent:
          100
      }
    );

    writeAudit_(
      reportId,
      user.userId,
      'SUBMIT',
      'Laporan dihantar.'
    );
  });

  /*
   * E-mel dihantar selepas lock dilepaskan supaya
   * pengguna lain tidak menunggu MailApp.
   */
  try {

    sendSubmissionNotifications_(
      reportId
    );

  }

  catch (err) {

    writeAudit_(
      reportId,
      user.userId,
      'NOTIFICATION_ERROR',
      String(
        err.message || err
      )
    );
  }

  return {

    ok: true,

    report:
      safeForClient_(
        getReportById_(
          reportId
        )
      ),

    form:
      getReportForm(
        reportId
      )
  };
}


/**
 * Jalankan fn dalam script lock bagi semua penulisan laporan.
 */
function withWriteLock_(
  fn
) {

  const lock =
    LockService.getScriptLock();

  if (!lock.tryLock(30000)) {
    throw new Error(
      'Sistem sedang memproses laporan lain. Sila cuba semula sebentar lagi.'
    );
  }

  try {
    return fn();
  }

  finally {
    lock.releaseLock();
  }
}


/* ============================================================
   ITEMS
   ============================================================ */

function getVisibleItemsForOrganisation_(
  organisationId
) {
  const itemSheet = getRequiredSheet_(SHEETS.ITEMS);
  const accessSheet = getRequiredSheet_(SHEETS.ACCESS);

  const itemValues = itemSheet.getDataRange().getValues();
  if (itemValues.length < 2) return [];

  const itemHeaders = itemValues.shift();
  const items = {};
  itemValues.forEach(function(row) {
    const item = rowToObject_(itemHeaders, row);
    items[String(item.ItemCode)] = item;
  });

  // Fetch only access records for the requested organisation.
  const accessLastRow = accessSheet.getLastRow();
  const accessLastColumn = accessSheet.getLastColumn();
  if (accessLastRow < 2 || accessLastColumn < 1) return [];

  const accessHeaders = accessSheet.getRange(1, 1, 1, accessLastColumn).getValues()[0];
  const organisationIndex = accessHeaders.indexOf('OrganisationID');
  if (organisationIndex < 0) {
    throw new Error('Kolum OrganisationID tidak dijumpai dalam ORGANISATION_ITEM_ACCESS.');
  }

  const matches = accessSheet
    .getRange(2, organisationIndex + 1, accessLastRow - 1, 1)
    .createTextFinder(String(organisationId))
    .matchEntireCell(true)
    .matchCase(true)
    .findAll();

  return matches
    .map(function(match) {
      const row = accessSheet.getRange(match.getRow(), 1, 1, accessLastColumn).getValues()[0];
      return rowToObject_(accessHeaders, row);
    })
    .filter(function(access) {
      return String(access.Active).toUpperCase() === 'TRUE';
    })
    .sort(function(a, b) {
      return Number(a.DisplayOrder || 0) - Number(b.DisplayOrder || 0);
    })
    .map(function(access) {
      const item = items[String(access.ItemCode)];
      if (!item) return null;

      return {
        ItemCode: item.ItemCode,
        Section: Number(item.Section || 0),
        ItemName: item.ItemName,
        InputType: item.InputType,
        Fields: String(item.Fields || '').split(';').map(function(value) {
          return value.trim();
        }).filter(Boolean),
        Required: String(access.Required).toUpperCase() === 'TRUE',
        DisplayOrder: Number(access.DisplayOrder || 0)
      };
    })
    .filter(Boolean);
}

/* ============================================================
   ITEM STATUS
   ============================================================ */

function getItemStatuses_(
  reportId
) {
  const sheet = getDb_().getSheetByName(SHEETS.STATUS);
  if (!sheet) return {};

  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) return {};

  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String);
  const reportIndex = headers.indexOf('ReportID');
  const itemIndex = headers.indexOf('ItemCode');
  const statusIndex = headers.indexOf('Status');
  const updatedByIndex = headers.indexOf('UpdatedBy');
  const updatedAtIndex = headers.indexOf('UpdatedAt');

  if (reportIndex < 0 || itemIndex < 0 || statusIndex < 0) {
    throw new Error('Header ReportID, ItemCode atau Status tidak dijumpai dalam REPORT_ITEM_STATUS.');
  }

  // Cari baris laporan berkenaan sahaja, bukan membina objek untuk seluruh sheet.
  const matches = sheet.getRange(2, reportIndex + 1, lastRow - 1, 1)
    .createTextFinder(String(reportId))
    .matchEntireCell(true)
    .matchCase(true)
    .findAll();

  const result = {};
  matches.forEach(function(match) {
    const row = sheet.getRange(match.getRow(), 1, 1, lastColumn).getValues()[0];
    result[String(row[itemIndex] || '')] = {
      status: String(row[statusIndex] || ''),
      updatedBy: updatedByIndex >= 0 ? row[updatedByIndex] || '' : '',
      updatedAt: updatedAtIndex >= 0 ? row[updatedAtIndex] || '' : ''
    };
  });

  return result;
}


/* ============================================================
   UPSERT STATUS
   ============================================================ */

/**
 * Simpan semua status item bagi satu laporan dengan satu bacaan
 * bagi helaian REPORT_ITEM_STATUS. Rekod laporan lain tidak disentuh.
 */
function upsertItemStatuses_(
  reportId,
  items,
  userId
) {
  const requested = Array.isArray(items) ? items : [];
  if (!requested.length) return;

  // Normalisasi dan sahkan sebelum mengubah helaian.
  const normalized = requested.map(function(item) {
    const status = String(item.status || '').toUpperCase();
    if (!['ADA', 'TIADA', ''].includes(status)) {
      throw new Error('Status item tidak sah.');
    }
    return {
      itemCode: String(item.itemCode || ''),
      status: status
    };
  }).filter(function(item) {
    return item.itemCode !== '';
  });

  if (!normalized.length) return;

  // Nota: tiada lock di sini. Pemanggil (saveReportFormUnlocked_)
  // sudah berada dalam withWriteLock_().
  {
    const sheet = getRequiredSheet_(SHEETS.STATUS);
    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();
    if (lastRow < 1 || lastColumn < 1) {
      throw new Error('REPORT_ITEM_STATUS tidak mempunyai header.');
    }

    const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String);
    const reportIdx = headers.indexOf('ReportID');
    const itemIdx = headers.indexOf('ItemCode');
    const recordIdx = headers.indexOf('RecordID');

    if (reportIdx < 0 || itemIdx < 0 || recordIdx < 0) {
      throw new Error('Header ReportID, ItemCode atau RecordID tidak dijumpai dalam REPORT_ITEM_STATUS.');
    }

    const values = lastRow >= 2
      ? sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues()
      : [];

    const rowByItem = new Map();
    values.forEach(function(row, index) {
      if (String(row[reportIdx] || '') === String(reportId)) {
        const key = String(row[itemIdx] || '');
        // Kekalkan rekod sedia ada yang pertama; duplicate lama tidak dipadam.
        if (!rowByItem.has(key)) rowByItem.set(key, index + 2);
      }
    });

    const now = new Date();
    const rowsToAppend = [];

    normalized.forEach(function(item) {
      const rowNumber = rowByItem.get(item.itemCode);
      const row = new Array(headers.length).fill('');

      setByHeader_(headers, row, 'RecordID', rowNumber
        ? String(values[rowNumber - 2][recordIdx] || '')
        : 'RS-' + Utilities.getUuid());
      setByHeader_(headers, row, 'ReportID', reportId);
      setByHeader_(headers, row, 'ItemCode', item.itemCode);
      setByHeader_(headers, row, 'Status', item.status);
      setByHeader_(headers, row, 'UpdatedBy', userId);
      setByHeader_(headers, row, 'UpdatedAt', now);

      if (rowNumber) {
        sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
      } else {
        rowsToAppend.push(row);
      }
    });

    if (rowsToAppend.length) {
      const appendAt = sheet.getLastRow() + 1;
      sheet.getRange(appendAt, 1, rowsToAppend.length, lastColumn).setValues(rowsToAppend);
    }
  }
}


/* ============================================================
   ACTIVITIES
   ============================================================ */

function getActivities_(
  reportId
) {
  const sheet = getDb_().getSheetByName(SHEETS.ACTIVITIES);
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) return [];

  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const reportIndex = headers.indexOf('ReportID');
  if (reportIndex < 0) {
    throw new Error('Kolum ReportID tidak dijumpai dalam ACTIVITIES.');
  }

  // Search only rows belonging to this report; do not read the entire activity log.
  const matches = sheet
    .getRange(2, reportIndex + 1, lastRow - 1, 1)
    .createTextFinder(String(reportId))
    .matchEntireCell(true)
    .matchCase(true)
    .findAll();

  return matches.map(function(match) {
    const row = sheet.getRange(match.getRow(), 1, 1, lastColumn).getDisplayValues()[0];
    return rowToObject_(headers, row);
  });
}


function replaceActivities_(
  reportId,
  activities,
  allowed,
  userId
) {

  const sheet =
    getDb_()
      .getSheetByName(
        SHEETS.ACTIVITIES
      );


  if (!sheet) {
    return;
  }


  const values =
    sheet
      .getDataRange()
      .getValues();


  if (!values.length) {
    return;
  }


  const headers =
    values.shift();


  const reportIdx =
    headers.indexOf(
      'ReportID'
    );


  deleteRowsForReport_(
    sheet,
    values,
    reportIdx,
    reportId
  );


  const rows = [];


  (activities || [])
    .forEach(
      function(activity) {

        if (
          !allowed.has(
            String(
              activity.itemCode
            )
          )
        ) {
          return;
        }


        const row =
          new Array(
            headers.length
          ).fill('');


        setByHeader_(
          headers,
          row,
          'ActivityID',
          activity.activityId ||
            'A-' +
            Utilities.getUuid()
        );


        setByHeader_(
          headers,
          row,
          'ReportID',
          reportId
        );


        setByHeader_(
          headers,
          row,
          'ItemCode',
          activity.itemCode
        );


        setByHeader_(
          headers,
          row,
          'StartDate',
          safeText_(activity.startDate, 20)
        );


        setByHeader_(
          headers,
          row,
          'EndDate',
          safeText_(activity.endDate, 20)
        );


        setByHeader_(
          headers,
          row,
          'TimeStart',
          safeText_(activity.timeStart, 20)
        );


        setByHeader_(
          headers,
          row,
          'TimeEnd',
          safeText_(activity.timeEnd, 20)
        );


        setByHeader_(
          headers,
          row,
          'Title',
          safeText_(activity.title)
        );


        setByHeader_(
          headers,
          row,
          'Agency',
          safeText_(activity.agency)
        );


        setByHeader_(
          headers,
          row,
          'Location',
          safeText_(activity.location)
        );


        setByHeader_(
          headers,
          row,
          'LocationType',
          safeText_(activity.locationType)
        );


        setByHeader_(
          headers,
          row,
          'Officers',
          safeText_(activity.officers)
        );


        setByHeader_(
          headers,
          row,
          'Speakers',
          safeText_(activity.speakers)
        );


        setByHeader_(
          headers,
          row,
          'Participants',
          num_(
            activity.participants
          )
        );


        setByHeader_(
          headers,
          row,
          'CandidatesPresent',
          num_(
            activity.candidatesPresent
          )
        );


        setByHeader_(
          headers,
          row,
          'CandidatesAbsent',
          num_(
            activity.candidatesAbsent
          )
        );


        setByHeader_(
          headers,
          row,
          'Quantity',
          num_(
            activity.quantity
          )
        );


        setByHeader_(
          headers,
          row,
          'Notes',
          safeText_(activity.notes)
        );


        setByHeader_(
          headers,
          row,
          'UpdatedBy',
          userId
        );


        setByHeader_(
          headers,
          row,
          'UpdatedAt',
          new Date()
        );


        rows.push(row);
      }
    );


  if (rows.length) {
    const startRow = sheet.getLastRow() + 1;
    const target = sheet.getRange(
      startRow,
      1,
      rows.length,
      rows[0].length
    );

    // Simpan masa sebagai teks untuk elak penukaran timezone.
    ['TimeStart','TimeEnd'].forEach(function(name){
      const idx = headers.indexOf(name);
      if(idx >= 0){
        sheet.getRange(startRow, idx + 1, rows.length, 1)
          .setNumberFormat('@');
      }
    });

    target.setValues(rows);
  }
}



/* ============================================================
   MODUL KHAS: KEWANGAN BKP & TAPISAN BKPS
   ============================================================ */

/**
 * Padam semua baris milik reportId dalam sheet, dari bawah ke atas,
 * menggunakan julat berturutan. MESTI dipanggil dalam withWriteLock_().
 *
 * @param values  data tanpa baris header (baris 2 = values[0])
 */
function deleteRowsForReport_(
  sheet,
  values,
  reportIdx,
  reportId
) {
  if (reportIdx < 0) {
    throw new Error('Kolum ReportID tidak dijumpai dalam ' + sheet.getName() + '.');
  }

  const rowsToDelete = [];
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][reportIdx]) === String(reportId)) {
      rowsToDelete.push(i + 2);
    }
  }

  const ranges = [];
  rowsToDelete.forEach(function(rowNumber) {
    const last = ranges[ranges.length - 1];
    if (last && rowNumber === last.start + last.count) {
      last.count++;
    } else {
      ranges.push({ start: rowNumber, count: 1 });
    }
  });

  for (let i = ranges.length - 1; i >= 0; i--) {
    sheet.deleteRows(ranges[i].start, ranges[i].count);
  }
}


/**
 * Ganti semua baris sesuatu laporan dalam sheet dengan rows baharu.
 * rows = array objek {NamaHeader: nilai}.
 */
function replaceReportRows_(
  sheetName,
  reportId,
  rows
) {
  const sheet = getRequiredSheet_(sheetName);
  const values = sheet.getDataRange().getValues();
  if (!values.length) {
    throw new Error(sheetName + ' tidak mempunyai header.');
  }

  const headers = values.shift().map(String);

  deleteRowsForReport_(
    sheet,
    values,
    headers.indexOf('ReportID'),
    reportId
  );

  if (!rows.length) return;

  const output = rows.map(function(obj) {
    return headers.map(function(h) {
      return Object.prototype.hasOwnProperty.call(obj, h) ? obj[h] : '';
    });
  });

  sheet
    .getRange(sheet.getLastRow() + 1, 1, output.length, headers.length)
    .setValues(output);
}


/**
 * Ambil nilai medan tanpa mengira huruf besar/kecil (Category / category).
 * Borang memuatkan rekod dengan kunci huruf besar (dari Sheet) dan menulis
 * suntingan pengguna dengan kunci huruf kecil, jadi huruf kecil diutamakan.
 */
function pick_(
  obj,
  name
) {
  if (!obj) return '';
  const lower = name.charAt(0).toLowerCase() + name.slice(1);
  if (obj[lower] !== undefined && obj[lower] !== null) return obj[lower];
  if (obj[name] !== undefined && obj[name] !== null) return obj[name];
  return '';
}


function getFinanceRows_(
  reportId
) {
  return getRecordsByReportIdFromSheet_(SHEETS.FINANCE, reportId);
}


function replaceFinanceRows_(
  reportId,
  finance,
  userId
) {
  const now = new Date();

  const rows = (finance || [])
    .filter(function(x) {
      // Abaikan baris kosong sepenuhnya.
      return ['Category', 'Code', 'Description', 'Approved', 'Revised', 'Actual', 'Commitment']
        .some(function(k) { return String(pick_(x, k)).trim() !== '' && String(pick_(x, k)) !== '0'; });
    })
    .slice(0, 200)
    .map(function(x) {
      const approved = Number(num_(pick_(x, 'Approved')) || 0);
      const revised = Number(num_(pick_(x, 'Revised')) || 0);
      const actual = Number(num_(pick_(x, 'Actual')) || 0);
      const commitment = Number(num_(pick_(x, 'Commitment')) || 0);

      // Peruntukan berkuat kuasa = pindaan jika ada, jika tidak peruntukan asal.
      const base = revised || approved;
      const used = actual + commitment;

      return {
        FinanceID: String(pick_(x, 'FinanceID')).trim() || 'F-' + Utilities.getUuid(),
        ReportID: reportId,
        Category: safeText_(pick_(x, 'Category'), 200),
        Code: safeText_(pick_(x, 'Code'), 50),
        Description: safeText_(pick_(x, 'Description'), 500),
        Approved: approved,
        Revised: revised,
        Actual: actual,
        Commitment: commitment,
        Balance: Math.round((base - used) * 100) / 100,
        Percentage: base ? Math.round(used / base * 10000) / 100 : 0,
        UpdatedBy: userId,
        UpdatedAt: now
      };
    });

  replaceReportRows_(SHEETS.FINANCE, reportId, rows);
}


/**
 * Senarai lokasi tapisan BKPS: BKPS + semua Pejabat CGSO Negeri/Wilayah aktif.
 */
function getBkpsLocations_() {
  const orgs = getActiveOrganisations_();
  const locations = [{ LocationCode: 'BKPS', LocationName: 'Bahagian Keselamatan Personel (BKPS)' }];

  orgs
    .filter(function(o) {
      const type = String(o.Type || '').trim().toUpperCase();
      return type === 'NEGERI' || type === 'WILAYAH';
    })
    .forEach(function(o) {
      locations.push({
        LocationCode: String(o.Code || o.OrganisationID),
        LocationName: String(o.OrganisationName || o.Code)
      });
    });

  return locations.map(function(loc, i) {
    loc.DisplayOrder = i + 1;
    return loc;
  });
}


/**
 * Rekod BKPS bagi laporan. Jika belum ada, pulangkan senarai lokasi
 * lalai dengan nilai 0 supaya jadual dalam borang tidak kosong.
 */
function getBkpsRows_(
  reportId
) {
  const saved = getRecordsByReportIdFromSheet_(SHEETS.BKPS, reportId);
  const byCode = {};
  saved.forEach(function(r) { byCode[String(r.LocationCode)] = r; });

  const merged = getBkpsLocations_().map(function(loc) {
    const r = byCode[loc.LocationCode];
    delete byCode[loc.LocationCode];
    return {
      RecordID: r ? r.RecordID : '',
      LocationCode: loc.LocationCode,
      LocationName: loc.LocationName,
      DisplayOrder: loc.DisplayOrder,
      DecisionsReceived: r ? Number(r.DecisionsReceived || 0) : 0,
      DecisionsProcessed: r ? Number(r.DecisionsProcessed || 0) : 0
    };
  });

  // Kekalkan rekod lama bagi lokasi yang tiada lagi dalam senarai.
  Object.keys(byCode).forEach(function(code) {
    merged.push(byCode[code]);
  });

  return merged;
}


function replaceBkpsRows_(
  reportId,
  rowsIn,
  userId
) {
  const now = new Date();
  const allowed = {};
  getBkpsLocations_().forEach(function(loc) { allowed[loc.LocationCode] = loc; });

  const rows = (rowsIn || [])
    .filter(function(x) { return allowed[String(pick_(x, 'LocationCode'))]; })
    .map(function(x) {
      const loc = allowed[String(pick_(x, 'LocationCode'))];
      const received = Math.max(0, Math.floor(Number(num_(pick_(x, 'DecisionsReceived')) || 0)));
      const processed = Math.max(0, Math.floor(Number(num_(pick_(x, 'DecisionsProcessed')) || 0)));
      return {
        RecordID: String(pick_(x, 'RecordID')).trim() || 'B-' + Utilities.getUuid(),
        ReportID: reportId,
        LocationCode: loc.LocationCode,
        LocationName: loc.LocationName,
        DisplayOrder: loc.DisplayOrder,
        DecisionsReceived: received,
        DecisionsProcessed: processed,
        UpdatedBy: userId,
        UpdatedAt: now
      };
    });

  replaceReportRows_(SHEETS.BKPS, reportId, rows);
}


/**
 * Bersihkan teks pengguna sebelum ditulis ke Sheet:
 * - had panjang
 * - elak formula injection (=, +, -, @ di awal teks dijadikan teks biasa)
 */
function safeText_(
  value,
  maxLength
) {
  let text = String(value === null || value === undefined ? '' : value).trim();
  text = text.slice(0, maxLength || 2000);
  if (/^[=+\-@\t\r]/.test(text)) {
    text = "'" + text;
  }
  return text;
}


/* ============================================================
   VALIDATION
   ============================================================ */

function validateReportForm_(
  report,
  formData
) {

  const errors = [];


  const items =
    getVisibleItemsForOrganisation_(
      report.OrganisationID
    );


  const submitted = {};


  (
    formData &&
    Array.isArray(
      formData.items
    )
      ? formData.items
      : []
  )
  .forEach(
    function(item) {

      submitted[
        String(
          item.itemCode
        )
      ] =
        String(
          item.status || ''
        ).toUpperCase();

    }
  );


  items.forEach(
    function(item) {

      if (!item.Required) {
        return;
      }


      const status =
        submitted[
          item.ItemCode
        ] || '';


      if (
        ![
          'ADA',
          'TIADA'
        ].includes(status)
      ) {

        errors.push(
          item.ItemCode +
          ' — ' +
          item.ItemName +
          ': sila pilih ADA atau TIADA.'
        );

        return;
      }


      if (
        status === 'ADA'
      ) {

        const activityTypes = [

          'ACTIVITY',
          'ACTIVITY_RANGE',
          'ADVICE',
          'ADVICE_AGENCY',
          'COMPANY_CHECK',
          'INSPECTION',
          'DISTRIBUTION',
          'COUNT',
          'TRAINING',
          'EXAMINATION'
        ];


        if (
          activityTypes.includes(
            item.InputType
          )
        ) {

          const count =
            (
              formData &&
              formData.activities
                ? formData.activities
                : []
            )
            .filter(
              function(activity) {

                return String(
                  activity.itemCode
                ) === String(
                  item.ItemCode
                );

              }
            )
            .length;


          if (
            count === 0
          ) {

            errors.push(
              item.ItemCode +
              ' — ' +
              item.ItemName +
              ': sekurang-kurangnya satu rekod diperlukan.'
            );
          }
        }
      }
    }
  );


  return {

    ok:
      errors.length === 0,

    errors:
      errors
  };
}


/* ============================================================
   COMPLETION
   ============================================================ */

function calculateCompletion_(
  reportId,
  organisationId
) {

  const items =
    getVisibleItemsForOrganisation_(
      organisationId
    )
    .filter(
      function(item) {
        return item.Required;
      }
    );


  if (!items.length) {
    return 0;
  }


  const statuses =
    getItemStatuses_(
      reportId
    );


  const completed =
    items.filter(
      function(item) {

        return [
          'ADA',
          'TIADA'
        ].includes(
          String(
            statuses[
              item.ItemCode
            ]?.status || ''
          ).toUpperCase()
        );
      }
    ).length;


  return Math.round(
    completed /
    items.length *
    10000
  ) / 100;
}


/* ============================================================
   ACCESS CONTROL
   ============================================================ */

function assertAuthorized_(
  user
) {

  if (
    !user ||
    user.authorized !== true
  ) {

    throw new Error(
      user && user.message
        ? user.message
        : 'Akses tidak dibenarkan.'
    );
  }
}


/**
 * Semak sama ada pengguna mempunyai peranan tertentu.
 * Menggunakan senarai roles (USER_ROLES) dan jatuh balik kepada USERS.Role.
 */
function hasRole_(
  user,
  role
) {
  if (!user) return false;
  const wanted = String(role || '').trim().toUpperCase();
  const roles = Array.isArray(user.roles) && user.roles.length
    ? user.roles
    : [user.role];
  return roles.some(function(r) {
    return String(r || '').trim().toUpperCase() === wanted;
  });
}


/**
 * Untuk fungsi pentadbiran (setup database, diagnostik).
 *
 * Dibenarkan jika:
 * - pemilik/pendeploy skrip menjalankannya terus dari editor Apps Script
 *   (active user === effective user), ATAU
 * - pengguna berdaftar dengan peranan ADMIN.
 *
 * Ini menghalang pengguna domain lain memanggil fungsi pentadbiran
 * melalui google.script.run dari pelayar.
 */
function assertAdminOrOwner_() {
  const active = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  const effective = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();

  if (active && effective && active === effective) {
    return { owner: true, email: active };
  }

  const user = getCurrentUser();
  assertAuthorized_(user);

  if (!hasRole_(user, 'ADMIN')) {
    throw new Error('Fungsi ini hanya untuk ADMIN.');
  }

  return user;
}


function assertReportAccess_(
  user,
  report
) {

  /*
   * ADMIN / SECRETARIAT
   * boleh melihat semua organisasi.
   */
  if (
    user.role === 'ADMIN' ||
    user.role === 'SECRETARIAT'
  ) {
    return;
  }


  /*
   * Pengguna biasa hanya boleh
   * melihat organisasinya sendiri.
   */
  if (
    String(
      report.OrganisationID
    ) !== String(
      user.organisationId
    )
  ) {

    throw new Error(
      'Anda tidak mempunyai akses kepada laporan ini.'
    );
  }
}


/* ============================================================
   EDITABLE
   ============================================================ */

function isReportEditable_(
  report,
  period
) {

  if (
    String(
      report.Status
    ).toUpperCase() ===
    'CLOSED'
  ) {

    return false;
  }


  const close =
    parseDate_(
      period.CloseDate
    );


  return (
    !!close &&
    new Date() <= close
  );
}


function assertEditable_(
  report
) {

  if (
    String(
      report.Status
    ).toUpperCase() ===
    'CLOSED'
  ) {

    throw new Error(
      'Laporan telah ditutup.'
    );
  }


  const period =
    getPeriodById_(
      report.PeriodID
    );


  if (!period) {

    throw new Error(
      'Tempoh laporan tidak dijumpai.'
    );
  }


  const close =
    parseDate_(
      period.CloseDate
    );


  if (
    !close ||
    new Date() > close
  ) {

    throw new Error(
      'Tempoh pindaan telah tamat.'
    );
  }
}


/* ============================================================
   AUTO CLOSE
   ============================================================ */

function closeExpiredReportsAsSystem_() {
  const db = getDb_();
  const periodSheet = db.getSheetByName(SHEETS.PERIODS);
  const reportSheet = db.getSheetByName(SHEETS.REPORTS);
  if (!periodSheet || !reportSheet) return;

  const periodLastRow = periodSheet.getLastRow();
  const periodLastColumn = periodSheet.getLastColumn();
  if (periodLastRow < 2 || periodLastColumn < 1) return;

  const periodValues = periodSheet.getRange(1, 1, periodLastRow, periodLastColumn).getValues();
  const periodHeaders = periodValues[0].map(String);
  const closeIndex = periodHeaders.indexOf('CloseDate');
  const statusIndex = periodHeaders.indexOf('Status');
  const periodIdIndex = periodHeaders.indexOf('PeriodID');
  if (closeIndex < 0 || statusIndex < 0 || periodIdIndex < 0) return;

  const now = new Date();
  const closedPeriods = new Set();
  const periodStatusUpdates = periodValues.slice(1).map(function(row) {
    const closeDate = parseDate_(row[closeIndex]);
    const status = String(row[statusIndex] || '').trim().toUpperCase();
    if (closeDate && now > closeDate && status !== 'CLOSED') {
      closedPeriods.add(normalizePeriodId_(row[periodIdIndex]));
      return ['CLOSED'];
    }
    return [row[statusIndex]];
  });

  if (!closedPeriods.size) return;

  // Kemaskini satu kolum secara pukal, bukan setValues bagi setiap baris.
  periodSheet.getRange(2, statusIndex + 1, periodStatusUpdates.length, 1).setValues(periodStatusUpdates);

  const reportLastRow = reportSheet.getLastRow();
  const reportLastColumn = reportSheet.getLastColumn();
  if (reportLastRow < 2 || reportLastColumn < 1) return;

  const reportValues = reportSheet.getRange(1, 1, reportLastRow, reportLastColumn).getValues();
  const reportHeaders = reportValues[0].map(String);
  const reportPeriodIndex = reportHeaders.indexOf('PeriodID');
  const reportStatusIndex = reportHeaders.indexOf('Status');
  if (reportPeriodIndex < 0 || reportStatusIndex < 0) return;

  const reportSubmittedAtIndex = reportHeaders.indexOf('SubmittedAt');

  /*
   * Hanya laporan yang BELUM dihantar ditukar kepada CLOSED.
   * Laporan SUBMITTED kekal SUBMITTED supaya dashboard sejarah
   * boleh membezakan "dihantar" dengan "tidak dihantar".
   */
  const reportStatusUpdates = reportValues.slice(1).map(function(row) {
    const pid = normalizePeriodId_(row[reportPeriodIndex]);
    const status = String(row[reportStatusIndex] || '').trim().toUpperCase();
    const submitted =
      status === 'SUBMITTED' ||
      (reportSubmittedAtIndex >= 0 && row[reportSubmittedAtIndex] !== '' && row[reportSubmittedAtIndex] !== null);

    if (closedPeriods.has(pid) && !submitted) {
      return ['CLOSED'];
    }
    return [row[reportStatusIndex]];
  });

  reportSheet.getRange(2, reportStatusIndex + 1, reportStatusUpdates.length, 1).setValues(reportStatusUpdates);
}

/* ============================================================
   ORGANISATION
   ============================================================ */

function getActiveOrganisations_() {

  const sheet =
    getRequiredSheet_(
      SHEETS.ORGS
    );


  const values =
    sheet
      .getDataRange()
      .getValues();


  if (
    values.length < 2
  ) {
    return [];
  }


  const headers =
    values.shift();


  return values

    .map(
      function(row) {

        return rowToObject_(
          headers,
          row
        );

      }
    )

    .filter(
      function(org) {

        return String(
          org.IsActive
        ).toUpperCase() ===
        'TRUE';

      }
    );
}


/* ============================================================
   USERS
   ============================================================ */

function findUserByEmail_(
  email
) {

  return findRow_(
    SHEETS.USERS,
    'Email',
    email,
    true
  );
}


function findUserById_(
  userId
) {

  return findRow_(
    SHEETS.USERS,
    'UserID',
    userId,
    false
  );
}


/* ============================================================
   ORGANISATION
   ============================================================ */

function findOrganisation_(
  organisationId
) {

  return findRow_(
    SHEETS.ORGS,
    'OrganisationID',
    organisationId,
    false
  );
}


/* ============================================================
   PERIOD
   ============================================================ */

function getPeriodById_(
  periodId
) {

  const sheet =
    getRequiredSheet_(
      SHEETS.PERIODS
    );

  const values =
    sheet
      .getDataRange()
      .getValues();

  if (values.length < 2) {
    return null;
  }

  const headers = values.shift();
  const periodIndex = headers.indexOf('PeriodID');
  const wanted = normalizePeriodId_(periodId);

  if (periodIndex < 0 || !wanted) {
    return null;
  }

  const row = values.find(function(row) {
    return normalizePeriodId_(row[periodIndex]) === wanted;
  });

  return row
    ? rowToObject_(headers, row)
    : null;
}


/* ============================================================
   REPORT LOOKUP
   ============================================================ */

/**
 * Membaca laporan untuk satu tempoh sahaja.
 * Mengurangkan kerja pemetaan objek bagi rekod tempoh lama.
 * READ-ONLY; tiada cache supaya status sentiasa terkini.
 */
function getReportsByPeriod_(periodId) {
  const wantedPeriod = normalizePeriodId_(periodId);
  if (!wantedPeriod) return [];

  const sheet = getRequiredSheet_(SHEETS.REPORTS);
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) return [];

  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String);
  const periodIndex = headers.indexOf('PeriodID');
  if (periodIndex < 0) {
    throw new Error('Kolum PeriodID tidak dijumpai dalam REPORTS.');
  }

  const requiredFields = [
    'PeriodID',
    'OrganisationID',
    'Status',
    'CompletionPercent',
    'ReportID',
    'SubmittedAt',
    'UpdatedAt'
  ];
  const indices = {};
  requiredFields.forEach(function(field) {
    indices[field] = headers.indexOf(field);
  });

  // Baca sekali dan tapis menggunakan normalizePeriodId_().
  // TextFinder tidak sepadan jika Sheets menyimpan PeriodID sebagai Date,
  // dan getRange() bagi setiap baris adalah perlahan.
  const values = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();

  return values.filter(function(row) {
    return normalizePeriodId_(row[periodIndex]) === wantedPeriod;
  }).map(function(row) {
    const report = {};
    requiredFields.forEach(function(field) {
      const index = indices[field];
      report[field] = index >= 0 ? row[index] : '';
    });
    return report;
  });
}

function getAllReports_() {

  const sheet =
    getRequiredSheet_(
      SHEETS.REPORTS
    );


  const values =
    sheet
      .getDataRange()
      .getValues();


  if (
    values.length < 2
  ) {
    return [];
  }


  const headers =
    values.shift();


  return values.map(
    function(row) {

      return rowToObject_(
        headers,
        row
      );

    }
  );
}


function findReport_(
  periodId,
  organisationId
) {

  const wantedPeriod =
    normalizePeriodId_(periodId);

  const wantedOrg =
    String(organisationId || '').trim();

  return getAllReports_()
    .find(function(report) {

      return (
        normalizePeriodId_(report.PeriodID) === wantedPeriod &&
        String(report.OrganisationID || '').trim() === wantedOrg
      );

    }) || null;
}




/* ============================================================
   READ-ONLY REPORT FOR URUS SETIA / ADMIN
   ============================================================ */

/**
 * Mengambil satu laporan lengkap untuk paparan "Lihat"
 * pada Dashboard Urus Setia.
 *
 * Fungsi ini READ-ONLY:
 * - tidak mengubah REPORTS
 * - tidak mengubah REPORT_ITEM_STATUS
 * - tidak mengubah ACTIVITIES
 * - tidak mencipta report baharu
 */
/**
 * Pembantu generik untuk membaca rekod berdasarkan ReportID.
 * Tidak mengubah sheet.
 */
function getRecordsByReportIdFromSheet_(
  sheetName,
  reportId
) {

  const sheet =
    getDb_().getSheetByName(sheetName);

  if (!sheet) {
    return [];
  }

  const values =
    sheet.getDataRange().getValues();

  if (values.length < 2) {
    return [];
  }

  const headers = values.shift();

  const reportIdIndex =
    headers.indexOf('ReportID');

  if (reportIdIndex < 0) {
    return [];
  }

  return values
    .filter(function(row) {
      return String(
        row[reportIdIndex] || ''
      ) === String(reportId);
    })
    .map(function(row) {
      return rowToObject_(
        headers,
        row
      );
    });
}

/* ============================================================
   DASHBOARD URUS SETIA V2
   READ ONLY
   ============================================================ */

/* ============================================================
   REPORT BY ID
   ============================================================ */

function getReportById_(reportId) {
  const sheet = getRequiredSheet_(SHEETS.REPORTS);
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) {
    throw new Error('Laporan tidak dijumpai.');
  }

  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String);
  const idIndex = headers.indexOf('ReportID');
  if (idIndex < 0) throw new Error('Kolum ReportID tidak dijumpai dalam REPORTS.');

  // Cari terus dalam kolum ID menggunakan TextFinder, bukan membaca semua laporan.
  const match = sheet.getRange(2, idIndex + 1, lastRow - 1, 1)
    .createTextFinder(String(reportId))
    .matchEntireCell(true)
    .matchCase(true)
    .findNext();

  if (!match) throw new Error('Laporan tidak dijumpai.');

  const row = sheet.getRange(match.getRow(), 1, 1, lastColumn).getValues()[0];
  return rowToObject_(headers, row);
}

/* ============================================================
   UPDATE REPORT
   ============================================================ */

function updateReport_(reportId, patch) {
  const sheet = getRequiredSheet_(SHEETS.REPORTS);
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) throw new Error('Laporan tidak dijumpai.');

  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String);
  const idIndex = headers.indexOf('ReportID');
  if (idIndex < 0) throw new Error('Kolum ReportID tidak dijumpai dalam REPORTS.');

  const match = sheet.getRange(2, idIndex + 1, lastRow - 1, 1)
    .createTextFinder(String(reportId))
    .matchEntireCell(true)
    .matchCase(true)
    .findNext();

  if (!match) throw new Error('Laporan tidak dijumpai.');

  const rowNumber = match.getRow();
  const row = sheet.getRange(rowNumber, 1, 1, lastColumn).getValues()[0];

  Object.keys(patch || {}).forEach(function(key) {
    const index = headers.indexOf(key);
    if (index >= 0) row[index] = patch[key];
  });

  sheet.getRange(rowNumber, 1, 1, lastColumn).setValues([row]);
}

/* ============================================================
   MODULES
   ============================================================ */

function getModulesForOrganisation_(
  organisationId
) {
  const sheet = getDb_().getSheetByName(SHEETS.MODULES);
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) return [];

  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const organisationIndex = headers.indexOf('OrganisationID');
  if (organisationIndex < 0) {
    throw new Error('Kolum OrganisationID tidak dijumpai dalam MODULES.');
  }

  const matches = sheet
    .getRange(2, organisationIndex + 1, lastRow - 1, 1)
    .createTextFinder(String(organisationId))
    .matchEntireCell(true)
    .matchCase(true)
    .findAll();

  return matches
    .map(function(match) {
      const row = sheet.getRange(match.getRow(), 1, 1, lastColumn).getValues()[0];
      return rowToObject_(headers, row);
    })
    .filter(function(module) {
      return String(module.Active).toUpperCase() === 'TRUE';
    });
}

/* ============================================================
   REPORT SELECTION HELPER
   ============================================================ */

/**
 * Pilih rekod laporan terbaik jika terdapat duplicate
 * bagi OrganisationID + PeriodID yang sama.
 * Keutamaan: SUBMITTED > CLOSED > DRAFT,
 * kemudian CompletionPercent, kemudian UpdatedAt/CreatedAt.
 */
function findBestReportRecord_(records) {
  if (!records || !records.length) return null;

  const statusRank = {
    SUBMITTED: 3,
    CLOSED: 2,
    DRAFT: 1
  };

  return records.slice().sort(function(a, b) {
    const ar = statusRank[String(a.Status || '').trim().toUpperCase()] || 0;
    const br = statusRank[String(b.Status || '').trim().toUpperCase()] || 0;

    if (br !== ar) return br - ar;

    const ac = Number(a.CompletionPercent || 0);
    const bc = Number(b.CompletionPercent || 0);

    if (bc !== ac) return bc - ac;

    const ad =
      parseDate_(a.UpdatedAt) ||
      parseDate_(a.CreatedAt) ||
      new Date(0);

    const bd =
      parseDate_(b.UpdatedAt) ||
      parseDate_(b.CreatedAt) ||
      new Date(0);

    return bd.getTime() - ad.getTime();
  })[0];
}


/* ============================================================
   SUMMARY
   ============================================================ */

function getPeriodSummary_(
  periodId
) {
  if (!periodId) return null;

  const reports = getReportsByPeriod_(periodId);
  const total = getActiveOrganisations_().length;

  // Ringkasan dikira berdasarkan satu rekod terbaik setiap organisasi,
  // supaya rekod pendua tidak menggandakan kiraan status.
  const byOrganisation = {};
  reports.forEach(function(report) {
    const organisationId = String(report.OrganisationID || '').trim();
    if (!organisationId) return;
    if (!byOrganisation[organisationId]) byOrganisation[organisationId] = [];
    byOrganisation[organisationId].push(report);
  });

  const statusRank = function(report) {
    const status = String(report.Status || '').trim().toUpperCase();
    if (report.SubmittedAt || status === 'SUBMITTED') return 3;
    if (status === 'DRAFT') return 2;
    if (status === 'CLOSED') return 1;
    return 0;
  };

  const selected = Object.keys(byOrganisation).map(function(organisationId) {
    const candidates = byOrganisation[organisationId];
    candidates.sort(function(a, b) {
      const rankDifference = statusRank(b) - statusRank(a);
      if (rankDifference !== 0) return rankDifference;

      const completionDifference =
        Number(b.CompletionPercent || 0) - Number(a.CompletionPercent || 0);
      if (completionDifference !== 0) return completionDifference;

      const aDate = parseDate_(a.UpdatedAt) || new Date(0);
      const bDate = parseDate_(b.UpdatedAt) || new Date(0);
      return bDate.getTime() - aDate.getTime();
    });
    return candidates[0];
  });

  const submitted = selected.filter(function(report) {
    return statusRank(report) === 3;
  }).length;

  const draft = selected.filter(function(report) {
    return String(report.Status || '').trim().toUpperCase() === 'DRAFT' &&
      statusRank(report) === 2;
  }).length;

  const closed = selected.filter(function(report) {
    return String(report.Status || '').trim().toUpperCase() === 'CLOSED' &&
      !report.SubmittedAt;
  }).length;

  return {
    periodId: periodId,
    totalExpected: total,
    totalRecords: selected.length,
    submitted: submitted,
    draft: draft,
    closed: closed,
    notStarted: Math.max(0, total - submitted - draft - closed),
    completionRate: total
      ? Math.round(submitted / total * 10000) / 100
      : 0
  };
}

/* ============================================================
   EMAIL
   ============================================================ */

/* ============================================================
   ADMIN USER MANAGEMENT
   ============================================================ */
function getUserRolesSheet_() {
  const db = getDb_();
  let sheet = db.getSheetByName('USER_ROLES');
  if (!sheet) {
    sheet = db.insertSheet('USER_ROLES');
    sheet.getRange(1,1,1,5).setValues([['UserID','Role','IsActive','AssignedAt','AssignedBy']]);
  } else if (sheet.getLastRow() === 0) {
    sheet.getRange(1,1,1,5).setValues([['UserID','Role','IsActive','AssignedAt','AssignedBy']]);
  }
  return sheet;
}

function getAssignedRoles_(userId, legacyRole) {
  const fallback = String(legacyRole || '').trim().toUpperCase();
  if (!userId) return fallback ? [fallback] : [];
  const sheet = getUserRolesSheet_();
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return fallback ? [fallback] : [];
  const headers = values[0].map(String);
  const userIndex = headers.indexOf('UserID');
  const roleIndex = headers.indexOf('Role');
  const activeIndex = headers.indexOf('IsActive');
  if (userIndex < 0 || roleIndex < 0 || activeIndex < 0) return fallback ? [fallback] : [];
  const roles = [];
  values.slice(1).forEach(function(row) {
    if (String(row[userIndex] || '').trim() !== String(userId)) return;
    const active = String(row[activeIndex] || '').trim().toUpperCase();
    const role = String(row[roleIndex] || '').trim().toUpperCase();
    if ((active === 'TRUE' || active === 'ACTIVE' || active === '1') &&
        ['PREPARER','SUPERVISOR','SECRETARIAT','ADMIN'].indexOf(role) >= 0 &&
        roles.indexOf(role) < 0) roles.push(role);
  });
  return roles.length ? roles : (fallback ? [fallback] : []);
}

function assertAdminUserManagement_() {
  const current = getCurrentUser();
  assertAuthorized_(current);
  if (String(current.role || '').toUpperCase() !== 'ADMIN') {
    throw new Error('Fungsi pengurusan pengguna hanya untuk ADMIN.');
  }
  return current;
}

function getAdminUserManagementData() {
  assertAdminUserManagement_();
  const userSheet = getRequiredSheet_(SHEETS.USERS);
  const values = userSheet.getDataRange().getValues();
  const headers = values.length ? values[0].map(String) : [];
  const users = values.slice(1).filter(function(row) {
    return row.some(function(value) { return String(value || '').trim() !== ''; });
  }).map(function(row) {
    const obj = rowToObject_(headers, row);
    const roles = getAssignedRoles_(String(obj.UserID || ''), obj.Role);
    return {userId:String(obj.UserID||''), email:String(obj.Email||''),
      fullName:String(obj.FullName||''), phone:String(obj.Phone||''),
      organisationId:String(obj.OrganisationID||''),
      role:String(obj.Role||'').toUpperCase(), roles:roles,
      status:String(obj.Status||'').toUpperCase()};
  });
  const organisations = getActiveOrganisations_().map(function(org) {
    return {organisationId:String(org.OrganisationID||''), code:String(org.Code||''),
      name:String(org.OrganisationName||'')};
  });
  return safeForClient_({ok:true, users:users, organisations:organisations,
    roles:['PREPARER','SUPERVISOR','SECRETARIAT','ADMIN']});
}

function saveAdminUser(payload) {
  assertAdminUserManagement_();
  payload = payload || {};
  const email = String(payload.email || '').trim().toLowerCase();
  const fullName = String(payload.fullName || '').trim();
  const phone = String(payload.phone || '').trim();
  const organisationId = String(payload.organisationId || '').trim();
  const status = String(payload.status || 'ACTIVE').trim().toUpperCase();
  const userId = String(payload.userId || '').trim();
  const allowedRoles = ['PREPARER','SUPERVISOR','SECRETARIAT','ADMIN'];
  let roles = Array.isArray(payload.roles) ? payload.roles : (payload.role ? [payload.role] : []);
  roles = roles.map(function(role){return String(role||'').trim().toUpperCase();})
    .filter(function(role,index,list){return allowedRoles.indexOf(role)>=0 && list.indexOf(role)===index;});

  if (!email || !/^[^\s@]+@cgso\.gov\.my$/i.test(email))
    throw new Error('E-mel pengguna mesti menggunakan domain @cgso.gov.my.');
  if (!fullName) throw new Error('Nama penuh wajib diisi.');
  if (!['ACTIVE','INACTIVE'].includes(status)) throw new Error('Status pengguna tidak sah.');
  if (roles.indexOf('PREPARER') >= 0 || roles.indexOf('SUPERVISOR') >= 0) {
    const org = findOrganisation_(organisationId);
    if (!org || String(org.IsActive).toUpperCase() !== 'TRUE')
      throw new Error('Pilih organisasi aktif yang sah untuk PREPARER atau SUPERVISOR.');
  } else if (organisationId && organisationId !== 'SYSTEM') {
    const org = findOrganisation_(organisationId);
    if (!org || String(org.IsActive).toUpperCase() !== 'TRUE')
      throw new Error('Organisasi yang dipilih tidak sah.');
  }

  const sheet = getRequiredSheet_(SHEETS.USERS);
  let lastCol = Math.max(1, sheet.getLastColumn());
  let headers = sheet.getRange(1,1,1,lastCol).getValues()[0].map(function(v){return String(v||'').trim();});
  if (headers.indexOf('Phone') < 0) {
    headers.push('Phone');
    sheet.getRange(1,headers.length).setValue('Phone');
    lastCol = headers.length;
  }
  const emailCol = headers.indexOf('Email'), idCol = headers.indexOf('UserID');
  if (emailCol < 0 || idCol < 0) throw new Error('Struktur USERS tidak lengkap.');
  const rows = sheet.getLastRow() > 1 ? sheet.getRange(2,1,sheet.getLastRow()-1,lastCol).getValues() : [];
  let targetRow = -1;
  rows.forEach(function(row,index) {
    if ((userId && String(row[idCol]||'').trim() === userId) ||
        (!userId && String(row[emailCol]||'').trim().toLowerCase() === email))
      targetRow = index + 2;
  });
  if (targetRow < 0) rows.forEach(function(row,index) {
    if (String(row[emailCol]||'').trim().toLowerCase() === email) targetRow = index + 2;
  });
  const now = new Date();
  const phoneCol = headers.indexOf('Phone') + 1;
  if (phoneCol > 0) sheet.getRange(1, phoneCol, Math.max(sheet.getMaxRows(), 1), 1).setNumberFormat('@');
  const output = targetRow > 0 ? sheet.getRange(targetRow,1,1,lastCol).getValues()[0] : new Array(lastCol).fill('');
  function put(field,value) { const col=headers.indexOf(field); if(col>=0) output[col]=value; }
  if (!String(output[idCol]||'').trim()) put('UserID','USR-'+Utilities.getUuid());
  const finalUserId = String(output[idCol] || '').trim();
  put('Email',email); put('FullName',fullName); put('Phone',phone);
  put('OrganisationID',organisationId || (roles.some(function(r){return r==='ADMIN'||r==='SECRETARIAT';}) ? 'SYSTEM' : ''));
  put('Role',roles[0] || ''); put('Status',status);
  const createdCol=headers.indexOf('CreatedAt');
  if(createdCol>=0 && !output[createdCol]) put('CreatedAt',now);
  put('UpdatedAt',now);
  if(targetRow>0) {
    if (phoneCol > 0) sheet.getRange(targetRow, phoneCol).setNumberFormat('@');
    sheet.getRange(targetRow,1,1,lastCol).setValues([output]);
  } else {
    if (phoneCol > 0) sheet.getRange(sheet.getLastRow()+1, phoneCol).setNumberFormat('@');
    sheet.appendRow(output);
  }

  const roleSheet = getUserRolesSheet_();
  const roleValues = roleSheet.getDataRange().getValues();
  const roleHeaders = roleValues[0].map(String);
  const userIndex = roleHeaders.indexOf('UserID');
  const activeIndex = roleHeaders.indexOf('IsActive');
  for (let i=1;i<roleValues.length;i++) {
    if (String(roleValues[i][userIndex] || '').trim() === finalUserId) {
      roleSheet.getRange(i+1,activeIndex+1).setValue(false);
    }
  }
  const assignedBy = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (roles.length) {
    const appendRows = roles.map(function(role){return [finalUserId,role,true,now,assignedBy];});
    roleSheet.getRange(roleSheet.getLastRow()+1,1,appendRows.length,5).setValues(appendRows);
  }
  return {ok:true,message:'Profil pengguna dan peranan berjaya disimpan.'};
}

/* getActiveUsersByOrganisation_() dan getActiveUsersByRole_() digantikan
   oleh getActiveUsersWithRoles_() yang menyokong USER_ROLES. */


/* ============================================================
   SUBMISSION EMAIL
   ============================================================ */

function sendSubmissionNotifications_(
  reportId
) {

  const report =
    getReportById_(
      reportId
    );


  const organisation =
    findOrganisation_(
      report.OrganisationID
    );


  const period =
    getPeriodById_(
      report.PeriodID
    );


  if (
    !organisation ||
    !period
  ) {
    return;
  }


  const recipients =
    new Map();


  getActiveUsersWithRoles_(
    ['PREPARER', 'SUPERVISOR'],
    report.OrganisationID
  )
  .forEach(
    function(user) {

      if (user.Email) {

        recipients.set(
          String(
            user.Email
          ).toLowerCase(),
          user.Email
        );
      }

    }
  );


  getActiveUsersWithRoles_([
    'ADMIN',
    'SECRETARIAT'
  ])
  .forEach(
    function(user) {

      if (user.Email) {

        recipients.set(
          String(
            user.Email
          ).toLowerCase(),
          user.Email
        );
      }

    }
  );


  const submitter =
    findUserById_(
      report.SubmittedBy
    );


  if (
    submitter &&
    submitter.Email
  ) {

    recipients.set(
      String(
        submitter.Email
      ).toLowerCase(),
      submitter.Email
    );
  }


  recipients.forEach(
    function(email) {

      try {

        MailApp.sendEmail({

          to: email,

          subject:
            '[CGSO] Laporan ' +
            period.Month +
            ' ' +
            period.Year +
            ' — ' +
            organisation.Code +
            ' — Dihantar',

          htmlBody:
            '<h2>Sistem Laporan Bulanan CGSO</h2>' +

            '<p>Laporan telah berjaya dihantar.</p>' +

            '<p><b>Organisasi:</b> ' +
            escapeHtml_(
              organisation.OrganisationName
            ) +
            '</p>' +

            '<p><b>Tempoh:</b> ' +
            escapeHtml_(
              period.Month
            ) +
            ' ' +
            period.Year +
            '</p>' +

            '<p><b>Status:</b> DIHANTAR</p>' +

            '<p><b>Masa hantar:</b> ' +
            escapeHtml_(
              formatDateTime_(report.SubmittedAt)
            ) +
            '</p>' +

            '<p><b>No. rujukan:</b> ' +
            escapeHtml_(report.ReportID) +
            '</p>' +

            '<p style="color:#666;font-size:12px">E-mel pengesahan ini dijana secara automatik.</p>'
        });


        logNotification_(
          reportId,
          'SUBMISSION',
          email,
          'SENT',
          ''
        );

      }

      catch (err) {

        logNotification_(
          reportId,
          'SUBMISSION',
          email,
          'FAILED',
          String(
            err.message || err
          )
        );
      }

    }
  );
}


/* ============================================================
   REMINDER
   ============================================================ */

/**
 * Hantar peringatan kepada PREPARER/SUPERVISOR organisasi yang
 * belum menghantar laporan bagi tempoh tersebut.
 *
 * @param period    objek tempoh (PeriodID, Month, Year, CloseDate)
 * @param daysLeft  bilangan hari sebelum tarikh tutup (0 = hari terakhir)
 */
function sendReminderEmails_(
  period,
  daysLeft
) {

  const pid = normalizePeriodId_(period.PeriodID);
  const reports = getReportsByPeriod_(pid);
  const closeText = formatDateTime_(period.CloseDate);
  const webAppUrl = ScriptApp.getService().getUrl() || '';

  const label =
    daysLeft === 0
      ? 'HARI TERAKHIR'
      : daysLeft + ' hari lagi';

  let sent = 0;

  getActiveOrganisations_().forEach(function(organisation) {

    const orgReports = reports.filter(function(r) {
      return String(r.OrganisationID) === String(organisation.OrganisationID);
    });

    const submitted = orgReports.some(function(r) {
      return r.SubmittedAt ||
        String(r.Status || '').trim().toUpperCase() === 'SUBMITTED';
    });

    if (submitted) return;

    const report = findBestReportRecord_(orgReports);

    getActiveUsersWithRoles_(
      ['PREPARER', 'SUPERVISOR'],
      organisation.OrganisationID
    ).forEach(function(user) {

      if (!user.Email) return;

      try {
        MailApp.sendEmail({
          to: user.Email,
          subject:
            '[PERINGATAN CGSO] ' + label + ' — Laporan ' +
            period.Month + ' ' + period.Year +
            ' belum dihantar (' + organisation.Code + ')',
          htmlBody:
            '<h2>Peringatan Laporan Bulanan CGSO</h2>' +
            '<p>Laporan bulan <b>' + escapeHtml_(period.Month) + ' ' + escapeHtml_(period.Year) +
            '</b> bagi <b>' + escapeHtml_(organisation.OrganisationName) +
            '</b> masih belum dihantar.</p>' +
            '<p><b>Tarikh tutup:</b> ' + escapeHtml_(closeText) + '</p>' +
            (daysLeft === 0
              ? '<p style="color:#b42318"><b>Hari ini ialah hari terakhir penghantaran.</b></p>'
              : '') +
            (webAppUrl
              ? '<p><a href="' + escapeHtml_(webAppUrl) + '">Buka Sistem Laporan Bulanan CGSO</a></p>'
              : '') +
            '<p style="color:#666;font-size:12px">E-mel ini dijana secara automatik.</p>'
        });

        logNotification_(report ? report.ReportID : '', 'REMINDER', user.Email, 'SENT', 'daysLeft=' + daysLeft);
        sent++;
      }

      catch (err) {
        logNotification_(report ? report.ReportID : '', 'REMINDER', user.Email, 'FAILED', String(err.message || err));
      }
    });
  });

  return sent;
}


/**
 * Selepas tarikh tutup: hantar senarai organisasi yang tidak
 * menghantar laporan kepada ADMIN/SECRETARIAT (dan SECRETARIAT_EMAIL).
 */
function sendLateSummaryEmail_(
  period
) {

  const pid = normalizePeriodId_(period.PeriodID);
  const reports = getReportsByPeriod_(pid);

  const late = getActiveOrganisations_().filter(function(organisation) {
    return !reports.some(function(r) {
      return String(r.OrganisationID) === String(organisation.OrganisationID) &&
        (r.SubmittedAt || String(r.Status || '').trim().toUpperCase() === 'SUBMITTED');
    });
  });

  const recipients = {};
  getActiveUsersWithRoles_(['ADMIN', 'SECRETARIAT']).forEach(function(u) {
    if (u.Email) recipients[String(u.Email).toLowerCase()] = u.Email;
  });

  const extra = String(getConfig_().SECRETARIAT_EMAIL || '').trim();
  if (extra) recipients[extra.toLowerCase()] = extra;

  const total = getActiveOrganisations_().length;

  const listHtml = late.length
    ? '<ol>' + late.map(function(o) {
        return '<li>' + escapeHtml_(o.Code) + ' — ' + escapeHtml_(o.OrganisationName) + '</li>';
      }).join('') + '</ol>'
    : '<p>Semua organisasi telah menghantar laporan.</p>';

  Object.keys(recipients).forEach(function(key) {
    const email = recipients[key];
    try {
      MailApp.sendEmail({
        to: email,
        subject:
          '[CGSO] Ringkasan penghantaran ' + period.Month + ' ' + period.Year +
          ' — ' + (total - late.length) + '/' + total + ' dihantar',
        htmlBody:
          '<h2>Ringkasan Penghantaran Laporan Bulanan</h2>' +
          '<p><b>Tempoh:</b> ' + escapeHtml_(period.Month) + ' ' + escapeHtml_(period.Year) + '</p>' +
          '<p><b>Dihantar:</b> ' + (total - late.length) + ' daripada ' + total + ' organisasi</p>' +
          '<h3>Belum / tidak menghantar (' + late.length + ')</h3>' +
          listHtml
      });
      logNotification_('', 'LATE_SUMMARY', email, 'SENT', pid);
    } catch (err) {
      logNotification_('', 'LATE_SUMMARY', email, 'FAILED', String(err.message || err));
    }
  });
}


/**
 * Berjalan setiap hari (trigger ~9 pagi).
 *
 * Jadual lalai (boleh diubah dalam CONFIG REMINDER_DAYS_BEFORE_CLOSE):
 *   6,2,0  → bagi tarikh tutup 7hb: peringatan pada 1hb, 5hb dan 7hb.
 * Sehari selepas tarikh tutup → ringkasan organisasi lewat kepada Urus Setia.
 *
 * Setiap jenis e-mel dihantar sekali sahaja sehari (PropertiesService),
 * walaupun trigger berjalan lebih daripada sekali.
 */
function dailyReminderScheduler_() {

  const tz = Session.getScriptTimeZone() || 'Asia/Kuala_Lumpur';
  const props = PropertiesService.getScriptProperties();
  const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

  const dayNumber = function(date) {
    // Bilangan hari kalendar (mengikut zon waktu skrip).
    const ymd = Utilities.formatDate(date, tz, 'yyyy-MM-dd').split('-').map(Number);
    return Math.round(Date.UTC(ymd[0], ymd[1] - 1, ymd[2]) / 86400000);
  };

  const todayNumber = dayNumber(new Date());

  const reminderDays = String(getConfig_().REMINDER_DAYS_BEFORE_CLOSE || '6,2,0')
    .split(',')
    .map(function(v) { return Number(String(v).trim()); })
    .filter(function(v) { return isFinite(v) && v >= 0; });

  /* 1) Peringatan bagi tempoh yang sedang dibuka */
  const period = getCurrentOpenPeriod_();

  if (period && period.CloseDate) {
    const daysLeft = dayNumber(period.CloseDate) - todayNumber;
    const key = 'REMINDER_' + normalizePeriodId_(period.PeriodID) + '_' + today;

    if (reminderDays.indexOf(daysLeft) >= 0 && !props.getProperty(key)) {
      props.setProperty(key, '1');
      sendReminderEmails_(period, daysLeft);
    }
  }

  /* 2) Ringkasan lewat: tempoh yang tarikh tutupnya semalam */
  const periodSheet = getDb_().getSheetByName(SHEETS.PERIODS);
  if (!periodSheet || periodSheet.getLastRow() < 2) return;

  const values = periodSheet.getDataRange().getValues();
  const headers = values.shift().map(String);

  values
    .map(function(row) { return rowToObject_(headers, row); })
    .forEach(function(p) {
      const close = parseDate_(p.CloseDate);
      if (!close) return;
      if (todayNumber - dayNumber(close) !== 1) return;

      const key = 'LATE_SUMMARY_' + normalizePeriodId_(p.PeriodID);
      if (props.getProperty(key)) return;

      props.setProperty(key, '1');
      sendLateSummaryEmail_(p);
    });
}


/**
 * Pengguna aktif yang mempunyai sekurang-kurangnya satu peranan dalam roles.
 * Peranan dibaca dari USER_ROLES (jatuh balik kepada USERS.Role).
 * Jika organisationId diberi, hanya pengguna organisasi itu.
 */
function getActiveUsersWithRoles_(
  roles,
  organisationId
) {

  const wanted = roles.map(function(r) { return String(r).toUpperCase(); });

  const sheet = getRequiredSheet_(SHEETS.USERS);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values.shift();

  // Bina peta UserID -> [roles] sekali sahaja.
  const roleMap = {};
  const roleSheet = getDb_().getSheetByName('USER_ROLES');
  if (roleSheet && roleSheet.getLastRow() >= 2) {
    const rv = roleSheet.getDataRange().getValues();
    const rh = rv.shift().map(String);
    const ui = rh.indexOf('UserID'), ri = rh.indexOf('Role'), ai = rh.indexOf('IsActive');
    rv.forEach(function(row) {
      const active = String(row[ai] || '').trim().toUpperCase();
      if (!(active === 'TRUE' || active === 'ACTIVE' || active === '1')) return;
      const id = String(row[ui] || '').trim();
      if (!roleMap[id]) roleMap[id] = [];
      roleMap[id].push(String(row[ri] || '').trim().toUpperCase());
    });
  }

  return values
    .map(function(row) { return rowToObject_(headers, row); })
    .filter(function(user) {
      if (String(user.Status || '').toUpperCase() !== 'ACTIVE') return false;
      if (organisationId !== undefined &&
          String(user.OrganisationID || '').trim() !== String(organisationId).trim()) {
        return false;
      }
      const userRoles = roleMap[String(user.UserID || '').trim()] ||
        [String(user.Role || '').trim().toUpperCase()];
      return userRoles.some(function(r) { return wanted.indexOf(r) >= 0; });
    });
}


/**
 * Baca tab CONFIG (SettingKey -> SettingValue), cache 5 minit.
 */
function getConfig_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('CGSO_CONFIG');
  if (hit) {
    try { return JSON.parse(hit); } catch (e) { /* abaikan */ }
  }

  const config = {};
  const sheet = getDb_().getSheetByName(SHEETS.CONFIG);
  if (sheet && sheet.getLastRow() >= 2) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues().forEach(function(row) {
      const key = String(row[0] || '').trim();
      if (key) config[key] = row[1];
    });
  }

  cache.put('CGSO_CONFIG', JSON.stringify(config), 300);
  return config;
}


/* ============================================================
   AUTOMATION
   ============================================================ */

function setupAutomation() {

  const user =
    getCurrentUser();


  assertAuthorized_(
    user
  );


  if (
    user.role !== 'ADMIN'
  ) {

    throw new Error(
      'Hanya pengguna dengan Role ADMIN boleh menjalankan setupAutomation.'
    );
  }


  ensureCurrentReportingCycle_();


  /*
   * Buang trigger lama yang sama.
   */
  ScriptApp
    .getProjectTriggers()
    .forEach(
      function(trigger) {

        const fn =
          trigger.getHandlerFunction();


        if (
          fn === 'systemScheduler_' ||
          fn === 'dailyReminderScheduler_'
        ) {

          ScriptApp.deleteTrigger(
            trigger
          );
        }

      }
    );


  /*
   * Semak setiap jam.
   */
  ScriptApp
    .newTrigger(
      'systemScheduler_'
    )
    .timeBased()
    .everyHours(1)
    .create();


  /*
   * Reminder sekitar 9 pagi.
   */
  ScriptApp
    .newTrigger(
      'dailyReminderScheduler_'
    )
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .create();


  writeAudit_(
    '',
    user.userId,
    'SETUP_AUTOMATION',
    'Automation dipasang.'
  );


  return {
    ok: true,
    message:
      'Automation berjaya dipasang.'
  };
}


function systemScheduler_() {

  ensureCurrentReportingCycle_();
}


/* dailyReminderScheduler_() kini ditakrif dalam bahagian REMINDER. */


/* ============================================================
   AUDIT
   ============================================================ */

function writeAudit_(
  reportId,
  userId,
  action,
  details
) {

  const sheet =
    getDb_()
      .getSheetByName(
        SHEETS.AUDIT
      );


  if (!sheet) {
    return;
  }


  sheet.appendRow([

    'L-' +
      Utilities.getUuid(),

    reportId || '',

    userId || '',

    action,

    new Date(),

    details || ''

  ]);
}


/* ============================================================
   NOTIFICATION LOG
   ============================================================ */

function logNotification_(
  reportId,
  type,
  recipient,
  status,
  errorMessage
) {

  const sheet =
    getDb_()
      .getSheetByName(
        SHEETS.NOTIFICATIONS
      );


  if (!sheet) {
    return;
  }


  sheet.appendRow([

    'N-' +
      Utilities.getUuid(),

    reportId || '',

    type,

    recipient,

    new Date(),

    status,

    errorMessage || ''

  ]);
}


/* ============================================================
   DATABASE HELPERS
   ============================================================ */

function getDb_() {

  const spreadsheet =
    SpreadsheetApp
      .getActiveSpreadsheet();


  if (!spreadsheet) {

    throw new Error(
      'Spreadsheet tidak dapat dikenal pasti.'
    );
  }


  return spreadsheet;
}


function getRequiredSheet_(
  name
) {

  const sheet =
    getDb_()
      .getSheetByName(
        name
      );


  if (!sheet) {

    throw new Error(
      'Sheet "' +
      name +
      '" tidak dijumpai.'
    );
  }


  return sheet;
}


function findRow_(
  sheetName,
  column,
  key,
  caseInsensitive
) {

  const sheet =
    getDb_()
      .getSheetByName(
        sheetName
      );


  if (!sheet) {
    return null;
  }


  const values =
    sheet
      .getDataRange()
      .getValues();


  if (
    values.length < 2
  ) {
    return null;
  }


  const headers =
    values.shift();


  const index =
    headers.indexOf(
      column
    );


  if (index < 0) {
    return null;
  }


  const wanted =
    String(
      key || ''
    )
    .trim();


  const row =
    values.find(
      function(row) {

        const value =
          String(
            row[index] || ''
          ).trim();


        if (
          caseInsensitive
        ) {

          return (
            value.toLowerCase() ===
            wanted.toLowerCase()
          );
        }


        return (
          value === wanted
        );
      }
    );


  return row
    ? rowToObject_(
        headers,
        row
      )
    : null;
}


/* ============================================================
   OBJECT / HEADER HELPERS
   ============================================================ */

/**
 * Pastikan kolum tertentu berformat teks biasa ('@') supaya
 * Google Sheets tidak menukar nilai seperti "2026-09" kepada tarikh.
 */
function ensureTextColumn_(
  sheet,
  headers,
  header
) {
  const index = headers.map(String).indexOf(header);
  if (index < 0) return;
  const maxRows = sheet.getMaxRows();
  if (maxRows < 2) return;
  const range = sheet.getRange(2, index + 1, maxRows - 1, 1);
  if (range.getNumberFormat() !== '@') {
    range.setNumberFormat('@');
  }
}


function rowToObject_(
  headers,
  row
) {

  const object = {};


  headers.forEach(
    function(header,index) {

      object[
        header
      ] =
        row[index];

    }
  );


  return object;
}


function setByHeader_(
  headers,
  row,
  header,
  value
) {

  const index =
    headers.indexOf(
      header
    );


  if (
    index >= 0
  ) {

    row[index] =
      value;
  }
}


function headerIndexes_(
  headers,
  names
) {

  const result = {};


  names.forEach(
    function(name) {

      const index =
        headers.indexOf(
          name
        );


      if (
        index < 0
      ) {

        throw new Error(
          'Header "' +
          name +
          '" tidak dijumpai.'
        );
      }


      result[name] =
        index;
    }
  );


  const createdIndex =
    headers.indexOf(
      'CreatedAt'
    );


  if (
    createdIndex >= 0
  ) {

    result.CreatedAt =
      createdIndex;
  }


  return result;
}


/* ============================================================
   DATE
   ============================================================ */

function parseDate_(
  value
) {

  if (
    value instanceof Date &&
    !isNaN(
      value.getTime()
    )
  ) {

    return value;
  }


  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {

    return null;
  }


  const date =
    new Date(
      value
    );


  return isNaN(
    date.getTime()
  )
    ? null
    : date;
}


/* ============================================================
   CLIENT SAFE SERIALISATION
   ============================================================ */

/**
 * google.script.run tidak sepatutnya menerima
 * objek Date mentah daripada backend.
 *
 * Fungsi ini menukar Date kepada string.
 */
function safeForClient_(
  value
) {

  if (
    value === null ||
    value === undefined
  ) {

    return value;
  }


  if (
    value instanceof Date
  ) {

    return formatDateTime_(
      value
    );
  }


  if (
    Array.isArray(value)
  ) {

    return value.map(
      function(item) {

        return safeForClient_(
          item
        );

      }
    );
  }


  if (
    typeof value ===
    'object'
  ) {

    const result = {};


    Object.keys(
      value
    ).forEach(
      function(key) {

        result[key] =
          safeForClient_(
            value[key]
          );

      }
    );


    return result;
  }


  return value;
}


/* ============================================================
   NUMBER
   ============================================================ */

function num_(
  value
) {

  if (
    value === '' ||
    value === null ||
    value === undefined
  ) {

    return '';
  }


  const number =
    Number(
      value
    );


  return isNaN(
    number
  )
    ? ''
    : number;
}


/* ============================================================
   FORMAT DATE
   ============================================================ */

function formatDateTime_(
  value
) {

  const date =
    parseDate_(
      value
    );


  if (!date) {
    return '-';
  }


  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone() ||
      'Asia/Kuala_Lumpur',
    'dd/MM/yyyy HH:mm:ss'
  );
}


/* ============================================================
   ESCAPE HTML
   ============================================================ */

function escapeHtml_(
  value
) {

  return String(
    value ?? ''
  )
  .replace(
    /[&<>"']/g,
    function(character) {

      return {

        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'

      }[character];

    }
  );
}


/* ============================================================
   DIAGNOSTIC
   ============================================================ */

/**
 * Jalankan fungsi ini secara manual
 * daripada Apps Script jika berlaku masalah.
 */
function diagnoseReportingSystem() {

  assertAdminOrOwner_();

  const user =
    getCurrentUser();


  let period =
    null;


  let periodError =
    '';


  try {

    period =
      createOrGetCurrentPeriod_();

  }

  catch (err) {

    periodError =
      String(
        err.stack || err
      );
  }


  let organisationCount =
    0;


  let reportCount =
    0;


  let reportStatuses =
    {};


  let organisationError =
    '';


  try {

    const organisations =
      getActiveOrganisations_();


    organisationCount =
      organisations.length;


    if (period) {

      const reports =
        organisations.map(
          function(org) {

            return getOrCreateReport_(
              period.PeriodID,
              org.OrganisationID
            );

          }
        );


      reportCount =
        reports.length;


      reports.forEach(
        function(report) {

          reportStatuses[
            report.Status
          ] =
            (
              reportStatuses[
                report.Status
              ] || 0
            ) + 1;

        }
      );
    }

  }

  catch (err) {

    organisationError =
      String(
        err.stack || err
      );
  }


  return safeForClient_({

    currentEmail:
      Session.getActiveUser()
        .getEmail(),

    user:
      user,

    spreadsheetName:
      getDb_().getName(),

    spreadsheetId:
      getDb_().getId(),

    timezone:
      Session.getScriptTimeZone(),

    period:
      period,

    periodError:
      periodError,

    activeOrganisationCount:
      organisationCount,

    reportCount:
      reportCount,

    reportStatuses:
      reportStatuses,

    organisationError:
      organisationError
  });
}
