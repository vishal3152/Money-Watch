/**
 * Webpack alias target for `better-sqlite3` on cloud/Vercel builds.
 * Desktop (ELECTRON_PACKAGE) and local SQLite keep the real native module.
 */
export default function Database(): never {
  throw new Error("SQLite (better-sqlite3) is not available in cloud deployments.");
}
