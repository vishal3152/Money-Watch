const path = require("node:path");

/**
 * Resolves filesystem layout for the Electron shell in unpackaged vs packaged builds.
 * Packaged apps keep Next/SQLite assets under process.resourcesPath (extraResources).
 * Packaged Next/SQLite children run via Electron-as-Node (no bundled system Node binary).
 */
function resolveAppLayout({ isPackaged, isDev, electronDir, resourcesPath }) {
  if (!isPackaged) {
    const projectRoot = path.join(electronDir, "..");
    const nextBin = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");

    return {
      projectRoot,
      nextCwd: projectRoot,
      nextEntryArgs: [nextBin, isDev ? "dev" : "start"],
      passHostPortFlags: true,
      prepareScript: path.join(projectRoot, "scripts", "prepare-database.ts"),
      prepareUsesTsx: true,
      migrationsFolder: path.join(projectRoot, "drizzle"),
      useElectronAsNode: false,
      nodeBinaryRelativeToResources: null
    };
  }

  const nextRoot = path.join(resourcesPath, "next");

  return {
    projectRoot: nextRoot,
    nextCwd: nextRoot,
    // Standalone server reads PORT/HOSTNAME from env; do not pass next CLI flags.
    nextEntryArgs: [path.join(nextRoot, "server.js")],
    passHostPortFlags: false,
    prepareScript: path.join(nextRoot, "scripts", "prepare-database.cjs"),
    prepareUsesTsx: false,
    migrationsFolder: path.join(resourcesPath, "drizzle"),
    useElectronAsNode: true,
    nodeBinaryRelativeToResources: null
  };
}

function resolveNodeBinary({ isPackaged, layout, envNodeBinary, electronExecPath }) {
  if (!isPackaged) {
    return envNodeBinary || "node";
  }

  if (!layout.useElectronAsNode) {
    throw new Error("Packaged layout must use Electron as Node.");
  }

  if (!electronExecPath) {
    throw new Error("Packaged Electron-as-Node requires electronExecPath.");
  }

  return electronExecPath;
}

/**
 * Env for Next / prepare-database child processes.
 * Packaged builds must set ELECTRON_RUN_AS_NODE on the Electron executable child.
 * Unpackaged builds strip a host-inherited flag so system Node is unaffected and
 * the parent Electron process stays a real Electron app.
 */
function resolveChildProcessEnv(baseEnv, { useElectronAsNode }) {
  const env = { ...baseEnv };

  if (useElectronAsNode) {
    env.ELECTRON_RUN_AS_NODE = "1";
  } else {
    delete env.ELECTRON_RUN_AS_NODE;
  }

  return env;
}

module.exports = {
  resolveAppLayout,
  resolveNodeBinary,
  resolveChildProcessEnv
};
