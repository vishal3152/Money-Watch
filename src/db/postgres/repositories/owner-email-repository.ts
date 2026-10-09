import { getScopedDb } from "@/db/postgres/scoped-db";
import { ownerEmails } from "@/db/postgres/schema";

/**
 * Owner id -> email mapping for admin/debug lookups directly against the app DB (see
 * postgres/migrations/20260911040000_owner_emails.sql). Not read by any repository or route —
 * it's an attestation of what the auth provider says an Owner's email is, written at sign-in/
 * sign-up (src/app/login/actions.ts, src/app/auth/callback/handle-callback.ts).
 */
export async function upsertOwnerEmail(connectionString: string, ownerId: string, email: string): Promise<void> {
  const db = getScopedDb(connectionString);

  await db
    .insert(ownerEmails)
    .values({ id: ownerId, email })
    .onConflictDoUpdate({ target: ownerEmails.id, set: { email } });
}
