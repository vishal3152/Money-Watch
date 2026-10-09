import postgres, { type Sql } from "postgres";

const GLOBAL_POOLS_KEY = "__paisaWatchPgPools";

type GlobalWithPools = typeof globalThis & {
  [GLOBAL_POOLS_KEY]?: Map<string, Sql>;
};

function getPooledClients(): Map<string, Sql> {
  const globalWithPools = globalThis as GlobalWithPools;
  // Survive Next.js Fast Refresh: a module-level Map is wiped on reload while
  // the old `postgres` clients stay open against the configured host's
  // session-mode pooler (hard cap ~15 on Supabase's). Storing the Map on
  // globalThis keeps one shared pool across HMR cycles instead of leaking
  // toward EMAXCONNSESSION.
  if (!globalWithPools[GLOBAL_POOLS_KEY]) {
    globalWithPools[GLOBAL_POOLS_KEY] = new Map();
  }
  return globalWithPools[GLOBAL_POOLS_KEY];
}

/**
 * Returns a shared, pooled `postgres` client for the given connection
 * string, creating it once and reusing it on every subsequent call. Opening
 * a fresh TCP/TLS connection per query is the previous behavior this
 * replaces — against a remote pooler that cost seconds per query.
 *
 * `max` is kept conservative: a session-mode connection pooler in front of
 * `POSTGRES_URL` (Supabase's, by default on port 5432) typically enforces a
 * small hard cap on simultaneous client connections per project (observed
 * on Supabase: 15, shared across every dev, build, and test process pointed
 * at that project) — unlike the previous open-then-immediately-close
 * behavior, a held pool can accumulate toward that cap under concurrent
 * request load.
 */
// Opt-in (PW_LOG_SQL=1) query log for diagnosing render latency: one line per
// query with a timestamp, so gaps between lines in server output reveal
// serialization behind the pool's `max: 3` cap, not just the query text.
function logQuery(_connection: number, query: string, params: unknown[]): void {
  console.log(`[sql] ${new Date().toISOString()} ${query.replace(/\s+/g, " ").trim()} -- ${JSON.stringify(params)}`);
}

export function getPooledClient(connectionString: string): Sql {
  const pooledClients = getPooledClients();
  const existing = pooledClients.get(connectionString);
  if (existing) {
    return existing;
  }

  const client = postgres(connectionString, {
    max: 3,
    // Opening a connection to a remote host is ~6 round trips (SSLRequest, TLS,
    // SCRAM-SHA-256, startup) — against the measured ~120ms RTT to the
    // configured host that is ~700ms, more than a whole page's worth of warm
    // queries. At the previous 20s a normal browsing pause dropped the pool, so
    // most navigations paid that handshake again. 300s spans realistic idle
    // gaps while still releasing connections well before `max_lifetime`.
    idle_timeout: 300,
    max_lifetime: 60 * 30,
    debug: process.env.PW_LOG_SQL === "1" ? logQuery : undefined
  });
  pooledClients.set(connectionString, client);
  return client;
}
