// Copies the browser build of ExcelJS into src/vendor so the app works offline.
const fs = require('fs');
const path = require('path');
const src = require.resolve('exceljs/dist/exceljs.min.js');
const dir = path.join(__dirname, '..', 'src', 'vendor');
fs.mkdirSync(dir, { recursive: true });
fs.copyFileSync(src, path.join(dir, 'exceljs.min.js'));
console.log('Copied exceljs.min.js to src/vendor');
