import { and, desc, eq } from "drizzle-orm";

import { DatabaseConstraintError, hasPostgresErrorCode } from "@/db/errors";
import { getScopedDb } from "@/db/postgres/scoped-db";
import { processedEmailAlerts } from "@/db/postgres/schema";
import {
  deserializeEmailAlertDraft,
  deserializeInvalidFields
} from "@/db/repositories/email-alert-draft-json";
import type { UnresolvedEmailAlert, UnresolvedEmailAlertRepositoryPort } from "@/db/repositories/ports";

/**
 * Cloud-tier counterpart to `UnresolvedEmailAlertRepository` — the per-Owner review queue of bank
 * alert emails that could not be imported automatically (ADR-0010,
 * docs/specs/email-alert-sync.md). Idempotency lives in `PgEmailSyncCursorRepository`, not here.
 */
export class PgUnresolvedEmailAlertRepository implements UnresolvedEmailAlertRepositoryPort {
  constructor(
    private readonly connectionString: string,
    private readonly ownerId: string
  ) {}

  async save(alert: UnresolvedEmailAlert): Promise<void> {
    const db = getScopedDb(this.connectionString);

    try {
      await db.insert(processedEmailAlerts).values({
        id: alert.id,
        ownerId: this.ownerId,
        mailbox: alert.mailbox,
        messageUid: alert.messageUid,
        status: "unresolved",
        processedAt: alert.detectedAt,
        importBatchId: null,
        failureReason: alert.failureReason,
        parsedAlertJson: null,
        alertDraftJson: JSON.stringify(alert.draft),
        invalidFieldsJson: JSON.stringify(alert.invalidFields)
      });
    } catch (error) {
      // Two overlapping polls can both reach the same (ownerId, mailbox, messageUid); the loser
      // must get the same typed error the SQLite repository's runDatabaseWrite gives its caller,
      // not a raw driver error no instanceof check can match.
      if (hasPostgresErrorCode(error, "23505")) {
        throw new DatabaseConstraintError(error);
      }
      throw error;
    }
  }

  async listAll(): Promise<UnresolvedEmailAlert[]> {
    const db = getScopedDb(this.connectionString);

    const rows = await db
      .select()
      .from(processedEmailAlerts)
      .where(
        and(
          eq(processedEmailAlerts.ownerId, this.ownerId),
          eq(processedEmailAlerts.status, "unresolved")
        )
      )
      .orderBy(desc(processedEmailAlerts.processedAt));

    return rows.map((row) => toUnresolvedEmailAlert(row));
  }

  async getById(id: string): Promise<UnresolvedEmailAlert | null> {
    const db = getScopedDb(this.connectionString);

    const rows = await db
      .select()
      .from(processedEmailAlerts)
      .where(
        and(
          eq(processedEmailAlerts.ownerId, this.ownerId),
          eq(processedEmailAlerts.id, id),
          eq(processedEmailAlerts.status, "unresolved")
        )
      );

    const row = rows[0];
    return row ? toUnresolvedEmailAlert(row) : null;
  }

  async delete(id: string): Promise<boolean> {
    const db = getScopedDb(this.connectionString);

    const deleted = await db
      .delete(processedEmailAlerts)
      .where(
        and(
          eq(processedEmailAlerts.ownerId, this.ownerId),
          eq(processedEmailAlerts.id, id),
          eq(processedEmailAlerts.status, "unresolved")
        )
      )
      .returning({ id: processedEmailAlerts.id });

    return deleted.length > 0;
  }
}

function toUnresolvedEmailAlert(row: {
  id: string;
  mailbox: string;
  messageUid: string;
  processedAt: string;
  failureReason: string | null;
  parsedAlertJson: string | null;
  alertDraftJson: string | null;
  invalidFieldsJson: string | null;
}): UnresolvedEmailAlert {
  return {
    id: row.id,
    mailbox: row.mailbox,
    messageUid: row.messageUid,
    detectedAt: row.processedAt,
    failureReason: row.failureReason,
    draft: deserializeEmailAlertDraft(row.alertDraftJson, row.parsedAlertJson),
    invalidFields: deserializeInvalidFields(row.invalidFieldsJson)
  };
}
