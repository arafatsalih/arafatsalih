// Electron main process: window, menu, data file on disk, file dialogs, PDF export.
const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const dataDir = () => app.getPath('userData');
const dataFile = () => path.join(dataDir(), 'cashbook-data.json');
const backupDir = () => path.join(dataDir(), 'backups');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Stadium Cashbook',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

function send(cmd) {
  if (win) win.webContents.send('menu', cmd);
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Import Excel Workbook…', accelerator: 'CmdOrCtrl+O', click: () => send('import-excel') },
        { label: 'Export Year to Excel…', accelerator: 'CmdOrCtrl+E', click: () => send('export-excel') },
        { type: 'separator' },
        { label: 'Monthly Report…', accelerator: 'CmdOrCtrl+R', click: () => send('report') },
        { type: 'separator' },
        { label: 'Back Up Data…', click: () => send('backup') },
        { label: 'Restore From Backup…', click: () => send('restore') },
        { label: 'Show Data Folder', click: () => shell.openPath(dataDir()) },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Keep one automatic backup per day, last 30 days.
function dailyBackup(json) {
  try {
    fs.mkdirSync(backupDir(), { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    const file = path.join(backupDir(), `cashbook-${day}.json`);
    fs.writeFileSync(file, json);
    const files = fs.readdirSync(backupDir()).filter((f) => f.endsWith('.json')).sort();
    while (files.length > 30) fs.unlinkSync(path.join(backupDir(), files.shift()));
  } catch (e) {
    console.error('Backup failed', e);
  }
}

ipcMain.handle('load-data', () => {
  try {
    return fs.readFileSync(dataFile(), 'utf8');
  } catch {
    return null;
  }
});

ipcMain.handle('save-data', (_e, json) => {
  fs.mkdirSync(dataDir(), { recursive: true });
  const tmp = dataFile() + '.tmp';
  fs.writeFileSync(tmp, json);
  fs.renameSync(tmp, dataFile());
  dailyBackup(json);
  return true;
});

ipcMain.handle('open-file', async (_e, { title, extensions }) => {
  const res = await dialog.showOpenDialog(win, {
    title,
    properties: ['openFile'],
    filters: [{ name: extensions.join(', '), extensions }],
  });
  if (res.canceled || !res.filePaths.length) return null;
  const p = res.filePaths[0];
  return { name: path.basename(p), data: fs.readFileSync(p) };
});

ipcMain.handle('save-file', async (_e, { defaultName, data, extensions }) => {
  const res = await dialog.showSaveDialog(win, {
    defaultPath: path.join(app.getPath('documents'), defaultName),
    filters: [{ name: extensions.join(', '), extensions }],
  });
  if (res.canceled || !res.filePath) return null;
  fs.writeFileSync(res.filePath, Buffer.from(data));
  return res.filePath;
});

// Renders the given HTML in a hidden window and saves it as PDF.
ipcMain.handle('save-pdf', async (_e, { defaultName, html }) => {
  const res = await dialog.showSaveDialog(win, {
    defaultPath: path.join(app.getPath('documents'), defaultName),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (res.canceled || !res.filePath) return null;
  const pdfWin = new BrowserWindow({ show: false, webPreferences: { javascript: false } });
  await pdfWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  const pdf = await pdfWin.webContents.printToPDF({
    pageSize: 'A4',
    printBackground: true,
    margins: { marginType: 'custom', top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
  });
  pdfWin.destroy();
  fs.writeFileSync(res.filePath, pdf);
  shell.openPath(res.filePath);
  return res.filePath;
});

ipcMain.handle('reveal', (_e, p) => shell.showItemInFolder(p));

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
