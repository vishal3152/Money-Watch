const { spawn } = require("node:child_process");
const { createServer } = require("node:net");
const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { homedir } = require("node:os");
const path = require("node:path");

const { app, BrowserWindow, dialog, ipcMain } = require("electron");

const {
  resolveAppLayout,
  resolveChildProcessEnv,
  resolveNodeBinary
} = require("./app-paths.cjs");

const isDev = process.env.ELECTRON_DEV === "1";
// Fixed (not random) so bookmarks and deep links stay stable across relaunches.
const PREFERRED_PORT = 4571;

let nextProcess;
let isQuitting = false;

function getDatabaseSettingsPath() {
  return path.join(homedir(), ".config", "paisa-watch", "settings.json");
}

function readSettings() {
  try {
    return JSON.parse(readFileSync(getDatabaseSettingsPath(), "utf8"));
  } catch {
    // Missing or invalid settings file.
    return {};
  }
}

function writeSettingsPatch(patch) {
  const settingsPath = getDatabaseSettingsPath();
  const merged = { ...readSettings(), ...patch };

  mkdirSync(path.dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
}

function readDatabasePathFromSettings() {
  const parsed = readSettings();

  if (typeof parsed.databasePath === "string" && parsed.databasePath.trim().length > 0) {
    return parsed.databasePath.trim();
  }

  return undefined;
}

function writeDatabasePathToSettings(databasePath) {
  writeSettingsPatch({ databasePath });
}

function resolveDatabasePath(userDataPath, env) {
  const settingsPath = readDatabasePathFromSettings();
  if (settingsPath !== undefined) {
    return settingsPath;
  }

  if (env.DATABASE_PATH !== undefined && env.DATABASE_PATH.trim().length > 0) {
    return env.DATABASE_PATH.trim();
  }

  return path.join(userDataPath, "paisa-watch.db");
}

function resolveAppUrl({ port }) {
  return `http://127.0.0.1:${port}`;
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = createServer();

    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

async function resolveLoopbackPort(preferredPort, maxAttempts = 20) {
  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const candidate = preferredPort + offset;

    if (await isPortFree(candidate)) {
      return candidate;
    }
  }

  throw new Error(`No free loopback port found starting at ${preferredPort}.`);
}

function getRuntimeLayout() {
  return resolveAppLayout({
    isPackaged: app.isPackaged,
    isDev,
    electronDir: __dirname,
    resourcesPath: process.resourcesPath,
    platform: process.platform
  });
}

function getNodeBinary(layout) {
  return resolveNodeBinary({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    layout,
    envNodeBinary: process.env.npm_node_execpath,
    electronExecPath: process.execPath
  });
}

function childEnv(layout, env) {
  return resolveChildProcessEnv(env, {
    useElectronAsNode: layout.useElectronAsNode
  });
}

function runPrepareDatabase(layout, env) {
  const nodeBinary = getNodeBinary(layout);
  const scriptEnv = childEnv(layout, {
    ...env,
    MIGRATIONS_FOLDER: layout.migrationsFolder
  });

  return new Promise((resolve, reject) => {
    const args = layout.prepareUsesTsx
      ? [
          path.join(layout.projectRoot, "node_modules", "tsx", "dist", "cli.mjs"),
          layout.prepareScript
        ]
      : [layout.prepareScript];

    const child = spawn(nodeBinary, args, {
      cwd: layout.projectRoot,
      env: scriptEnv,
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${layout.prepareScript} exited with code ${code == null ? "unknown" : code}`
        )
      );
    });
  });
}

function startNextServer(layout, port, env) {
  const nodeBinary = getNodeBinary(layout);
  const args = layout.passHostPortFlags
    ? [...layout.nextEntryArgs, "-H", "127.0.0.1", "-p", String(port)]
    : [...layout.nextEntryArgs];

  // Standalone `server.js` reads PORT / HOSTNAME; CLI `next start` also accepts flags.
  const nextEnv = childEnv(layout, {
    ...env,
    PORT: String(port),
    HOSTNAME: "127.0.0.1"
  });

  const child = spawn(nodeBinary, args, {
    cwd: layout.nextCwd,
    env: nextEnv,
    stdio: "inherit"
  });

  child.on("exit", (code) => {
    if (!isQuitting && code !== 0 && code !== null) {
      console.error(`Next.js exited with code ${code}`);
      app.quit();
    }
  });

  return child;
}

async function waitForUrl(url, timeoutMs = 60_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);

      if (response.status < 500) {
        return;
      }
    } catch {
      // Server not ready yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function createMainWindow(appUrl) {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "Money Watch",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs")
    }
  });

  await window.loadURL(appUrl);
  return window;
}

function stopNextServer() {
  if (!nextProcess || nextProcess.killed) {
    return;
  }

  nextProcess.kill("SIGTERM");
}

async function main() {
  await app.whenReady();

  ipcMain.handle("pick-database-file", async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(window ?? undefined, {
      title: "Choose database file",
      properties: ["openFile", "createDirectory"],
      filters: [{ name: "SQLite database", extensions: ["db", "sqlite", "sqlite3"] }]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle("pick-database-directory", async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(window ?? undefined, {
      title: "Choose database folder",
      properties: ["openDirectory", "createDirectory"]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  const userDataPath = path.join(app.getPath("appData"), "Paisa-Watch");
  app.setPath("userData", userDataPath);

  const databasePath = resolveDatabasePath(userDataPath, process.env);
  try {
    writeDatabasePathToSettings(databasePath);
  } catch (error) {
    console.warn("Could not persist database settings:", error);
  }

  const layout = getRuntimeLayout();

  // Desktop is local-only: never spawn Next in cloud mode, never load Supabase.
  const env = {
    ...process.env,
    DEPLOYMENT_MODE: "local",
    PAISA_WATCH_DESKTOP: "1",
    DATABASE_PATH: databasePath,
    MIGRATIONS_FOLDER: layout.migrationsFolder
  };

  await runPrepareDatabase(layout, env);

  const port = await resolveLoopbackPort(PREFERRED_PORT);
  const appUrl = resolveAppUrl({ port });
  nextProcess = startNextServer(layout, port, env);
  await waitForUrl(appUrl);
  await createMainWindow(appUrl);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow(appUrl);
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("before-quit", () => {
    isQuitting = true;
    stopNextServer();
  });
}

main().catch((error) => {
  console.error(error);
  stopNextServer();
  app.quit();
  process.exit(1);
});
