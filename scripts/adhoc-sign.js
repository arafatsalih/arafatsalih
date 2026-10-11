// Ad-hoc signs the app (no Apple Developer certificate needed) so it can open on Apple Silicon Macs.
// Runs as electron-builder's afterSign hook, before the .dmg/.zip are made.
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin' || process.platform !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
  console.log('Ad-hoc signed', app);
};
