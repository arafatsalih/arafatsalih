// Excel import (reads the existing StadiumInfo workbook) and export (writes the same layout, with live formulas).
(function (root) {
  const M = root.Model || (typeof require !== 'undefined' ? require('./model').Model : null);
  const getExcel = () => root.ExcelJS || (typeof require !== 'undefined' ? require('exceljs') : null);
  const { MONTHS, uid, val, isExpression, normName, daysInMonth } = M;

  // ---------- helpers ----------

  const colLetter = (n) => { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
  const ref = (sheet, addr) => `'${sheet.replace(/'/g, "''")}'!${addr}`;

  // Reads an ExcelJS cell into { num, text, formula }.
  function cv(cell) {
    let v = cell ? cell.value : null;
    const out = { num: null, text: '', formula: null };
    if (v === null || v === undefined) return out;
    if (v instanceof Date) { out.date = v; out.text = v.toISOString(); return out; }
    if (typeof v === 'object') {
      if (v.formula || v.sharedFormula) {
        out.formula = v.formula || (cell.formula ? cell.formula : null);
        v = v.result;
        if (v && typeof v === 'object' && v.error) v = null;
      } else if (v.richText) {
        v = v.richText.map((t) => t.text).join('');
      } else if (v.text !== undefined) {
        v = v.text;
      } else if (v.error) {
        v = null;
      }
    }
    if (typeof v === 'number') out.num = v;
    else if (v instanceof Date) out.date = v;
    else if (typeof v === 'string') {
      out.text = v.trim();
      if (/^-?\d+(\.\d+)?$/.test(out.text)) out.num = parseFloat(out.text);
    }
    return out;
  }

  // What to store for a data cell: keep simple arithmetic formulas ("=270+360") as an expression, otherwise the number.
  function dataValue(cell) {
    const c = cv(cell);
    if (c.formula && /^[\d.+\-*/()\s]+$/.test(c.formula)) return c.formula.replace(/\s+/g, '');
    if (c.num !== null && c.num !== 0) return c.num;
    if (c.formula === null && c.num === 0) return 0;
    return null;
  }

  const hasNumber = (row, from, to) => { for (let c = from; c <= to; c++) { const v = dataValue(row.getCell(c)); if (v !== null && val(v) !== 0) return true; } return false; };

  // ---------- import ----------

  function parseMonthSheet(ws, yearNum, m, kind) {
    const header = ws.getRow(1);
    let nDays = 0;
    for (let c = 2; c <= 40; c++) {
      const h = cv(header.getCell(c));
      if (h.date || (h.num !== null && h.num >= 1 && h.num <= 31)) nDays++;
      else break;
    }
    // Some sheets carry 29-31 day columns regardless of the month; the "Total" heading wins if present.
    let totalCol = nDays ? 2 + nDays : 2 + daysInMonth(yearNum, m);
    for (let c = 2; c <= 40; c++) if (normName(cv(header.getCell(c)).text) === 'total') { totalCol = c; break; }
    nDays = Math.min(totalCol - 2, daysInMonth(yearNum, m));
    const rows = [];
    let cash = {}, lastYear = { cash: null, sales: null };

    const readCells = (row) => {
      const cells = {};
      for (let d = 1; d <= nDays; d++) {
        const v = dataValue(row.getCell(1 + d));
        if (v !== null && val(v) !== 0) cells[d] = v;
      }
      return cells;
    };
    const lastYearValue = (row) => {
      for (let c = totalCol + 1; c <= totalCol + 4; c++) {
        const x = cv(row.getCell(c));
        if (!x.formula && x.num !== null && Math.abs(x.num) > 31) return x.num;
      }
      return null;
    };

    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const label = cv(row.getCell(1)).text;
      const n = normName(label);
      if (kind === 'daily' && n === 'dailycash') { cash = readCells(row); lastYear.cash = lastYearValue(row); continue; }
      if (n === 'totalsales') { lastYear.sales = lastYearValue(row); break; }
      if (n === 'totalexpenses' || n === 'total') break;
      const totalFormula = cv(row.getCell(totalCol)).formula;
      const numbers = hasNumber(row, 2, totalCol - 1);
      if (!label && !numbers) continue;
      if (label && !numbers && !totalFormula) continue; // section headings like "Maaslar"
      rows.push({ id: uid(), name: label || `Row ${r}`, cells: readCells(row) });
    }
    return { rows, cash, lastYear };
  }

  function parseCreditCard(ws, year) {
    for (let m = 0; m < 12; m++) {
      const c0 = 1 + m * 4;
      const card = { days: {}, compare: [] };
      let pastTotal = false;
      for (let r = 2; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const key = cv(row.getCell(c0));
        if (normName(key.text) === 'total') { pastTotal = true; continue; }
        if (!pastTotal && key.num !== null && key.num >= 1 && key.num <= 31) {
          const credit = dataValue(row.getCell(c0 + 1));
          const totalR = dataValue(row.getCell(c0 + 2));
          if ((credit !== null && val(credit)) || (totalR !== null && val(totalR))) card.days[key.num] = { credit, totalR };
        } else if (pastTotal && key.num !== null && key.num > 1900 && key.num < 2200) {
          const credit = cv(row.getCell(c0 + 1)).num, totalR = cv(row.getCell(c0 + 2)).num;
          card.compare.push({ label: String(key.num), credit, totalR });
        }
      }
      year.months[m].card = card;
    }
  }

  function parseBank(ws, year) {
    const title = cv(ws.getRow(1).getCell(1)).text;
    if (title && normName(title) !== 'date') year.bankName = title;
    let start = 2;
    for (let r = 1; r <= Math.min(ws.rowCount, 10); r++) if (normName(cv(ws.getRow(r).getCell(1)).text) === 'date') { start = r + 1; break; }
    for (let r = start; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const d = cv(row.getCell(1));
      const dep = dataValue(row.getCell(2)), wd = dataValue(row.getCell(3));
      const note = cv(row.getCell(4)).text;
      if (dep === null && wd === null) continue;
      const date = d.date ? d.date.toISOString().slice(0, 10) : d.text || '';
      year.bank.push({ id: uid(), date, deposit: dep, withdraw: wd, note });
    }
  }

  function parseTotal(ws, year) {
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const label = cv(row.getCell(1)).text;
      if (/transfer/i.test(label)) {
        year.openingBalance = cv(row.getCell(2)).num || 0;
        year.openingLabel = label;
      }
    }
  }

  function parseEmployees(ws, year) {
    let bankCol = null;
    const hdr = ws.getRow(2);
    for (let c = 2; c <= 30; c++) if (/banka|bank/i.test(cv(hdr.getCell(c)).text)) bankCol = c;
    for (let r = 3; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const name = cv(row.getCell(1)).text;
      if (!name || /^(toplam|total)/i.test(name)) continue;
      let bankPaid = 0;
      if (bankCol) {
        const b = cv(row.getCell(bankCol));
        bankPaid = b.num !== null ? b.num : b.formula ? val(b.formula) : 0;
        // Some rows hold a running sum in this column instead of a bank amount; keep only constants/arithmetic.
        if (b.formula && !/^[\d.+\-*/()\s]+$/.test(b.formula)) bankPaid = 0;
      }
      year.employees.push({ id: uid(), name, aliases: [], bankPaid });
    }
  }

  function parseProfit(ws, year, settings) {
    let gotCash = false, gotRx = false;
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const n = normName(cv(row.getCell(1)).text);
      if ((n === 'nakit' && !gotCash) || (n === 'recete' && !gotRx)) {
        for (let m = 0; m < 12; m++) {
          const v = dataValue(row.getCell(2 + m));
          year.revenue[m][n === 'nakit' ? 'cash' : 'rx'] = v === null ? null : v;
        }
        if (n === 'nakit') {
          gotCash = true;
          const f = cv(row.getCell(15)).formula || '';
          const pm = /\*\s*(\d+(\.\d+)?)%/.exec(f);
          if (pm) settings.cashMargin = parseFloat(pm[1]);
        } else {
          gotRx = true;
          const f = cv(row.getCell(15)).formula || '';
          const pm = /\*\s*(\d+(\.\d+)?)%/.exec(f);
          if (pm) settings.rxMargin = parseFloat(pm[1]);
        }
        const div = /\/\s*(\d+)/.exec(cv(row.getCell(17)).formula || '');
        if (div) settings.avgMonths = parseInt(div[1], 10);
      }
      for (let c = 1; c <= 20; c++) {
        if (/isl\s*ort/i.test(cv(row.getCell(c)).text)) {
          const x = cv(row.getCell(c + 1));
          if (x.num && !x.formula) settings.operatingCost = x.num;
        }
      }
    }
  }

  // Any other sheet becomes a simple list: description / group / amount.
  function parseList(ws) {
    const list = { id: uid(), name: ws.name, entries: [] };
    const hdr = ws.getRow(1);
    const headers = {};
    for (let c = 1; c <= Math.min(ws.columnCount, 30); c++) { const t = cv(hdr.getCell(c)).text; if (t) headers[c] = t; }
    const findCol = (re) => Number(Object.keys(headers).find((c) => re.test(headers[c])));
    const personCol = findCol(/^(kisi|person|name)$/i), amountCol = findCol(/^(tutar|amount)$/i);
    if (personCol && amountCol) {
      const descCol = findCol(/^(yil|year|description|aciklama)$/i);
      for (let r = 2; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const person = cv(row.getCell(personCol)).text;
        if (!person) continue;
        const d = descCol ? cv(row.getCell(descCol)) : null;
        list.entries.push({ id: uid(), date: '', description: d ? d.text || String(d.num ?? '') : '', group: person, amount: dataValue(row.getCell(amountCol)) });
      }
      return list;
    }
    // Generic: numbers under column headings; cells subtracted in a formula (e.g. "=SUM(B4)-B5") become negative.
    const negated = new Set();
    ws.eachRow((row) => row.eachCell((cell) => {
      const f = cv(cell).formula;
      if (f) for (const mm of f.matchAll(/-\s*\$?([A-Z]+)\$?(\d+)/g)) negated.add(mm[1] + mm[2]);
    }));
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const label = cv(row.getCell(1)).text;
      let added = false;
      for (const c of Object.keys(headers).map(Number)) {
        if (c === 1) continue;
        const cell = row.getCell(c);
        const x = cv(cell);
        if (x.formula && !/^[\d.+\-*/()\s]+$/.test(x.formula)) continue;
        const v = dataValue(cell);
        if (v === null) continue;
        const amount = negated.has(colLetter(c) + r) ? -val(v) : v;
        list.entries.push({ id: uid(), date: '', description: label, group: headers[c], amount });
        added = true;
      }
      if (label && !added) list.entries.push({ id: uid(), date: '', description: label, group: Object.values(headers).find((h, i) => Object.keys(headers)[i] !== '1') || '', amount: null });
    }
    return list;
  }

  async function importWorkbook(buffer, fileName) {
    const ExcelJS = getExcel();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ym = /(20\d\d)/.exec(fileName || '');
    const yearNum = ym ? Number(ym[1]) : new Date().getFullYear();
    const year = M.newYear();
    year.employees = [];
    year.lists = [];
    const settings = {};
    const byName = {};
    wb.eachSheet((ws) => { byName[normName(ws.name)] = ws; });
    const used = new Set();
    MONTHS.forEach((name, m) => {
      const d = byName[normName(name)], g = byName[normName(name + 'Exp')];
      if (d) {
        const p = parseMonthSheet(d, yearNum, m, 'daily');
        year.months[m].daily = { rows: p.rows, cash: p.cash, lastYear: p.lastYear };
        used.add(d.name);
      }
      if (g) {
        year.months[m].general = { rows: parseMonthSheet(g, yearNum, m, 'general').rows };
        used.add(g.name);
      }
    });
    const pick = (re) => wb.worksheets.find((ws) => re.test(normName(ws.name)));
    const cc = pick(/^creditcard|^kredikart/);
    if (cc) { parseCreditCard(cc, year); used.add(cc.name); }
    const bank = pick(/^bank/);
    if (bank) { parseBank(bank, year); used.add(bank.name); }
    const total = pick(/^total$|^toplam$/);
    if (total) { parseTotal(total, year); used.add(total.name); }
    const emp = pick(/^employees|^personel|^calisan/);
    if (emp) { parseEmployees(emp, year); used.add(emp.name); }
    const prof = pick(/aylik|nakit|profit/);
    if (prof) { parseProfit(prof, year, settings); used.add(prof.name); }
    for (const ws of wb.worksheets) {
      if (used.has(ws.name) || ws.state === 'veryHidden') continue;
      year.lists.push(parseList(ws));
    }
    return { yearNum, year, settings };
  }

  // ---------- export ----------

  const MONEY = '#,##0.00';
  const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F2' } };
  const TOTAL_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };

  function cellValue(raw) {
    if (raw === null || raw === undefined || raw === '') return null;
    if (isExpression(raw)) return { formula: String(raw).replace(/^=/, ''), result: val(raw) };
    return val(raw);
  }
  const styleHeader = (row) => row.eachCell((c) => { c.font = { bold: true }; c.fill = HEAD_FILL; });
  const styleTotal = (row) => row.eachCell((c) => { c.font = { bold: true }; c.fill = TOTAL_FILL; });

  function writeMonthSheet(wb, sheetName, title, yearNum, m, rows, cashCells, totalLabel, lastYear) {
    const ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] });
    const days = daysInMonth(yearNum, m);
    const tc = days + 2, T = colLetter(tc), last = colLetter(days + 1);
    const header = [title];
    for (let d = 1; d <= days; d++) header.push(new Date(Date.UTC(yearNum, m, d)));
    header.push('Total');
    const h = ws.addRow(header);
    for (let d = 1; d <= days; d++) h.getCell(d + 1).numFmt = 'dd.mm';
    styleHeader(h);
    const rowIndex = {};
    const firstData = 2;
    const all = cashCells ? [...rows, { name: 'Daily Cash', cells: cashCells, isCash: true }] : rows;
    for (const r of all) {
      const vals = [r.name];
      for (let d = 1; d <= days; d++) vals.push(cellValue(r.cells[d]));
      const row = ws.addRow(vals);
      row.getCell(tc).value = { formula: `SUM(B${row.number}:${last}${row.number})` };
      if (r.isCash) row.font = { bold: true };
      rowIndex[r.name] = rowIndex[r.name] || [];
      rowIndex[r.name].push(row.number);
      r._row = row.number;
    }
    const lastData = ws.rowCount;
    const tot = ws.addRow([totalLabel]);
    for (let c = 2; c <= tc; c++) {
      const L = colLetter(c);
      tot.getCell(c).value = lastData >= firstData ? { formula: `SUM(${L}${firstData}:${L}${lastData})` } : 0;
    }
    styleTotal(tot);
    // Comparison with last year: value, difference, % change.
    const cmp = (rowNum, v) => {
      if (v === null || v === undefined || v === '') return;
      const row = ws.getRow(rowNum);
      const A = colLetter(tc + 1), B = colLetter(tc + 2), C = colLetter(tc + 3);
      row.getCell(tc + 1).value = val(v);
      row.getCell(tc + 2).value = { formula: `${T}${rowNum}-${A}${rowNum}` };
      row.getCell(tc + 3).value = { formula: `IF(${A}${rowNum}=0,"",(${T}${rowNum}-${A}${rowNum})/${A}${rowNum})` };
      row.getCell(tc + 3).numFmt = '0.0%';
      [tc + 1, tc + 2].forEach((c) => (row.getCell(c).numFmt = MONEY));
      const hr = ws.getRow(rowNum - 1);
      if (!hr.getCell(tc + 1).value) { hr.getCell(tc + 1).value = 'Last year'; hr.getCell(tc + 2).value = 'Diff'; hr.getCell(tc + 3).value = '%'; }
    };
    if (lastYear) {
      const cashRow = all.find((r) => r.isCash);
      if (cashRow) cmp(cashRow._row, lastYear.cash);
      cmp(tot.number, lastYear.sales);
    }
    ws.getColumn(1).width = 26;
    for (let c = 2; c <= tc + 3; c++) { ws.getColumn(c).width = c === tc ? 14 : 10; ws.getColumn(c).numFmt = MONEY; }
    ws.getRow(1).eachCell((c, n) => { if (n > 1 && n <= days + 1) c.numFmt = 'dd.mm'; });
    return { ws, rowIndex, totalRow: tot.number, totalCol: T, cashRow: (all.find((r) => r.isCash) || {})._row, lastCol: last };
  }

  async function exportYear(data, yearNum) {
    const ExcelJS = getExcel();
    const year = data.years[yearNum];
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Stadium Cashbook';
    wb.created = new Date();

    // Summary sheets first, filled in after month sheets exist (formulas reference them).
    const totalWs = wb.addWorksheet('Total');
    const empWs = wb.addWorksheet('Employees');
    const bankWs = wb.addWorksheet('BankDeposit');
    const ccWs = wb.addWorksheet('CreditCard');

    // Bank
    bankWs.mergeCells('A1:C1');
    bankWs.getCell('A1').value = year.bankName || 'Bank';
    bankWs.getCell('A1').font = { bold: true, size: 13 };
    styleHeader(bankWs.addRow(['Date', 'Deposit', 'Withdraw', 'Note']));
    const bankRows = [...year.bank].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    for (const b of bankRows) {
      const d = b.date && !isNaN(new Date(b.date)) ? new Date(b.date + 'T00:00:00Z') : b.date || null;
      const row = bankWs.addRow([d, cellValue(b.deposit), cellValue(b.withdraw), b.note || '']);
      if (d instanceof Date) row.getCell(1).numFmt = 'dd.mm.yyyy';
    }
    const bankLast = Math.max(3, bankWs.rowCount);
    const bt = bankWs.addRow(['Total', { formula: `SUM(B3:B${bankLast})` }, { formula: `SUM(C3:C${bankLast})` }]);
    styleTotal(bt);
    const bankTotalRow = bt.number;
    bankWs.columns = [{ width: 14 }, { width: 14, style: { numFmt: MONEY } }, { width: 14, style: { numFmt: MONEY } }, { width: 30 }];

    // Credit card: one 4-column block per month, days down the rows.
    const hdr = [];
    MONTHS.forEach((n) => hdr.push(n, 'Credit', 'Total R', 'Diff'));
    styleHeader(ccWs.addRow(hdr));
    for (let d = 1; d <= 31; d++) {
      const vals = [];
      MONTHS.forEach((_, m) => {
        const day = year.months[m].card.days[d] || {};
        vals.push(d <= daysInMonth(yearNum, m) ? d : null, cellValue(day.credit), cellValue(day.totalR), null);
      });
      const row = ccWs.addRow(vals);
      MONTHS.forEach((_, m) => {
        const c0 = 1 + m * 4;
        row.getCell(c0 + 3).value = { formula: `${colLetter(c0 + 1)}${row.number}-${colLetter(c0 + 2)}${row.number}` };
      });
    }
    const ccTot = ccWs.addRow([]);
    MONTHS.forEach((_, m) => {
      const c0 = 1 + m * 4;
      ccTot.getCell(c0).value = 'Total';
      for (let k = 1; k <= 3; k++) { const L = colLetter(c0 + k); ccTot.getCell(c0 + k).value = { formula: `SUM(${L}2:${L}32)` }; }
    });
    styleTotal(ccTot);
    const maxCmp = Math.max(0, ...year.months.map((mo) => mo.card.compare.length));
    for (let i = 0; i < maxCmp; i++) {
      const row = ccWs.addRow([]);
      year.months.forEach((mo, m) => {
        const c = mo.card.compare[i];
        if (!c) return;
        const c0 = 1 + m * 4;
        row.getCell(c0).value = Number(c.label) || c.label;
        row.getCell(c0 + 1).value = c.credit == null ? null : val(c.credit);
        row.getCell(c0 + 2).value = c.totalR == null ? null : val(c.totalR);
      });
    }
    for (let c = 1; c <= 48; c++) { ccWs.getColumn(c).width = c % 4 === 1 ? 10 : 13; if (c % 4 !== 1) ccWs.getColumn(c).numFmt = MONEY; }
    ccWs.views = [{ state: 'frozen', ySplit: 1 }];

    // Month sheets
    const monthInfo = MONTHS.map((name, m) => {
      const mo = year.months[m];
      const daily = writeMonthSheet(wb, name, 'Daily Expenses', yearNum, m, mo.daily.rows, mo.daily.cash, 'Total Sales', mo.daily.lastYear);
      const general = writeMonthSheet(wb, `${name} Exp`, 'General Expenses', yearNum, m, mo.general.rows, null, 'Total Expenses', null);
      return { name, daily, general };
    });

    // Employees: salary = matching rows in the daily sheet + the general expenses sheet.
    empWs.mergeCells('B1:M1');
    empWs.getCell('A1').value = 'Employees';
    empWs.getCell('B1').value = 'Total Given Salary Per Month';
    empWs.getRow(1).font = { bold: true };
    styleHeader(empWs.addRow(['', ...MONTHS, 'Total', 'Paid via bank', 'All Total', 'Average Monthly']));
    for (const e of year.employees) {
      const row = empWs.addRow([e.name]);
      const r = row.number;
      monthInfo.forEach((mi, m) => {
        const parts = [];
        for (const sheet of [mi.daily, mi.general]) {
          for (const [nm, rowsIdx] of Object.entries(sheet.rowIndex)) {
            if (![e.name, ...(e.aliases || [])].some((a) => normName(a) === normName(nm)) || nm === 'Daily Cash') continue;
            for (const ri of rowsIdx) parts.push(ref(sheet.ws.name, `${sheet.totalCol}${ri}`));
          }
        }
        row.getCell(2 + m).value = parts.length ? { formula: parts.join('+') } : 0;
      });
      row.getCell(14).value = { formula: `SUM(B${r}:M${r})` };
      row.getCell(15).value = val(e.bankPaid);
      row.getCell(16).value = { formula: `N${r}+O${r}` };
      row.getCell(17).value = { formula: `IF(COUNTIF(B${r}:M${r},">0")=0,0,P${r}/COUNTIF(B${r}:M${r},">0"))` };
    }
    const empLast = empWs.rowCount;
    if (empLast >= 3) {
      const et = empWs.addRow(['Total']);
      for (let c = 2; c <= 16; c++) { const L = colLetter(c); et.getCell(c).value = { formula: `SUM(${L}3:${L}${empLast})` }; }
      styleTotal(et);
    }
    empWs.getColumn(1).width = 22;
    for (let c = 2; c <= 17; c++) { empWs.getColumn(c).width = 13; empWs.getColumn(c).numFmt = MONEY; }

    // Total (cash on hand) with a month-by-month breakdown.
    totalWs.getColumn(1).width = 30;
    for (let c = 2; c <= 8; c++) { totalWs.getColumn(c).width = 16; totalWs.getColumn(c).numFmt = MONEY; }
    totalWs.addRow(['Total Cash Amount']).font = { bold: true, size: 13 };
    totalWs.addRow([year.openingLabel || 'Opening balance', val(year.openingBalance)]);
    totalWs.addRow([]);
    styleHeader(totalWs.addRow(['Month', 'Daily Cash', 'General Expenses', 'Bank Deposits', 'Bank Withdrawals', 'Net Cash', 'Running Balance', 'Total Sales']));
    const firstM = totalWs.rowCount + 1;
    monthInfo.forEach((mi, m) => {
      const row = totalWs.addRow([mi.name]);
      const r = row.number;
      row.getCell(2).value = { formula: ref(mi.name, `${mi.daily.totalCol}${mi.daily.cashRow}`) };
      row.getCell(3).value = { formula: ref(mi.general.ws.name, `${mi.general.totalCol}${mi.general.totalRow}`) };
      const ms = new Date(Date.UTC(yearNum, m, 1)), me = new Date(Date.UTC(yearNum, m + 1, 1));
      const dt = (d) => `DATE(${d.getUTCFullYear()},${d.getUTCMonth() + 1},${d.getUTCDate()})`;
      row.getCell(4).value = { formula: `SUMIFS(BankDeposit!B:B,BankDeposit!A:A,">="&${dt(ms)},BankDeposit!A:A,"<"&${dt(me)})` };
      row.getCell(5).value = { formula: `SUMIFS(BankDeposit!C:C,BankDeposit!A:A,">="&${dt(ms)},BankDeposit!A:A,"<"&${dt(me)})` };
      row.getCell(6).value = { formula: `B${r}-C${r}-D${r}+E${r}` };
      row.getCell(7).value = { formula: m === 0 ? `B2+F${r}` : `G${r - 1}+F${r}` };
      row.getCell(8).value = { formula: ref(mi.name, `${mi.daily.totalCol}${mi.daily.totalRow}`) };
    });
    const lastM = totalWs.rowCount;
    const yt = totalWs.addRow(['Year']);
    for (const c of [2, 3, 4, 5, 6, 8]) { const L = colLetter(c); yt.getCell(c).value = { formula: `SUM(${L}${firstM}:${L}${lastM})` }; }
    styleTotal(yt);
    totalWs.addRow([]);
    const adjStart = totalWs.rowCount + 1;
    for (const a of year.adjustments) totalWs.addRow([a.label || 'Adjustment', val(a.amount)]);
    const adjEnd = totalWs.rowCount;
    const undatedRow = totalWs.addRow(['Bank rows outside this year']);
    undatedRow.getCell(2).value = {
      formula: `(BankDeposit!C${bankTotalRow}-BankDeposit!B${bankTotalRow})-(E${yt.number}-D${yt.number})`,
    };
    const cashTotal = totalWs.addRow(['Cash on hand']);
    cashTotal.getCell(2).value = { formula: `G${lastM}+B${undatedRow.number}` + (adjEnd >= adjStart ? `+SUM(B${adjStart}:B${adjEnd})` : '') };
    styleTotal(cashTotal);

    // Profitability (3AYLIK NAKIT)
    const st = data.settings;
    const pw = wb.addWorksheet('Profitability');
    styleHeader(pw.addRow(['', ...MONTHS, 'Total', 'Yearly profit', 'Monthly profit', 'Monthly revenue', 'Margin']));
    const pc = pw.addRow(['Cash (Nakit)', ...year.revenue.map((r) => cellValue(r.cash))]);
    const pr = pw.addRow(['Prescription (Recete)', ...year.revenue.map((r) => cellValue(r.rx))]);
    const pt = pw.addRow(['Total revenue']);
    for (let c = 2; c <= 13; c++) { const L = colLetter(c); pt.getCell(c).value = { formula: `${L}2+${L}3` }; }
    for (const r of [2, 3, 4]) pw.getCell(`N${r}`).value = { formula: `SUM(B${r}:M${r})` };
    pw.getCell('O2').value = { formula: `N2*${st.cashMargin}%` };
    pw.getCell('O3').value = { formula: `N3*${st.rxMargin}%` };
    pw.getCell('O4').value = { formula: 'O2+O3' };
    for (const r of [2, 3, 4]) { pw.getCell(`P${r}`).value = { formula: `O${r}/${st.avgMonths || 12}` }; pw.getCell(`Q${r}`).value = { formula: `N${r}/${st.avgMonths || 12}` }; }
    pw.getCell('R4').value = { formula: 'IF(Q4=0,"",P4/Q4)' };
    pw.getCell('R4').numFmt = '0.0%';
    pw.addRow(['Operating cost / month']).getCell(16).value = st.operatingCost;
    pw.getCell('O5').value = 'ISL ORT MAL';
    const net = pw.addRow(['Net monthly profit']);
    net.getCell(16).value = { formula: 'P4-P5' };
    styleTotal(net);
    const share = pw.addRow(['Cash share %']);
    for (let c = 2; c <= 13; c++) { const L = colLetter(c); share.getCell(c).value = { formula: `IF(${L}4=0,"",${L}2/${L}4)` }; share.getCell(c).numFmt = '0.0%'; }
    pw.getColumn(1).width = 24;
    for (let c = 2; c <= 17; c++) { pw.getColumn(c).width = 13; if (c !== 18) pw.getColumn(c).numFmt = MONEY; }
    void pc; void pr;

    // Lists (Alinan Ilaclar, cheques, zekat, …)
    const usedNames = new Set(wb.worksheets.map((w) => w.name.toLowerCase()));
    for (const l of year.lists) {
      let nm = (l.name || 'List').replace(/[\[\]:*?/\\]/g, ' ').slice(0, 31);
      while (usedNames.has(nm.toLowerCase())) nm = nm.slice(0, 28) + ' ' + Math.floor(Math.random() * 99);
      usedNames.add(nm.toLowerCase());
      const ws = wb.addWorksheet(nm);
      styleHeader(ws.addRow(['Date', 'Description', 'Group', 'Amount']));
      for (const e of l.entries) ws.addRow([e.date || '', e.description || '', e.group || '', cellValue(e.amount)]);
      const lastRow = Math.max(2, ws.rowCount);
      styleTotal(ws.addRow(['', 'Total', '', l.entries.length ? { formula: `SUM(D2:D${lastRow})` } : 0]));
      const groups = [...new Set(l.entries.map((e) => e.group || ''))].filter(Boolean);
      if (groups.length) {
        ws.getCell('F1').value = 'Group';
        ws.getCell('G1').value = 'Total';
        styleHeader(ws.getRow(1));
        groups.forEach((g, i) => {
          ws.getCell(`F${i + 2}`).value = g;
          ws.getCell(`G${i + 2}`).value = { formula: `SUMIF(C2:C${lastRow},F${i + 2},D2:D${lastRow})` };
        });
      }
      ws.columns = [{ width: 12 }, { width: 30 }, { width: 22 }, { width: 14, style: { numFmt: MONEY } }, { width: 3 }, { width: 22 }, { width: 14, style: { numFmt: MONEY } }];
    }

    return wb.xlsx.writeBuffer();
  }

  // One-sheet Excel version of the monthly report.
  async function exportMonthReport(data, yearNum, m) {
    const ExcelJS = getExcel();
    const s = M.monthSummary(data, yearNum, m);
    const cp = M.cashPosition(data, yearNum);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`${MONTHS[m]} ${yearNum}`);
    ws.columns = [{ width: 34 }, { width: 16, style: { numFmt: MONEY } }, { width: 16, style: { numFmt: MONEY } }, { width: 12 }];
    ws.addRow([`Monthly Report — ${MONTHS[m]} ${yearNum}`]).font = { bold: true, size: 14 };
    ws.addRow([]);
    styleHeader(ws.addRow(['Summary', `${MONTHS[m]} ${yearNum}`, `${MONTHS[m]} ${yearNum - 1}`, 'Change %']));
    const add = (label, a, b, c) => { const r = ws.addRow([label, a, b, c]); r.getCell(4).numFmt = '0.0%'; return r; };
    const p = s.prev;
    const cmp = (label, now, x) => {
      const r = add(label, now, x ? x.v : null);
      if (x && x.v) r.getCell(4).value = { formula: `IF(B${r.number}=0,"",(B${r.number}-C${r.number})/C${r.number})` };
      return r;
    };
    cmp('Total sales', s.sales, p.sales);
    cmp('Daily cash', s.cash, p.cash);
    cmp('Paid from till (daily expenses)', s.payouts, p.payouts);
    cmp('General expenses', s.general, p.general);
    cmp('Salaries', s.salaryTotal, p.salaryTotal);
    cmp('Credit card', s.credit, p.credit);
    cmp('Total R', s.totalR, p.totalR);
    add('Card difference', s.cardDiff);
    add('Bank deposits', s.deposits);
    add('Bank withdrawals', s.withdrawals);
    styleTotal(add('Net cash this month', s.netCash));
    styleTotal(add('Cash on hand at month end', cp.months[m].balance));
    const section = (title, rows) => {
      ws.addRow([]);
      styleHeader(ws.addRow([title, 'Amount', 'Share']));
      const total = rows.reduce((a, r) => a + r.amount, 0);
      for (const r of [...rows].sort((a, b) => b.amount - a.amount)) {
        const row = ws.addRow([r.name, r.amount, total ? r.amount / total : 0]);
        row.getCell(3).numFmt = '0.0%';
      }
      styleTotal(ws.addRow(['Total', total]));
    };
    if (p.stored) {
      for (const [sheet, title] of [['general', 'General expenses vs last year'], ['daily', 'Paid from till vs last year']]) {
        const rows = M.categoryComparison(data, yearNum, m, sheet);
        if (!rows.length) continue;
        ws.addRow([]);
        styleHeader(ws.addRow([title, `${yearNum}`, `${yearNum - 1}`, 'Change %']));
        for (const r of rows) {
          const row = ws.addRow([r.name, r.now, r.before]);
          if (r.before) row.getCell(4).value = { formula: `(B${row.number}-C${row.number})/C${row.number}` };
          row.getCell(4).numFmt = '0.0%';
        }
      }
    }
    section('General expenses by category', s.generalRows);
    section('Paid from till by category', s.payoutRows);
    section('Salaries', s.salaries.filter((x) => x.amount));
    ws.addRow([]);
    styleHeader(ws.addRow(['Day', 'Total sales', 'Daily cash']));
    s.dailySales.forEach((v, i) => ws.addRow([`${i + 1} ${MONTHS[m]}`, v, s.dailyCash[i]]));
    return wb.xlsx.writeBuffer();
  }

  root.ExcelIO = { importWorkbook, exportYear, exportMonthReport };
})(typeof module !== 'undefined' && module.exports ? module.exports : window);
