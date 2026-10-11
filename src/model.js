// Data model and all calculations (the "formulas" of the original workbook).
// Works in the browser (window.Model) and in Node (for tests).
(function (root) {
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const DEFAULT_DAILY = ['Iade Ilac', 'Kirtasiye Masrafi', 'Eczane Ici Masraf', 'Yemek', 'Su', 'Cay', 'Kargo'];
  const DEFAULT_GENERAL = ['Muhasebe', 'Eczaci Odasi', 'Eczane Masraf', 'Yemek'];

  let idCounter = 0;
  const uid = () => Date.now().toString(36) + (idCounter++).toString(36) + Math.random().toString(36).slice(2, 6);

  // ---------- numbers & expressions ----------

  // Evaluates what the user typed in a cell: "1250", "270+360", "1.250,50", "=100*3".
  function evalExpr(raw) {
    if (raw === null || raw === undefined || raw === '') return 0;
    if (typeof raw === 'number') return isFinite(raw) ? raw : 0;
    let s = String(raw).trim().replace(/^=/, '').replace(/\s+/g, '');
    if (!s) return 0;
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); // 1.250,50
    s = s.replace(/,(?=\d{3}(\D|$))/g, '').replace(/,/g, '.');
    if (!/^[\d.+\-*/()]+$/.test(s)) return NaN;
    let i = 0;
    const peek = () => s[i];
    function num() {
      const m = /^\d*\.?\d+|^\d+\.?/.exec(s.slice(i));
      if (!m) throw new Error('bad');
      i += m[0].length;
      return parseFloat(m[0]);
    }
    function factor() {
      if (peek() === '-') { i++; return -factor(); }
      if (peek() === '+') { i++; return factor(); }
      if (peek() === '(') { i++; const v = expr(); if (peek() !== ')') throw new Error('bad'); i++; return v; }
      return num();
    }
    function term() {
      let v = factor();
      while (peek() === '*' || peek() === '/') { const op = s[i++]; const r = factor(); v = op === '*' ? v * r : v / r; }
      return v;
    }
    function expr() {
      let v = term();
      while (peek() === '+' || peek() === '-') { const op = s[i++]; const r = term(); v = op === '+' ? v + r : v - r; }
      return v;
    }
    try {
      const v = expr();
      return i === s.length && isFinite(v) ? v : NaN;
    } catch {
      return NaN;
    }
  }
  const val = (raw) => { const v = evalExpr(raw); return isNaN(v) ? 0 : v; };
  const isExpression = (raw) => typeof raw === 'string' && /[+\-*/()]/.test(raw.replace(/^-/, ''));
  const round2 = (n) => Math.round(n * 100) / 100;

  // Name matching tolerant to case, spaces and Turkish letters ("AHMET CAYLAK" == "Ahmet Çaylak").
  function normName(s) {
    return String(s || '')
      .toLocaleLowerCase('tr')
      .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/i̇/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
      .replace(/[^a-z0-9]/g, '');
  }

  // ---------- structure ----------

  const daysInMonth = (year, m) => new Date(year, m + 1, 0).getDate();

  const newRow = (name) => ({ id: uid(), name, cells: {} });

  function newMonth(prev) {
    const dailyNames = prev ? prev.daily.rows.map((r) => r.name) : DEFAULT_DAILY;
    const generalNames = prev ? prev.general.rows.map((r) => r.name) : DEFAULT_GENERAL;
    return {
      daily: { rows: dailyNames.map(newRow), cash: {}, lastYear: { cash: null, sales: null } },
      general: { rows: generalNames.map(newRow) },
      card: { days: {}, compare: [] },
      notes: '',
    };
  }

  function newYear(prevYear) {
    const months = [];
    for (let m = 0; m < 12; m++) {
      const template = m === 0 ? (prevYear ? prevYear.months[11] : null) : months[m - 1];
      months.push(newMonth(template));
    }
    return {
      openingBalance: 0,
      openingLabel: 'Transfer from previous year',
      months,
      bank: [],
      bankName: 'Kuveyt Turk',
      employees: prevYear ? prevYear.employees.map((e) => ({ ...e, id: uid(), bankPaid: 0 })) : [],
      adjustments: [],
      revenue: MONTHS.map(() => ({ cash: null, rx: null })),
      lists: prevYear ? prevYear.lists.map((l) => ({ id: uid(), name: l.name, entries: [] })) : [],
    };
  }

  function newData() {
    const year = new Date().getFullYear();
    return {
      version: 1,
      currentYear: year,
      settings: { cashMargin: 40, rxMargin: 25, avgMonths: 11, operatingCost: 90000, projection: 1.4 },
      years: { [year]: newYear() },
    };
  }

  // Fills in anything missing (older files, imported data) so the UI can rely on the shape.
  function normalize(data) {
    if (!data || typeof data !== 'object') return newData();
    data.settings = Object.assign({ cashMargin: 40, rxMargin: 25, avgMonths: 11, operatingCost: 90000, projection: 1.4 }, data.settings || {});
    data.years = data.years || {};
    if (!Object.keys(data.years).length) data.years[new Date().getFullYear()] = newYear();
    if (!data.years[data.currentYear]) data.currentYear = Number(Object.keys(data.years).sort().pop());
    for (const y of Object.values(data.years)) {
      const base = newYear();
      for (const k of Object.keys(base)) if (y[k] === undefined) y[k] = base[k];
      for (let m = 0; m < 12; m++) {
        const mo = (y.months[m] = y.months[m] || newMonth(y.months[m - 1]));
        mo.daily = mo.daily || { rows: [], cash: {} };
        mo.daily.cash = mo.daily.cash || {};
        mo.daily.lastYear = mo.daily.lastYear || { cash: null, sales: null };
        mo.general = mo.general || { rows: [] };
        mo.card = mo.card || { days: {}, compare: [] };
        mo.card.compare = mo.card.compare || [];
        for (const r of [...mo.daily.rows, ...mo.general.rows]) { r.id = r.id || uid(); r.cells = r.cells || {}; }
        y.revenue[m] = y.revenue[m] || { cash: null, rx: null };
      }
      for (const e of y.employees) { e.id = e.id || uid(); e.aliases = e.aliases || []; e.bankPaid = e.bankPaid || 0; }
      for (const l of y.lists) { l.id = l.id || uid(); l.entries = l.entries || []; }
    }
    return data;
  }

  // ---------- calculations ----------

  const rowTotal = (row) => Object.values(row.cells).reduce((s, v) => s + val(v), 0);
  const mapTotal = (cells) => Object.values(cells || {}).reduce((s, v) => s + val(v), 0);
  const dayTotal = (rows, d) => rows.reduce((s, r) => s + val(r.cells[d]), 0);

  function pctChange(now, before) {
    if (!before) return null;
    return ((now - before) / before) * 100;
  }

  function bankForMonth(year, yearNum, m) {
    let deposits = 0, withdrawals = 0;
    const items = [];
    for (const b of year.bank) {
      const d = b.date ? new Date(b.date) : null;
      if (!d || isNaN(d) || d.getFullYear() !== Number(yearNum) || d.getMonth() !== m) continue;
      deposits += val(b.deposit);
      withdrawals += val(b.withdraw);
      items.push(b);
    }
    return { deposits, withdrawals, items };
  }

  function employeeMatches(emp, name) {
    const n = normName(name);
    if (!n) return false;
    return [emp.name, ...(emp.aliases || [])].some((a) => normName(a) === n);
  }

  function employeeSalary(year, emp, m) {
    const mo = year.months[m];
    let s = 0;
    for (const r of [...mo.daily.rows, ...mo.general.rows]) if (employeeMatches(emp, r.name)) s += rowTotal(r);
    return s;
  }

  // Plain totals of one month, no comparisons.
  function monthTotals(data, yearNum, m) {
    const year = data.years[yearNum];
    const mo = year && year.months[m];
    if (!mo) return null;
    const payouts = mo.daily.rows.reduce((s, r) => s + rowTotal(r), 0);
    const cash = mapTotal(mo.daily.cash);
    const general = mo.general.rows.reduce((s, r) => s + rowTotal(r), 0);
    let credit = 0, totalR = 0;
    for (const v of Object.values(mo.card.days)) { credit += val(v.credit); totalR += val(v.totalR); }
    const salaryTotal = year.employees.reduce((s, e) => s + employeeSalary(year, e, m), 0);
    return {
      payouts, cash, sales: payouts + cash, general, credit, totalR, salaryTotal,
      hasData: payouts !== 0 || cash !== 0 || general !== 0 || credit !== 0 || totalR !== 0,
    };
  }

  // The same month one year earlier. Real data in the app is used when that year/month has entries;
  // the "last year" figures typed on the month (or imported from the workbook) take priority for cash and sales.
  function previousYearMonth(data, yearNum, m) {
    const prevNum = Number(yearNum) - 1;
    const stored = monthTotals(data, prevNum, m);
    const prev = stored && stored.hasData ? stored : null;
    const mo = data.years[yearNum].months[m];
    const ly = mo.daily.lastYear || {};
    const typed = (v) => (v == null || v === '' ? null : val(v));
    const typedCash = typed(ly.cash), typedSales = typed(ly.sales);
    const card = (mo.card.compare || []).find((c) => String(c.label).trim() === String(prevNum));
    const pick = (typedV, key) => (typedV != null ? { v: typedV, src: 'typed' } : prev ? { v: prev[key], src: 'data' } : { v: null, src: null });
    const cash = pick(typedCash, 'cash');
    const sales = pick(typedSales, 'sales');
    const credit = prev && prev.credit ? { v: prev.credit, src: 'data' } : card && card.credit != null && card.credit !== '' ? { v: val(card.credit), src: 'typed' } : { v: null, src: null };
    const totalR = prev && prev.totalR ? { v: prev.totalR, src: 'data' } : card && card.totalR != null && card.totalR !== '' ? { v: val(card.totalR), src: 'typed' } : { v: null, src: null };
    const fromData = (key) => (prev ? { v: prev[key], src: 'data' } : { v: null, src: null });
    return {
      year: prevNum, stored: !!prev,
      cash, sales, credit, totalR,
      payouts: fromData('payouts'), general: fromData('general'), salaryTotal: fromData('salaryTotal'),
    };
  }

  // Category-by-category comparison with the same month last year (only when last year is in the app).
  function categoryComparison(data, yearNum, m, sheet) {
    const prevYear = data.years[Number(yearNum) - 1];
    const cur = data.years[yearNum].months[m][sheet].rows;
    const prev = prevYear ? prevYear.months[m][sheet].rows : [];
    const map = new Map();
    const add = (rows, key) => {
      for (const r of rows) {
        const n = normName(r.name) || r.id;
        const e = map.get(n) || { name: r.name, now: 0, before: 0 };
        e[key] += rowTotal(r);
        map.set(n, e);
      }
    };
    add(prev, 'before');
    add(cur, 'now');
    return [...map.values()].filter((e) => e.now || e.before)
      .map((e) => ({ ...e, change: e.now - e.before, pct: pctChange(e.now, e.before) }))
      .sort((a, b) => Math.max(b.now, b.before) - Math.max(a.now, a.before));
  }

  function monthSummary(data, yearNum, m) {
    const year = data.years[yearNum];
    const mo = year.months[m];
    const days = daysInMonth(yearNum, m);
    const t = monthTotals(data, yearNum, m);
    const { payouts, cash, sales, general, credit, totalR } = t;
    const bank = bankForMonth(year, yearNum, m);
    const salaries = year.employees.map((e) => ({ name: e.name, amount: employeeSalary(year, e, m) }));
    const dailySales = [];
    const dailyCash = [];
    for (let d = 1; d <= days; d++) {
      dailyCash.push(val(mo.daily.cash[d]));
      dailySales.push(dayTotal(mo.daily.rows, d) + val(mo.daily.cash[d]));
    }
    const prev = previousYearMonth(data, yearNum, m);
    const lyCash = prev.cash.v, lySales = prev.sales.v;
    const rev = year.revenue[m] || {};
    return {
      month: m, name: MONTHS[m], days,
      payouts, cash, sales, general,
      credit, totalR, cardDiff: credit - totalR,
      deposits: bank.deposits, withdrawals: bank.withdrawals, bankItems: bank.items,
      netCash: cash - general - bank.deposits + bank.withdrawals,
      prev, lyCash, lySales, lyCashSource: prev.cash.src, lySalesSource: prev.sales.src,
      // No comparison until something has been entered for the month.
      cashChange: lyCash == null || !cash ? null : cash - lyCash,
      cashChangePct: cash ? pctChange(cash, lyCash) : null,
      salesChange: lySales == null || !sales ? null : sales - lySales,
      salesChangePct: sales ? pctChange(sales, lySales) : null,
      salaries, salaryTotal: t.salaryTotal,
      dailySales, dailyCash,
      daysWithSales: dailySales.filter((v) => v).length,
      payoutRows: mo.daily.rows.map((r) => ({ name: r.name, amount: rowTotal(r) })).filter((r) => r.amount),
      generalRows: mo.general.rows.map((r) => ({ name: r.name, amount: rowTotal(r) })).filter((r) => r.amount),
      revenueCash: val(rev.cash), revenueRx: val(rev.rx),
      hasData: t.hasData,
    };
  }

  const COMPARE_METRICS = {
    sales: 'Total sales', cash: 'Daily cash', general: 'General expenses', payouts: 'Paid from till', credit: 'Credit card',
  };

  // Every year in the app side by side for one metric. For cash/sales, a year that isn't in the app
  // but whose figures were typed as "last year" on the following year is shown too (marked typed).
  function yearComparison(data, metric) {
    const stored = Object.keys(data.years).map(Number).sort((a, b) => a - b);
    const cols = new Map();
    for (const y of stored) {
      const values = MONTHS.map((_, m) => { const t = monthTotals(data, y, m); return t && t.hasData ? t[metric] : null; });
      if (values.some((v) => v != null)) cols.set(y, { year: y, typed: false, values });
    }
    for (const y of stored) {
      const prevNum = y - 1;
      if (cols.has(prevNum)) continue;
      const values = MONTHS.map((_, m) => {
        const mo = data.years[y].months[m];
        if (metric === 'cash' || metric === 'sales') { const v = mo.daily.lastYear?.[metric]; return v == null || v === '' ? null : val(v); }
        if (metric === 'credit') { const c = (mo.card.compare || []).find((x) => String(x.label).trim() === String(prevNum)); return c && c.credit != null && c.credit !== '' ? val(c.credit) : null; }
        return null;
      });
      if (values.some((v) => v != null)) cols.set(prevNum, { year: prevNum, typed: true, values });
    }
    const years = [...cols.values()].sort((a, b) => a.year - b.year);
    for (const c of years) {
      const filled = c.values.filter((v) => v != null);
      c.total = filled.reduce((a, b) => a + b, 0);
      c.months = filled.length;
      c.average = filled.length ? c.total / filled.length : null;
    }
    // Year-to-date: only months present in both of the last two years, so a half-finished year compares fairly.
    let ytd = null;
    if (years.length >= 2) {
      const a = years[years.length - 2], b = years[years.length - 1];
      let sa = 0, sb = 0, n = 0;
      MONTHS.forEach((_, m) => { if (a.values[m] != null && b.values[m] != null) { sa += a.values[m]; sb += b.values[m]; n++; } });
      ytd = { from: a.year, to: b.year, months: n, before: sa, now: sb, pct: pctChange(sb, sa) };
    }
    return { metric, label: COMPARE_METRICS[metric], years, ytd };
  }

  // Cash on hand (the "Total" sheet): opening + daily cash − general expenses − deposits + withdrawals + adjustments.
  function cashPosition(data, yearNum) {
    const year = data.years[yearNum];
    let balance = val(year.openingBalance);
    const months = [];
    for (let m = 0; m < 12; m++) {
      const s = monthSummary(data, yearNum, m);
      balance += s.netCash;
      months.push({ ...s, balance });
    }
    // Bank rows without a date (or from another year) still count in the year total, like the original sheet.
    let undated = 0;
    for (const b of year.bank) {
      const d = b.date ? new Date(b.date) : null;
      if (!d || isNaN(d) || d.getFullYear() !== Number(yearNum)) undated += val(b.withdraw) - val(b.deposit);
    }
    const adjustments = year.adjustments.reduce((s, a) => s + val(a.amount), 0);
    return { opening: val(year.openingBalance), months, undated, adjustments, total: balance + undated + adjustments };
  }

  function yearTotals(data, yearNum) {
    const keys = ['payouts', 'cash', 'sales', 'general', 'credit', 'totalR', 'cardDiff', 'deposits', 'withdrawals', 'netCash', 'salaryTotal'];
    const t = Object.fromEntries(keys.map((k) => [k, 0]));
    for (let m = 0; m < 12; m++) {
      const s = monthSummary(data, yearNum, m);
      for (const k of keys) t[k] += s[k];
    }
    return t;
  }

  function employeeTable(data, yearNum) {
    const year = data.years[yearNum];
    return year.employees.map((e) => {
      const months = MONTHS.map((_, m) => employeeSalary(year, e, m));
      const total = months.reduce((a, b) => a + b, 0);
      const paidMonths = months.filter((v) => v).length;
      const allTotal = total + val(e.bankPaid);
      return { emp: e, months, total, allTotal, average: paidMonths ? allTotal / paidMonths : 0 };
    });
  }

  // The "3AYLIK NAKIT" sheet: cash vs prescription revenue and estimated profit.
  function profitability(data, yearNum) {
    const year = data.years[yearNum];
    const st = data.settings;
    const rows = year.revenue.map((r) => {
      const cash = val(r.cash), rx = val(r.rx), total = cash + rx;
      return { cash, rx, total, cashShare: total ? (cash * 100) / total : null };
    });
    const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
    const calc = (factor) => {
      const cash = sum('cash') * factor, rx = sum('rx') * factor, total = cash + rx;
      const cashProfit = (cash * st.cashMargin) / 100;
      const rxProfit = (rx * st.rxMargin) / 100;
      const profit = cashProfit + rxProfit;
      const div = st.avgMonths || 12;
      const monthlyProfit = profit / div;
      const cost = st.operatingCost * factor;
      return {
        cash, rx, total, cashProfit, rxProfit, profit,
        monthlyProfit, monthlyRevenue: total / div, margin: total ? (monthlyProfit / (total / div)) * 100 : null,
        cost, net: monthlyProfit - cost,
      };
    };
    return { rows, actual: calc(1), projected: calc(st.projection || 1) };
  }

  function listGroups(list) {
    const groups = {};
    for (const e of list.entries) {
      const g = e.group || '(none)';
      groups[g] = (groups[g] || 0) + val(e.amount);
    }
    return groups;
  }

  root.Model = {
    MONTHS, uid, evalExpr, val, isExpression, round2, normName, daysInMonth,
    newRow, newMonth, newYear, newData, normalize,
    rowTotal, mapTotal, dayTotal, monthTotals, previousYearMonth, categoryComparison, yearComparison, COMPARE_METRICS, pctChange, monthSummary, cashPosition, yearTotals, employeeTable, employeeSalary,
    profitability, listGroups, bankForMonth,
  };
})(typeof module !== 'undefined' && module.exports ? module.exports : window);
