# Stadium Cashbook

A Mac app that replaces `2026StadiumInfo.xlsx`. It does everything the workbook does — and makes monthly reports.

| In the workbook | In the app |
|---|---|
| `January` … `December` (Daily Expenses, Daily Cash, Total Sales, last-year comparison) | **Months → Daily (Till)** tab |
| `January Exp` … `December Exp` (General Expenses, Total Expenses) | **Months → General Expenses** tab |
| `CreditCard` (Credit, Total R, Diff, previous years) | **Months → Credit Card** tab |
| `BankDeposit` | **Bank** |
| `Total` (cash on hand, transfer from last year) | **Cash on Hand** |
| `Employees` (salary per month, paid via bank, average) | **Employees** |
| `3AYLIK NAKIT` (cash vs prescription, profit, ×1.4 projection) | **Profitability** |
| `Alinan Ilaclar`, `Sheet1`, `STADZEKAT` and any other sheet | **Other Lists** |
| — | **Monthly Report** (on screen, save as PDF or Excel, print) |
| — | **Compare Years** (every year in the app side by side) |

## Getting started

1. Open the app and choose **File → Import Excel Workbook…** (or the **Import Excel…** button), then pick your `2026StadiumInfo.xlsx`.
   The year comes from the file name. Every month, category, credit card figure, last-year number, employee and list is brought in.
2. Click a month in the sidebar and type into the grid just like in Excel:
   - type a number, or a sum like `270+360` (it's kept and shown in blue; hover to see it)
   - **Enter / ↓** goes down, **↑**, and **← →** at the edge of a cell move sideways
   - the **⋯** next to a category lets you move, insert, delete, copy it to later months, or mark it as an employee
3. **Monthly Report** shows the report for any month. Use **Save as PDF…**, **Save as Excel…** or **Print…**.
4. **File → Export Year to Excel…** writes a workbook with the same sheets and working formulas, so you can still open it in Excel.

Your data saves automatically (in `~/Library/Application Support/Stadium Cashbook/`), with a daily backup kept for 30 days.
**Import / Export → Save backup file…** saves a copy anywhere you like, such as iCloud Drive.
When January comes, **Import / Export → Start 2027…** carries over the categories, the employees and the cash on hand.

### How the totals are calculated (same as the workbook)

- **Total Sales** for a day = everything paid from the till that day + **Daily Cash**.
- **Cash on hand** = opening balance + daily cash − general expenses − bank deposits + bank withdrawals + adjustments.
- **Employee salary** for a month = every row with that employee's name in that month's Daily and General Expenses sheets.
  Upper/lower case, spaces and Turkish letters don't matter. If a name is spelled another way, add it under "Also matches".
- **Credit card Diff** = Credit − Total R.

### Comparing with earlier years

Import each old workbook into its own year (e.g. `2025StadiumInfo.xlsx` → 2025). Then:

- Each month compares itself with the same month last year: total sales, daily cash, paid from till, general expenses, salaries and credit card.
  If last year is in the app, its real totals are used automatically. A "last year" figure typed on the month's Daily (Till) tab, or imported from the workbook, takes priority and is marked *(typed)*. Clear it to use the stored data.
- **Compare Years** shows every year in the app month by month, for total sales, daily cash, general expenses, paid from till or credit card, with a chart, totals, averages and the change between the last two years. A "same months" figure compares a part year fairly.
- The **Monthly Report** has a "Compared with <month> <last year>" section, including category-by-category changes when last year is in the app.

## Installing on your Mac

### Option A — download the built app
Each push to GitHub builds the app on a Mac (see the **Actions** tab → *Build Mac app* → the newest run → **Artifacts** → `Stadium-Cashbook-mac`).
Unzip it, open the `.dmg`, and drag **Stadium Cashbook** into **Applications**.

The app isn't signed with an Apple Developer certificate, so the first time you open it macOS will block it:
open **System Settings → Privacy & Security**, scroll down, and click **Open Anyway** next to "Stadium Cashbook".
(If macOS says the app "is damaged", run this once in Terminal: `xattr -cr "/Applications/Stadium Cashbook.app"`.)

### Option B — build it yourself
You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm start        # run the app now
npm run dist     # build dist/Stadium Cashbook-1.0.0-universal.dmg
```

## For developers

- `main.js` / `preload.js` — Electron shell: window, menu, data file, file dialogs, PDF output
- `src/model.js` — data model and every calculation
- `src/excel.js` — Excel import/export (ExcelJS)
- `src/report.js` — monthly report page
- `src/app.js` — the user interface
- `npm test` — calculation and Excel round-trip checks (`node scripts/test-model.js path/to/workbook.xlsx` also prints what an import found)
