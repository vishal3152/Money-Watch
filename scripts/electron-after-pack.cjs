const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

/**
 * electron-builder's pnpm workspace collector still packs the monorepo's
 * production dependencies into app.asar even when directories.app has an empty
 * dependencies map. The Electron shell only needs its three CJS files — Next
 * and better-sqlite3 already live under extraResources — so strip node_modules
 * from the asar after pack.
 */
exports.default = async function stripAsarNodeModules(context) {
  const asar = require("@electron/asar");
  const appName = context.packager.appInfo.productFilename;
  const resourcesDir =
    context.electronPlatformName === "darwin"
      ? path.join(context.appOutDir, `${appName}.app`, "Contents", "Resources")
      : path.join(context.appOutDir, "resources");

  const asarPath = path.join(resourcesDir, "app.asar");
  const unpackedPath = path.join(resourcesDir, "app.asar.unpacked");

  if (!fs.existsSync(asarPath)) {
    return;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "paisa-watch-asar-"));
  try {
    asar.extractAll(asarPath, tmpDir);
    fs.rmSync(path.join(tmpDir, "node_modules"), { recursive: true, force: true });
    fs.rmSync(asarPath, { force: true });
    fs.rmSync(unpackedPath, { recursive: true, force: true });
    await asar.createPackage(tmpDir, asarPath);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
};
