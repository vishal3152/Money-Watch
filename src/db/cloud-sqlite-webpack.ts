/**
 * Cloud/Vercel webpack helpers for keeping native better-sqlite3 out of
 * serverless bundles. Prefer opting out of Next's default externalization via
 * `transpilePackages: ["better-sqlite3"]` plus resolve.alias → stub; do not
 * replace Next's externals array (that drops builtins like `buffer`).
 */

export function shouldStubBetterSqlite3(options: {
  cloudBuildWithoutSqlite: boolean;
  isServer: boolean;
  nextRuntime?: "nodejs" | "edge";
}): boolean {
  return (
    options.cloudBuildWithoutSqlite &&
    options.isServer &&
    options.nextRuntime !== "edge"
  );
}

/** Packages Next must bundle (not externalize) so resolve.alias can swap the stub. */
export function cloudSqliteTranspilePackages(
  cloudBuildWithoutSqlite: boolean
): string[] {
  return cloudBuildWithoutSqlite ? ["better-sqlite3"] : [];
}
