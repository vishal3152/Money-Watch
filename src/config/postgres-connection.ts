const DEFAULT_LOCAL_CONNECTION_STRING = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export function resolvePostgresConnectionString(): string {
  const envUrl = process.env.POSTGRES_URL;
  if (envUrl !== undefined && envUrl.trim().length > 0) {
    return envUrl.trim();
  }

  return DEFAULT_LOCAL_CONNECTION_STRING;
}
