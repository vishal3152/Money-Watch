import { DatabaseConstraintError } from "@/db/errors";
import {
  getImportBatchRepository,
  getUnresolvedEmailAlertRepository,
  type RepositoryFactoryDeps
} from "@/db/repository-factory";
import type { ImportableEmailAlert } from "@/domain/email-alert";
import type { ImportBatch } from "@/domain/import-batch";
import { createEmailAlertImportBatch } from "@/email-sync/create-email-alert-import-batch";
import { emailAlertImportBatchId, emailAlertTransactionId } from "@/email-sync/email-alert-import-ids";
import { getCurrentOwnerId } from "@/lib/cloud-auth/current-owner";

export class EmailAlertNotResolvableError extends Error {
  constructor(public readonly reason: "not-found") {
    super(`Email alert cannot be resolved (${reason}).`);
    this.name = "EmailAlertNotResolvableError";
  }
}

/**
 * Owner-driven resolve: take a queued alert, the Account the owner chose for it and the field
 * values they corrected, create the same email ImportBatch the poll would have created on an
 * automatic match, and drop the alert from the review queue
 * (docs/specs/email-alert-sync.md).
 *
 * The corrected values are imported, not whatever the LLM originally claimed — the stored draft is
 * only the starting point the owner edited. Idempotent on retry: a prior attempt that created the
 * ImportBatch but failed before the delete reuses the same deterministic ids and returns that batch.
 */
export async function resolveUnresolvedEmailAlert(
  input: { alertId: string; accountId: string; alert: ImportableEmailAlert },
  deps: RepositoryFactoryDeps = {}
): Promise<ImportBatch> {
  const unresolvedAlerts = await getUnresolvedEmailAlertRepository(deps);
  const queued = await unresolvedAlerts.getById(input.alertId);
  if (!queued) {
    throw new EmailAlertNotResolvableError("not-found");
  }

  const ownerId = await (deps.getCurrentOwnerId ?? getCurrentOwnerId)();
  const batchId = emailAlertImportBatchId(ownerId, queued.mailbox, queued.messageUid);
  const transactionId = emailAlertTransactionId(ownerId, queued.mailbox, queued.messageUid);
  let n = 0;
  const stableNewId = () => {
    n += 1;
    if (n === 1) return batchId;
    if (n === 2) return transactionId;
    throw new Error(`stableNewId: expected at most 2 id allocations for one email alert, got call #${n}`);
  };

  let batch: ImportBatch;
  try {
    batch = await createEmailAlertImportBatch(input.alert, input.accountId, {
      ...deps,
      newId: stableNewId
    });
  } catch (error) {
    // Crash between a prior create and the delete: same deterministic ids → unique conflict.
    // Re-load the existing batch and finish the resolve (mirrors runEmailAlertSyncPoll).
    if (error instanceof DatabaseConstraintError) {
      const existing = await (await getImportBatchRepository(deps)).getById(batchId);
      if (existing) {
        batch = existing;
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }

  await unresolvedAlerts.delete(queued.id);
  return batch;
}
