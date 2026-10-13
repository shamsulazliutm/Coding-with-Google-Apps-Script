/**
 * UTMPreneur: kerja berjadual. Jalankan pasangPencetus() sekali dari editor Apps Script untuk
 * memasang pencetus masa harian (pukul 7 pagi). Selamat dijalankan semula (pencetus lama diganti).
 */

var Jobs = {
  harian: function () {
    var out = {};
    try { out.ssu = Ssu.jobHarian(); } catch (e) { console.error('Kerja SSU gagal: ' + e); out.ssu = { ralat: String(e) }; }
    return out;
  }
};

function jobHarian() { return Jobs.harian(); }

function pasangPencetus() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'jobHarian') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('jobHarian').timeBased().everyDays(1).atHour(7).inTimezone(APP.TZ).create();
  Logger.log('Pencetus harian dipasang (jobHarian, 7 pagi).');
}
