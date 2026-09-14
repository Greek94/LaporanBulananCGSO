/**
 * CGSO SISTEM LAPORAN BULANAN
 * DASHBOARD DIAGNOSTIC V2.3
 *
 * FAIL INI HANYA UNTUK DIAGNOSTIK.
 * JANGAN PADAM Code.gs SEDIA ADA.
 * JANGAN JALANKAN setupDatabase().
 *
 * Cara guna:
 * 1. Tambah fail ini sebagai fail .gs baharu dalam Apps Script.
 * 2. Save.
 * 3. Pilih fungsi diagnoseDashboardV23.
 * 4. Klik Run.
 * 5. Lihat Execution log.
 */

function diagnoseDashboardV23() {
  Logger.log('========================================');
  Logger.log('CGSO DASHBOARD DIAGNOSTIC V2.3');
  Logger.log('========================================');

  var results = [];

  function test(name, fn) {
    var start = new Date().getTime();
    try {
      var value = fn();
      var ms = new Date().getTime() - start;
      results.push({name: name, ok: true, ms: ms});
      Logger.log('OK   | ' + name + ' | ' + ms + ' ms');
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          Logger.log('     | Array length: ' + value.length);
        } else if (typeof value === 'object') {
          Logger.log('     | Object keys: ' + Object.keys(value).join(', '));
        } else {
          Logger.log('     | Value: ' + String(value));
        }
      }
      return value;
    } catch (err) {
      var msErr = new Date().getTime() - start;
      results.push({name: name, ok: false, ms: msErr, error: String(err.message || err)});
      Logger.log('FAIL | ' + name + ' | ' + msErr + ' ms');
      Logger.log('     | ERROR: ' + String(err.message || err));
      Logger.log('     | STACK: ' + String(err.stack || ''));
      return null;
    }
  }

  var user = test('1. getCurrentUser()', function() {
    return getCurrentUser();
  });

  if (!user || user.authorized !== true) {
    Logger.log('STOP | Pengguna tidak authorized.');
    Logger.log(JSON.stringify(results));
    return;
  }

  var period = test('2. getCurrentOpenPeriod_()', function() {
    return getCurrentOpenPeriod_();
  });

  var orgs = test('3. getActiveOrganisations_()', function() {
    return getActiveOrganisations_();
  });

  var reports = test('4. getAllReports_()', function() {
    return getAllReports_();
  });

  if (period) {
    test('5. normalizePeriodId_(current period)', function() {
      return normalizePeriodId_(period.PeriodID);
    });
  }

  if (reports && period) {
    test('6. Filter reports by current period', function() {
      var pid = normalizePeriodId_(period.PeriodID);
      return reports.filter(function(report) {
        return normalizePeriodId_(report.PeriodID) === pid;
      });
    });
  }

  if (period) {
    test('7. getPeriodSummary_(current period)', function() {
      return getPeriodSummary_(period.PeriodID);
    });
  }

  test('8. getWebAppUrl()', function() {
    return getWebAppUrl();
  });

  // Uji fungsi dashboard sebenar, tetapi jangan pulangkan objeknya kepada client.
  // Kita hanya log bentuk hasilnya untuk mengesan bahagian yang gagal.
  test('9. getDashboardData() internal', function() {
    var result = getDashboardData();
    if (result === null || result === undefined) {
      throw new Error('getDashboardData() memulangkan null/undefined');
    }
    Logger.log('     | dashboard ok=' + result.ok);
    Logger.log('     | authorized=' + result.authorized);
    Logger.log('     | rows=' + (Array.isArray(result.rows) ? result.rows.length : 'NOT_ARRAY'));
    if (result.error) Logger.log('     | error=' + result.error);
    if (result.detail) Logger.log('     | detail=' + result.detail);
    return {
      ok: result.ok,
      authorized: result.authorized,
      rows: Array.isArray(result.rows) ? result.rows.length : -1,
      hasSummary: !!result.summary,
      hasPeriod: !!result.period,
      hasUser: !!result.user
    };
  });

  // Uji serialization dengan objek kecil dan objek dashboard.
  test('10. safeForClient_ simple', function() {
    return safeForClient_({now: new Date(), sample: 'OK'});
  });

  test('11. safeForClient_ dashboard result', function() {
    var result = getDashboardData();
    var safe = safeForClient_(result);
    return {
      type: typeof safe,
      keys: safe && typeof safe === 'object' ? Object.keys(safe).join(', ') : ''
    };
  });

  Logger.log('========================================');
  Logger.log('RUMUSAN DIAGNOSTIC');
  Logger.log('========================================');
  results.forEach(function(r) {
    Logger.log((r.ok ? 'OK  ' : 'FAIL') + ' | ' + r.name + ' | ' + r.ms + ' ms' + (r.error ? ' | ' + r.error : ''));
  });
  Logger.log('========================================');
  Logger.log('JSON: ' + JSON.stringify(results));
  Logger.log('========================================');
}
