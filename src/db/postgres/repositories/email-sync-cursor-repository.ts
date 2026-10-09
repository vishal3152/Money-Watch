import { and, eq } from "drizzle-orm";

import { getScopedDb } from "@/db/postgres/scoped-db";
import { emailSyncCursors } from "@/db/postgres/schema";
import type { EmailSyncCursorRepositoryPort } from "@/db/repositories/ports";
import type { EmailSyncCursor } from "@/domain/email-sync-cursor";

/**
 * Cloud-tier counterpart to `EmailSyncCursorRepository` — one pointer per (Owner, mailbox), so a
 * cron-triggered poll resumes exactly where the previous invocation stopped
 * (ADR-0010, docs/specs/email-alert-sync.md).
 */
export class PgEmailSyncCursorRepository implements EmailSyncCursorRepositoryPort {
  constructor(
    private readonly connectionString: string,
    private readonly ownerId: string
  ) {}

  async get(mailbox: string): Promise<EmailSyncCursor | null> {
    const db = getScopedDb(this.connectionString);

    const rows = await db
      .select()
      .from(emailSyncCursors)
      .where(and(eq(emailSyncCursors.ownerId, this.ownerId), eq(emailSyncCursors.mailbox, mailbox)));

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      mailbox: row.mailbox,
      uidValidity: row.uidValidity,
      lastMessageUid: row.lastMessageUid,
      updatedAt: row.updatedAt
    };
  }

  async save(cursor: EmailSyncCursor): Promise<void> {
    const db = getScopedDb(this.connectionString);

    await db
      .insert(emailSyncCursors)
      .values({ ownerId: this.ownerId, ...cursor })
      .onConflictDoUpdate({
        target: [emailSyncCursors.ownerId, emailSyncCursors.mailbox],
        set: {
          uidValidity: cursor.uidValidity,
          lastMessageUid: cursor.lastMessageUid,
          updatedAt: cursor.updatedAt
        }
      });
  }
}
