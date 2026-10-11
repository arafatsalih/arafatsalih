// Quick checks: expression parser, import of a workbook (optional path argument), export round-trip.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { Model } = require('../src/model');
const { ExcelIO } = require('../src/excel');

assert.strictEqual(Model.evalExpr('270+360'), 630);
assert.strictEqual(Model.evalExpr('=100*3-50'), 250);
assert.strictEqual(Model.evalExpr('1.250,50'), 1250.5);
assert.strictEqual(Model.evalExpr('1,250'), 1250);
assert.strictEqual(Model.evalExpr('12,5'), 12.5);
assert.strictEqual(Model.evalExpr('(10+5)/3'), 5);
assert.ok(isNaN(Model.evalExpr('abc')));
assert.strictEqual(Model.normName('AHMET ÇAYLAK'), Model.normName('Ahmet Caylak'));

(async () => {
  // Build a small year and check the cash position math.
  const data = Model.newData();
  data.currentYear = 2026;
  data.years = { 2026: Model.newYear() };
  const y = data.years[2026];
  y.openingBalance = 1000;
  y.employees.push({ id: 'e', name: 'Turan', aliases: [], bankPaid: 500 });
  const jan = y.months[0];
  jan.daily.rows.push({ id: 'r1', name: 'Turan', cells: { 1: 100, 2: '50+50' } });
  jan.daily.cash = { 1: 2000, 2: 3000 };
  jan.general.rows.push({ id: 'r2', name: 'TURAN', cells: { 5: 1000 } });
  y.bank.push({ id: 'b', date: '2026-01-10', deposit: 1500, withdraw: null });
  const s = Model.monthSummary(data, 2026, 0);
  assert.strictEqual(s.cash, 5000);
  assert.strictEqual(s.sales, 5200);
  assert.strictEqual(s.general, 1000);
  assert.strictEqual(s.netCash, 5000 - 1000 - 1500);
  assert.strictEqual(Model.cashPosition(data, 2026).total, 1000 + 2500);
  const emp = Model.employeeTable(data, 2026)[0];
  assert.strictEqual(emp.total, 1200);
  assert.strictEqual(emp.allTotal, 1700);

  const buf = await ExcelIO.exportYear(data, 2026);
  const back = await ExcelIO.importWorkbook(buf, '2026.xlsx');
  assert.strictEqual(Model.rowTotal(back.year.months[0].daily.rows.find((r) => r.name === 'Turan')), 200);
  assert.strictEqual(back.year.openingBalance, 1000);
  await ExcelIO.exportMonthReport(data, 2026, 0);

  const file = process.argv[2];
  if (file) {
    const res = await ExcelIO.importWorkbook(fs.readFileSync(file), path.basename(file));
    const d = Model.normalize({ currentYear: res.yearNum, settings: res.settings, years: { [res.yearNum]: res.year } });
    const yr = d.years[res.yearNum];
    console.log('year', res.yearNum, 'opening', yr.openingBalance, 'settings', d.settings);
    yr.months.forEach((mo, m) => console.log(Model.MONTHS[m], 'daily rows', mo.daily.rows.length, 'general rows', mo.general.rows.length,
      'lastYear', JSON.stringify(mo.daily.lastYear), 'card days', Object.keys(mo.card.days).length, 'compare', JSON.stringify(mo.card.compare)));
    console.log('employees', yr.employees.map((e) => `${e.name}:${e.bankPaid}`).join(', '));
    console.log('bank', yr.bank.length, 'lists', yr.lists.map((l) => `${l.name}(${l.entries.length}) ${JSON.stringify(l.entries.map((e) => [e.description, e.group, e.amount]))}`));
    console.log('cash on hand', Model.cashPosition(d, res.yearNum).total);
    const out = await ExcelIO.exportYear(d, res.yearNum);
    if (process.argv[3]) fs.writeFileSync(process.argv[3], Buffer.from(out));
  }
  console.log('All checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
