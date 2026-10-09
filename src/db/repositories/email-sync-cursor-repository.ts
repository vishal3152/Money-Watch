import { eq } from "drizzle-orm";

import type { DrizzleDb } from "@/db/client";
import { runDatabaseWrite } from "@/db/errors";
import type { EmailSyncCursorRepositoryPort } from "@/db/repositories/ports";
import { emailSyncCursors } from "@/db/schema";
import type { EmailSyncCursor } from "@/domain/email-sync-cursor";

/**
 * How far each polled mailbox has been read (docs/specs/email-alert-sync.md). This pointer is the
 * whole idempotency mechanism — nothing else records that a message was seen, so a mailbox full of
 * non-bank mail costs one row per mailbox rather than one row per email.
 */
export class EmailSyncCursorRepository implements EmailSyncCursorRepositoryPort {
  constructor(private readonly db: DrizzleDb) {}

  async get(mailbox: string): Promise<EmailSyncCursor | null> {
    const row = await this.db.query.emailSyncCursors.findFirst({
      where: eq(emailSyncCursors.mailbox, mailbox)
    });

    return row ?? null;
  }

  async save(cursor: EmailSyncCursor): Promise<void> {
    await runDatabaseWrite(() =>
      this.db
        .insert(emailSyncCursors)
        .values(cursor)
        .onConflictDoUpdate({
          target: emailSyncCursors.mailbox,
          set: {
            uidValidity: cursor.uidValidity,
            lastMessageUid: cursor.lastMessageUid,
            updatedAt: cursor.updatedAt
          }
        })
    );
  }
}
