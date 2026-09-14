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

    return HtmlService.createHtmlOutput(
      '<h2>Ralat Sistem</h2>' +
      '<pre>' +
      escapeHtml_(err.stack || err.message || err) +
      '</pre>'
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

      const allReports =
        getAllReports_() || [];

      const periodReports =
        allReports.filter(function(report) {
          return String(report.PeriodID || '').trim() === wantedPeriod;
        });

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

  /*
   * Tutup tempoh yang telah tamat.
   */
  closeExpiredReportsAsSystem_();


  /*
   * Pastikan bulan semasa wujud.
   */
  const period =
    createOrGetCurrentPeriod_();


  /*
   * Pastikan setiap organisasi aktif
   * mempunyai satu report.
   */
  const organisations =
    getActiveOrganisations_();


  organisations.forEach(
    function(org) {

      getOrCreateReport_(
        period.PeriodID,
        org.OrganisationID
      );

    }
  );


  return period;
}


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

        return String(
          row[idx.PeriodID]
        ).trim() === periodId;

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

      .sort(
        function(a,b) {

          return String(
            b.PeriodID
          ).localeCompare(
            String(a.PeriodID)
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
      periodId
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
      )
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


  items.forEach(
    function(item) {

      if (
        allowed.has(
          String(
            item.itemCode
          )
        )
      ) {

        upsertItemStatus_(
          reportId,
          item.itemCode,
          item.status,
          user.userId
        );
      }

    }
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


  return getReportForm(
    reportId
  );
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


  const validation =
    validateReportForm_(
      report,
      formData
    );


  if (!validation.ok) {

    return {

      ok: false,

      errors:
        validation.errors
    };
  }


  saveReportForm(
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


/* ============================================================
   ITEMS
   ============================================================ */

function getVisibleItemsForOrganisation_(
  organisationId
) {

  const itemSheet =
    getRequiredSheet_(
      SHEETS.ITEMS
    );


  const accessSheet =
    getRequiredSheet_(
      SHEETS.ACCESS
    );


  const itemValues =
    itemSheet
      .getDataRange()
      .getValues();


  if (
    itemValues.length < 2
  ) {
    return [];
  }


  const itemHeaders =
    itemValues.shift();


  const items = {};


  itemValues.forEach(
    function(row) {

      const item =
        rowToObject_(
          itemHeaders,
          row
        );

      items[
        String(
          item.ItemCode
        )
      ] = item;
    }
  );


  const accessValues =
    accessSheet
      .getDataRange()
      .getValues();


  if (
    accessValues.length < 2
  ) {
    return [];
  }


  const accessHeaders =
    accessValues.shift();


  return accessValues

    .map(
      function(row) {

        return rowToObject_(
          accessHeaders,
          row
        );

      }
    )

    .filter(
      function(access) {

        return String(
          access.OrganisationID
        ) === String(
          organisationId
        );

      }
    )

    .filter(
      function(access) {

        return String(
          access.Active
        ).toUpperCase() ===
        'TRUE';

      }
    )

    .sort(
      function(a,b) {

        return Number(
          a.DisplayOrder || 0
        ) -
        Number(
          b.DisplayOrder || 0
        );

      }
    )

    .map(
      function(access) {

        const item =
          items[
            String(
              access.ItemCode
            )
          ];


        if (!item) {
          return null;
        }


        return {

          ItemCode:
            item.ItemCode,

          Section:
            Number(
              item.Section || 0
            ),

          ItemName:
            item.ItemName,

          InputType:
            item.InputType,

          Fields:
            String(
              item.Fields || ''
            )
            .split(';')
            .map(
              function(s) {
                return s.trim();
              }
            )
            .filter(Boolean),

          Required:
            String(
              access.Required
            ).toUpperCase() ===
            'TRUE',

          DisplayOrder:
            Number(
              access.DisplayOrder || 0
            )
        };
      }
    )

    .filter(Boolean);
}


/* ============================================================
   ITEM STATUS
   ============================================================ */

function getItemStatuses_(
  reportId
) {

  const sheet =
    getDb_()
      .getSheetByName(
        SHEETS.STATUS
      );


  if (!sheet) {
    return {};
  }


  const values =
    sheet
      .getDataRange()
      .getValues();


  if (
    values.length < 2
  ) {
    return {};
  }


  const headers =
    values.shift();


  const result = {};


  values

    .map(
      function(row) {

        return rowToObject_(
          headers,
          row
        );

      }
    )

    .filter(
      function(item) {

        return String(
          item.ReportID
        ) === String(
          reportId
        );

      }
    )

    .forEach(
      function(item) {

        result[
          String(
            item.ItemCode
          )
        ] = {

          status:
            String(
              item.Status || ''
            ),

          updatedBy:
            item.UpdatedBy || '',

          updatedAt:
            item.UpdatedAt || ''
        };

      }
    );


  return result;
}


/* ============================================================
   UPSERT STATUS
   ============================================================ */

function upsertItemStatus_(
  reportId,
  itemCode,
  status,
  userId
) {

  const normal =
    String(
      status || ''
    ).toUpperCase();


  if (
    ![
      'ADA',
      'TIADA',
      ''
    ].includes(normal)
  ) {

    throw new Error(
      'Status item tidak sah.'
    );
  }


  const sheet =
    getRequiredSheet_(
      SHEETS.STATUS
    );


  const values =
    sheet
      .getDataRange()
      .getValues();


  const headers =
    values.shift();


  const reportIdx =
    headers.indexOf(
      'ReportID'
    );


  const itemIdx =
    headers.indexOf(
      'ItemCode'
    );


  const existingIndex =
    values.findIndex(
      function(row) {

        return (
          String(
            row[reportIdx]
          ) === String(
            reportId
          ) &&

          String(
            row[itemIdx]
          ) === String(
            itemCode
          )
        );

      }
    );


  const row =
    new Array(
      headers.length
    ).fill('');


  setByHeader_(
    headers,
    row,
    'RecordID',
    existingIndex >= 0
      ? values[
          existingIndex
        ][
          headers.indexOf(
            'RecordID'
          )
        ]
      : 'RS-' +
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
    itemCode
  );


  setByHeader_(
    headers,
    row,
    'Status',
    normal
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


  if (
    existingIndex >= 0
  ) {

    sheet
      .getRange(
        existingIndex + 2,
        1,
        1,
        row.length
      )
      .setValues([row]);

  }

  else {

    sheet.appendRow(row);
  }
}


/* ============================================================
   ACTIVITIES
   ============================================================ */

function getActivities_(
  reportId
) {

  const sheet =
    getDb_()
      .getSheetByName(
        SHEETS.ACTIVITIES
      );


  if (!sheet) {
    return [];
  }


  const values =
    sheet
      .getDataRange()
      .getDisplayValues();


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
      function(activity) {

        return String(
          activity.ReportID
        ) === String(
          reportId
        );

      }
    );
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


  for (
    let i = values.length - 1;
    i >= 0;
    i--
  ) {

    if (
      String(
        values[i][reportIdx]
      ) === String(
        reportId
      )
    ) {

      sheet.deleteRow(
        i + 2
      );
    }
  }


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
          activity.startDate || ''
        );


        setByHeader_(
          headers,
          row,
          'EndDate',
          activity.endDate || ''
        );


        setByHeader_(
          headers,
          row,
          'TimeStart',
          activity.timeStart || ''
        );


        setByHeader_(
          headers,
          row,
          'TimeEnd',
          activity.timeEnd || ''
        );


        setByHeader_(
          headers,
          row,
          'Title',
          activity.title || ''
        );


        setByHeader_(
          headers,
          row,
          'Agency',
          activity.agency || ''
        );


        setByHeader_(
          headers,
          row,
          'Location',
          activity.location || ''
        );


        setByHeader_(
          headers,
          row,
          'LocationType',
          activity.locationType || ''
        );


        setByHeader_(
          headers,
          row,
          'Officers',
          activity.officers || ''
        );


        setByHeader_(
          headers,
          row,
          'Speakers',
          activity.speakers || ''
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
          activity.notes || ''
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

  const periodSheet =
    getDb_()
      .getSheetByName(
        SHEETS.PERIODS
      );


  const reportSheet =
    getDb_()
      .getSheetByName(
        SHEETS.REPORTS
      );


  if (
    !periodSheet ||
    !reportSheet
  ) {
    return;
  }


  const periodValues =
    periodSheet
      .getDataRange()
      .getValues();


  if (
    periodValues.length < 2
  ) {
    return;
  }


  const headers =
    periodValues.shift();


  const closeIdx =
    headers.indexOf(
      'CloseDate'
    );


  const statusIdx =
    headers.indexOf(
      'Status'
    );


  const periodIdx =
    headers.indexOf(
      'PeriodID'
    );


  const now =
    new Date();


  const closedPeriods =
    [];


  periodValues.forEach(
    function(row,index) {

      const close =
        parseDate_(
          row[closeIdx]
        );


      if (
        close &&
        now > close &&
        String(
          row[statusIdx]
        ).toUpperCase() !==
        'CLOSED'
      ) {

        row[statusIdx] =
          'CLOSED';


        periodSheet
          .getRange(
            index + 2,
            1,
            1,
            row.length
          )
          .setValues([row]);


        closedPeriods.push(
          String(
            row[periodIdx]
          )
        );
      }
    }
  );


  if (
    !closedPeriods.length
  ) {
    return;
  }


  const reportValues =
    reportSheet
      .getDataRange()
      .getValues();


  if (
    reportValues.length < 2
  ) {
    return;
  }


  const reportHeaders =
    reportValues.shift();


  const reportPeriodIdx =
    reportHeaders.indexOf(
      'PeriodID'
    );


  const reportStatusIdx =
    reportHeaders.indexOf(
      'Status'
    );


  const closedSet =
    new Set(
      closedPeriods
    );


  reportValues.forEach(
    function(row,index) {

      if (
        closedSet.has(
          String(
            row[reportPeriodIdx]
          )
        )
      ) {

        row[reportStatusIdx] =
          'CLOSED';


        reportSheet
          .getRange(
            index + 2,
            1,
            1,
            row.length
          )
          .setValues([row]);
      }
    }
  );
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


  if (
    values.length < 2
  ) {
    return null;
  }


  const headers =
    values.shift();


  const idx =
    headers.indexOf(
      'PeriodID'
    );


  const row =
    values.find(
      function(row) {

        return String(
          row[idx]
        ) === String(
          periodId
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
   REPORT LOOKUP
   ============================================================ */

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

  return getAllReports_()
    .find(
      function(report) {

        return (

          String(
            report.PeriodID
          ) === String(
            periodId
          ) &&

          String(
            report.OrganisationID
          ) === String(
            organisationId
          )

        );

      }
    ) || null;
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
function getReadOnlyReport(reportId) {

  const user = getCurrentUser();

  assertAuthorized_(user);

  const role = String(user.role || '').trim().toUpperCase();

  if (role !== 'ADMIN' && role !== 'SECRETARIAT') {
    throw new Error(
      'Akses hanya untuk Urus Setia / Admin.'
    );
  }

  if (!reportId) {
    throw new Error('ReportID tidak diterima.');
  }

  const report = getReportById_(reportId);

  if (!report) {
    throw new Error('Laporan tidak dijumpai.');
  }

  assertReportAccess_(user, report);

  const period = getPeriodById_(report.PeriodID);

  if (!period) {
    throw new Error('Tempoh laporan tidak dijumpai.');
  }

  const organisation = findOrganisation_(
    report.OrganisationID
  ) || {};

  /*
   * Tambahkan maklumat organisasi ke objek report supaya
   * paparan modal sentiasa mempunyai Nama Organisasi + Kod.
   * Data asal REPORTS tidak diubah.
   */
  const reportForClient = Object.assign({}, report, {
    OrganisationName:
      organisation.OrganisationName ||
      organisation.Name ||
      '',
    OrganisationCode:
      organisation.Code ||
      organisation.OrganisationCode ||
      ''
  });

  const items =
    getVisibleItemsForOrganisation_(
      report.OrganisationID
    ) || [];

  const itemStatus =
    getItemStatuses_(
      reportId
    ) || {};

  const activities =
    getActivities_(
      reportId
    ) || [];

  /*
   * Modul khas BKP/BKPS dibaca secara READ-ONLY jika
   * organisasi tersebut mempunyai rekod.
   */
  const finance =
    getRecordsByReportIdFromSheet_(
      SHEETS.FINANCE,
      reportId
    );

  const bkpsSpecial =
    getRecordsByReportIdFromSheet_(
      SHEETS.BKPS,
      reportId
    );

  return safeForClient_({
    ok: true,
    user: user,
    report: reportForClient,
    period: period,
    items: items,
    itemStatus: itemStatus,
    activities: activities,
    finance: finance,
    bkpsSpecial: bkpsSpecial,
    editable: false,
    readOnly: true
  });
}


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

function getSecretariatDashboardV2() {

  const user = getCurrentUser();

  if (!user || user.authorized !== true) {
    return safeForClient_({
      ok: false,
      error: 'Pengguna tidak dibenarkan.'
    });
  }

  const role = String(user.role || '').trim().toUpperCase();

  if (role !== 'ADMIN' && role !== 'SECRETARIAT') {
    return safeForClient_({
      ok: false,
      error: 'Akses hanya untuk ADMIN atau SECRETARIAT.'
    });
  }

  const period = getCurrentOpenPeriod_();

  if (!period) {
    return safeForClient_({
      ok: true,
      user: user,
      period: null,
      summary: {
        total: 0,
        totalExpected: 0,
        totalOrganisations: 0,
        submitted: 0,
        draft: 0,
        closed: 0,
        notStarted: 0,
        completionRate: 0,
        completionPercent: 0
      },
      rows: []
    });
  }

  const organisations = getActiveOrganisations_() || [];
  const allReports = getAllReports_() || [];
  const wantedPeriod = normalizePeriodId_(period.PeriodID);

  /* Satu report terbaik sahaja bagi setiap organisasi. */
  const reportMap = {};

  allReports.forEach(function(report) {

    if (
      normalizePeriodId_(report.PeriodID) !== wantedPeriod
    ) {
      return;
    }

    const orgId = String(
      report.OrganisationID || ''
    ).trim();

    if (!orgId) {
      return;
    }

    if (!reportMap[orgId]) {
      reportMap[orgId] = report;
    } else {
      reportMap[orgId] = findBestReportRecord_([
        reportMap[orgId],
        report
      ]);
    }
  });

  let submitted = 0;
  let draft = 0;
  let closed = 0;

  const rows = organisations.map(function(org) {

    const orgId = String(
      org.OrganisationID || ''
    ).trim();

    const report = reportMap[orgId] || null;

    let status = 'NOT_STARTED';
    let completion = 0;
    let reportId = '';
    let submittedAt = '';
    let updatedAt = '';

    if (report) {

      status = String(
        report.Status || 'DRAFT'
      ).trim().toUpperCase();

      completion = Number(
        report.CompletionPercent || 0
      );

      reportId = String(
        report.ReportID || ''
      );

      submittedAt = report.SubmittedAt || '';
      updatedAt = report.UpdatedAt || '';

      if (status === 'SUBMITTED') submitted++;
      else if (status === 'CLOSED') closed++;
      else if (status === 'DRAFT') draft++;
    }

    return {
      organisationId: orgId,
      code: org.Code || '',
      name: org.OrganisationName || '',
      status: status,
      completion: Math.max(
        0,
        Math.min(100, completion)
      ),
      reportId: reportId,
      submittedAt: submittedAt,
      updatedAt: updatedAt
    };
  });

  const total = organisations.length;
  const notStarted = Math.max(
    0,
    total - submitted - draft - closed
  );

  const completionPercent = total
    ? Math.round(
        rows.reduce(function(sum, row) {
          return sum + Number(row.completion || 0);
        }, 0) / total
      )
    : 0;

  return safeForClient_({
    ok: true,
    user: user,
    period: period,
    summary: {
      total: total,
      totalExpected: total,
      totalOrganisations: total,
      submitted: submitted,
      draft: draft,
      closed: closed,
      notStarted: notStarted,
      completionRate: completionPercent,
      completionPercent: completionPercent
    },
    rows: rows
  });
}

/* ============================================================
   REPORT BY ID
   ============================================================ */

function getReportById_(
  reportId
) {

  const report =
    getAllReports_()
      .find(
        function(item) {

          return String(
            item.ReportID
          ) === String(
            reportId
          );

        }
      );


  if (!report) {

    throw new Error(
      'Laporan tidak dijumpai.'
    );
  }


  return report;
}


/* ============================================================
   UPDATE REPORT
   ============================================================ */

function updateReport_(
  reportId,
  patch
) {

  const sheet =
    getRequiredSheet_(
      SHEETS.REPORTS
    );


  const values =
    sheet
      .getDataRange()
      .getValues();


  const headers =
    values.shift();


  const idIdx =
    headers.indexOf(
      'ReportID'
    );


  const rowIndex =
    values.findIndex(
      function(row) {

        return String(
          row[idIdx]
        ) === String(
          reportId
        );

      }
    );


  if (
    rowIndex < 0
  ) {

    throw new Error(
      'Laporan tidak dijumpai.'
    );
  }


  const row =
    values[rowIndex];


  Object.keys(
    patch
  ).forEach(
    function(key) {

      const idx =
        headers.indexOf(
          key
        );


      if (idx >= 0) {

        row[idx] =
          patch[key];
      }
    }
  );


  sheet
    .getRange(
      rowIndex + 2,
      1,
      1,
      row.length
    )
    .setValues([row]);
}


/* ============================================================
   MODULES
   ============================================================ */

function getModulesForOrganisation_(
  organisationId
) {

  const sheet =
    getDb_()
      .getSheetByName(
        SHEETS.MODULES
      );


  if (!sheet) {
    return [];
  }


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
      function(module) {

        return String(
          module.OrganisationID
        ) === String(
          organisationId
        );

      }
    )

    .filter(
      function(module) {

        return String(
          module.Active
        ).toUpperCase() ===
        'TRUE';

      }
    );
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

  if (!periodId) {
    return null;
  }


  const reports =
    getAllReports_()
      .filter(
        function(report) {

          return String(
            report.PeriodID
          ) === String(
            periodId
          );

        }
      );


  const total =
    getActiveOrganisations_()
      .length;


  const submitted =
    reports.filter(
      function(report) {

        return String(
          report.Status
        ).toUpperCase() ===
        'SUBMITTED';

      }
    ).length;


  const draft =
    reports.filter(
      function(report) {

        return String(
          report.Status
        ).toUpperCase() ===
        'DRAFT';

      }
    ).length;


  const closed =
    reports.filter(
      function(report) {

        return String(
          report.Status
        ).toUpperCase() ===
        'CLOSED';

      }
    ).length;


  return {

    periodId:
      periodId,

    totalExpected:
      total,

    totalRecords:
      reports.length,

    submitted:
      submitted,

    draft:
      draft,

    closed:
      closed,

    notStarted:
      Math.max(
        0,
        total -
        submitted -
        draft -
        closed
      ),

    completionRate:
      total
        ? Math.round(
            submitted /
            total *
            10000
          ) / 100
        : 0
  };
}


/* ============================================================
   EMAIL
   ============================================================ */

function getActiveUsersByOrganisation_(
  organisationId
) {

  const sheet =
    getRequiredSheet_(
      SHEETS.USERS
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
      function(user) {

        return String(
          user.OrganisationID
        ) === String(
          organisationId
        );

      }
    )

    .filter(
      function(user) {

        return String(
          user.Status
        ).toUpperCase() ===
        'ACTIVE';

      }
    );
}


function getActiveUsersByRole_(
  roles
) {

  const wanted =
    new Set(
      roles.map(
        function(role) {

          return String(
            role
          ).toUpperCase();

        }
      )
    );


  const sheet =
    getRequiredSheet_(
      SHEETS.USERS
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
      function(user) {

        return wanted.has(
          String(
            user.Role
          ).toUpperCase()
        );

      }
    )

    .filter(
      function(user) {

        return String(
          user.Status
        ).toUpperCase() ===
        'ACTIVE';

      }
    );
}


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


  getActiveUsersByOrganisation_(
    report.OrganisationID
  )
  .filter(
    function(user) {

      return [
        'PREPARER',
        'SUPERVISOR'
      ].includes(
        String(
          user.Role
        ).toUpperCase()
      );

    }
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


  getActiveUsersByRole_([
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

            '<p><b>Status:</b> SUBMITTED</p>'
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

function sendReminderEmails_(
  period
) {

  const reports =
    getAllReports_()
      .filter(
        function(report) {

          return String(
            report.PeriodID
          ) === String(
            period.PeriodID
          );

        }
      );


  getActiveOrganisations_()
    .forEach(
      function(organisation) {

        const report =
          reports.find(
            function(item) {

              return String(
                item.OrganisationID
              ) === String(
                organisation.OrganisationID
              );

            }
          );


        if (
          !report ||
          [
            'SUBMITTED',
            'CLOSED'
          ].includes(
            String(
              report.Status
            ).toUpperCase()
          )
        ) {

          return;
        }


        getActiveUsersByOrganisation_(
          organisation.OrganisationID
        )
        .filter(
          function(user) {

            return [
              'PREPARER',
              'SUPERVISOR'
            ].includes(
              String(
                user.Role
              ).toUpperCase()
            );

          }
        )
        .forEach(
          function(user) {

            try {

              MailApp.sendEmail({

                to:
                  user.Email,

                subject:
                  '[PERINGATAN CGSO] Laporan ' +
                  period.Month +
                  ' ' +
                  period.Year +
                  ' belum dihantar — ' +
                  organisation.Code,

                htmlBody:
                  '<h2>PERINGATAN LAPORAN BULANAN CGSO</h2>' +

                  '<p>Laporan bagi <b>' +
                  escapeHtml_(
                    organisation.OrganisationName
                  ) +
                  '</b> masih belum dihantar.</p>' +

                  '<p><b>Tarikh tutup:</b> ' +
                  escapeHtml_(
                    formatDateTime_(
                      period.CloseDate
                    )
                  ) +
                  '</p>'
              });


              logNotification_(
                report.ReportID,
                'REMINDER',
                user.Email,
                'SENT',
                ''
              );

            }

            catch (err) {

              logNotification_(
                report.ReportID,
                'REMINDER',
                user.Email,
                'FAILED',
                String(
                  err.message || err
                )
              );
            }

          }
        );
      }
    );
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


function dailyReminderScheduler_() {

  const period =
    getCurrentOpenPeriod_();


  if (period) {

    sendReminderEmails_(
      period
    );
  }
}


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
