export type SyncOwnerEmail = (ownerId: string, email: string) => Promise<void>;

/**
 * Resolves the write for the admin/debug owner_emails mapping (src/db/postgres/schema.ts). A
 * no-op outside cloud mode; dynamically imports the Postgres driver like every other Supabase-
 * adjacent entry point so local/desktop never loads it.
 */
export async function resolveSyncOwnerEmail(override?: SyncOwnerEmail): Promise<SyncOwnerEmail> {
  if (override) {
    return override;
  }

  const { isCloudMode } = await import("@/config/deployment-mode");
  if (!isCloudMode()) {
    return async () => {};
  }

  const { resolvePostgresConnectionString } = await import("@/config/postgres-connection");
  const { upsertOwnerEmail } = await import("@/db/postgres/repositories/owner-email-repository");
  const connectionString = resolvePostgresConnectionString();

  return (ownerId, email) => upsertOwnerEmail(connectionString, ownerId, email);
}

/**
 * Called from the three places a session is established (src/app/login/actions.ts's signUp/
 * signIn, src/app/auth/callback/handle-callback.ts). Never allowed to fail the sign-in it's
 * riding along with — a transient write error is logged and swallowed.
 */
export async function syncOwnerEmailBestEffort(
  ownerId: string | undefined,
  email: string | null | undefined,
  override?: SyncOwnerEmail
): Promise<void> {
  if (!ownerId || !email) {
    return;
  }

  try {
    const sync = await resolveSyncOwnerEmail(override);
    await sync(ownerId, email);
  } catch (error) {
    console.error("Failed to sync owner email mapping:", error);
  }
}
