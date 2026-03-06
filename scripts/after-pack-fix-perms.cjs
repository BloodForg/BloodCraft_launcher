const fs = require('node:fs/promises');
const path = require('node:path');

async function touchWritable(targetPath) {
  let stat;
  try {
    stat = await fs.lstat(targetPath);
  } catch {
    return;
  }

  if (stat.isSymbolicLink()) {
    return;
  }

  const writableMode = stat.mode | 0o200;
  try {
    await fs.chmod(targetPath, writableMode);
  } catch {
    // best effort
  }

  if (!stat.isDirectory()) {
    return;
  }

  const entries = await fs.readdir(targetPath);
  for (const entry of entries) {
    await touchWritable(path.join(targetPath, entry));
  }
}

module.exports = async (context) => {
  if (context.electronPlatformName !== 'darwin') {
    return;
  }

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const jreDir = path.join(context.appOutDir, appName, 'Contents', 'Resources', 'jre');
  await touchWritable(jreDir);
};
