import { eq, sql } from "drizzle-orm";

import { resolveEmailSyncEncryptionKey } from "@/config/email-sync-encryption-key";
import { getScopedDb } from "@/db/postgres/scoped-db";
import { emailSyncSettings } from "@/db/postgres/schema";
import { decryptSecret, encryptSecret } from "@/domain/secret-cipher";

export type EmailSyncCredentials = {
  ownerId: string;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapPassword: string;
  llmBaseUrl: string;
  /** Undefined when the configured host needs no auth (e.g. a local Ollama server). */
  llmApiKey?: string;
  llmModel: string;
  pollIntervalMinutes: number;
};

export type EmailSyncStatus = {
  lastCheckedAt: string | null;
  lastResult: "success" | "error" | null;
  lastErrorMessage: string | null;
};

const EMPTY_STATUS: EmailSyncStatus = { lastCheckedAt: null, lastResult: null, lastErrorMessage: null };

/**
 * `imapUser`/`imapPassword` are encrypted at rest (`src/domain/secret-cipher.ts`) — decrypted here
 * so every other caller (Server Actions, the cron route) keeps working against the plaintext
 * `EmailSyncCredentials` shape. Decryption happens only in this Node-side repository, never in the
 * browser, satisfying "decrypt server-side, on need basis": a row is decrypted only when actually
 * read, not stored decrypted anywhere.
 */
function rowToCredentials(row: typeof emailSyncSettings.$inferSelect): EmailSyncCredentials {
  const key = resolveEmailSyncEncryptionKey();
  return {
    ownerId: row.ownerId,
    imapHost: row.imapHost,
    imapPort: row.imapPort,
    imapUser: decryptSecret(row.imapUser, key),
    imapPassword: decryptSecret(row.imapPassword, key),
    llmBaseUrl: row.llmBaseUrl,
    llmApiKey: row.llmApiKey ?? undefined,
    llmModel: row.llmModel,
    pollIntervalMinutes: row.pollIntervalMinutes
  };
}

/**
 * Per-Owner email alert sync credentials (ADR-0010, docs/specs/email-alert-sync.md's "Cloud
 * credentials" note) — the cloud-tier counterpart to the local tier's single-owner settings.json.
 */
export class PgEmailSyncSettingsRepository {
  constructor(
    private readonly connectionString: string,
    private readonly ownerId: string
  ) {}

  async get(): Promise<EmailSyncCredentials | null> {
    const db = getScopedDb(this.connectionString);

    const rows = await db.select().from(emailSyncSettings).where(eq(emailSyncSettings.ownerId, this.ownerId));

    const row = rows[0];
    return row ? rowToCredentials(row) : null;
  }

  /** Full replace (upsert on ownerId) — callers merge blank/omitted fields with the existing row themselves. */
  async set(credentials: Omit<EmailSyncCredentials, "ownerId">): Promise<void> {
    const db = getScopedDb(this.connectionString);
    const key = resolveEmailSyncEncryptionKey();
    const toStore = {
      ...credentials,
      imapUser: encryptSecret(credentials.imapUser, key),
      imapPassword: encryptSecret(credentials.imapPassword, key)
    };

    await db
      .insert(emailSyncSettings)
      .values({ ownerId: this.ownerId, ...toStore })
      .onConflictDoUpdate({
        target: emailSyncSettings.ownerId,
        set: toStore
      });
  }

  /** The most recent poll's outcome (manual "Check now" or the Vercel Cron run), surfaced on /settings. */
  async getStatus(): Promise<EmailSyncStatus> {
    const db = getScopedDb(this.connectionString);
    const rows = await db
      .select({
        lastCheckedAt: emailSyncSettings.lastCheckedAt,
        lastResult: emailSyncSettings.lastResult,
        lastErrorMessage: emailSyncSettings.lastErrorMessage
      })
      .from(emailSyncSettings)
      .where(eq(emailSyncSettings.ownerId, this.ownerId));

    const row = rows[0];
    if (!row) {
      return EMPTY_STATUS;
    }

    return {
      lastCheckedAt: row.lastCheckedAt ?? null,
      lastResult: row.lastResult === "success" || row.lastResult === "error" ? row.lastResult : null,
      lastErrorMessage: row.lastErrorMessage ?? null
    };
  }

  /** Requires a settings row to already exist for this Owner (set() must run first). */
  async setStatus(status: EmailSyncStatus): Promise<void> {
    const db = getScopedDb(this.connectionString);
    await db
      .update(emailSyncSettings)
      .set(status)
      .where(eq(emailSyncSettings.ownerId, this.ownerId));
  }
}

/** One Owner's lookup outcome — `ok: false` when that row's credentials couldn't be decrypted
 * (a missing/rotated EMAIL_SYNC_ENCRYPTION_KEY, or a corrupt stored value). Kept per-row so one
 * bad Owner never aborts `listAllEmailSyncCredentials` before the cron route's own per-Owner
 * isolation ever runs — see that function's doc comment. */
export type EmailSyncCredentialsLookupResult =
  | ({ ok: true } & EmailSyncCredentials)
  | { ok: false; ownerId: string; error: unknown };

/**
 * Cron-only: reads every Owner's row, not scoped to one — the direct Postgres connection bypasses
 * RLS the same way every repository here does (ADR-0006), so this is a deliberate, narrow
 * exception to the per-Owner-scoped pattern the rest of this file (and every other Pg repository)
 * follows. Never call this from a per-Owner Server Action; it would leak another Owner's
 * credentials. Only the Vercel Cron route (src/app/api/cron/email-sync/route.ts) calls it.
 *
 * Ordered by `lastPolledAt` ascending, nulls (never polled) first: a cron invocation that hits its
 * own time budget partway through the Owner list must rotate to whichever Owners it skipped last
 * time, not always lose the same tail of the table to starvation.
 *
 * Decryption failures are caught per row (`ok: false`) rather than thrown from this call — a single
 * Owner's bad/rotated encryption key must not prevent every other Owner's credentials from being
 * returned at all.
 */
export async function listAllEmailSyncCredentials(
  connectionString: string
): Promise<EmailSyncCredentialsLookupResult[]> {
  const db = getScopedDb(connectionString);
  const rows = await db
    .select()
    .from(emailSyncSettings)
    .orderBy(sql`${emailSyncSettings.lastPolledAt} asc nulls first`);

  return rows.map((row) => {
    try {
      return { ok: true, ...rowToCredentials(row) };
    } catch (error) {
      return { ok: false, ownerId: row.ownerId, error };
    }
  });
}

/** Records that an Owner's mailbox was just attempted (success or failure) — called by the cron
 * route after every Owner it processes, so the ordering above rotates instead of retrying the
 * same head-of-list Owners on every invocation. */
export async function recordEmailSyncPollAttempt(
  connectionString: string,
  ownerId: string,
  at: string
): Promise<void> {
  const db = getScopedDb(connectionString);
  await db.update(emailSyncSettings).set({ lastPolledAt: at }).where(eq(emailSyncSettings.ownerId, ownerId));
}
