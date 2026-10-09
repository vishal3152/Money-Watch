import { listAccounts } from "@/app/api/mcp/tools";
import { DatabaseConstraintError } from "@/db/errors";
import {
  getEmailSyncCursorRepository,
  getImportBatchRepository,
  getUnresolvedEmailAlertRepository,
  type RepositoryFactoryDeps
} from "@/db/repository-factory";
import type { UnresolvedEmailAlert } from "@/db/repositories/ports";
import { resolveAccountByNumberSuffix } from "@/domain/account-number-match";
import {
  InvalidEmailAlertError,
  isOccurredAtPlausible,
  toEmailAlertDraft,
  type EmailAlertDraft
} from "@/domain/email-alert";
import {
  advanceEmailSyncCursor,
  isMessageAlreadySynced,
  parseEmailMessageUid,
  type EmailSyncCursor
} from "@/domain/email-sync-cursor";
import { InvalidMinorUnitsError } from "@/domain/money";
import { createEmailAlertImportBatch } from "@/email-sync/create-email-alert-import-batch";
import { emailAlertImportBatchId, emailAlertTransactionId } from "@/email-sync/email-alert-import-ids";
import { type EmailAlertInput, type ParseAlertEmailDeps, parseAlertEmail } from "@/email-sync/parse-alert-email";
import { getCurrentOwnerId } from "@/lib/cloud-auth/current-owner";

export type FetchedEmailMessage = EmailAlertInput & {
  uid: string;
  /** The email's own `Date` header, ISO-formatted — undefined/null when it couldn't be parsed or a
   * caller doesn't have it. Used only to sanity-check the LLM's claimed occurredAt
   * (`isOccurredAtPlausible`), never sent to the LLM. Optional so existing callers/tests that don't
   * construct this field keep working — treated the same as null (check skipped). */
  receivedAt?: string | null;
};

export type RunEmailAlertSyncPollDeps = RepositoryFactoryDeps & {
  /** Scopes the sync pointer — typically the mailbox address being polled. */
  mailbox: string;
  fetchUnseenMessages: () => Promise<FetchedEmailMessage[]>;
  callLlm: (input: EmailAlertInput) => Promise<unknown>;
  classifyIsTransactionUpdate: ParseAlertEmailDeps["classifyIsTransactionUpdate"];
  newId?: () => string;
  now?: () => string;
};

export type EmailAlertSyncPollResult = {
  matched: number;
  /** Queued for the owner: a real bank alert that needs a field corrected or an Account chosen. */
  unresolved: number;
  /** Not a bank transaction alert — read, counted, and deliberately never stored. */
  ignored: number;
  /** Already behind the mailbox's pointer — not re-fetched from the LLM. */
  skipped: number;
};

/**
 * One poll pass: reads the mailbox's messages from wherever its pointer left off, structures each
 * via the injected LLM call, resolves the claimed Account deterministically, and creates an
 * ImportBatch for a resolved match (docs/specs/email-alert-sync.md).
 *
 * Only alerts that still need the owner are stored — a real bank alert with a field the LLM got
 * wrong, or one no single Account matched. Everything else the poll reads is accounted for by the
 * mailbox's `EmailSyncCursor` alone, which is what keeps a mailbox full of non-bank mail from
 * filling the database with rows nobody will ever act on.
 */
export async function runEmailAlertSyncPoll(deps: RunEmailAlertSyncPollDeps): Promise<EmailAlertSyncPollResult> {
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const now = deps.now ?? (() => new Date().toISOString());
  const ownerId = await (deps.getCurrentOwnerId ?? getCurrentOwnerId)();
  const unresolvedAlerts = await getUnresolvedEmailAlertRepository(deps);
  const cursors = await getEmailSyncCursorRepository(deps);

  const result: EmailAlertSyncPollResult = { matched: 0, unresolved: 0, ignored: 0, skipped: 0 };
  console.info(`[email-sync] fetching messages mailbox=${deps.mailbox}`);
  const fetched = await deps.fetchUnseenMessages();
  console.info(`[email-sync] fetched ${fetched.length} message(s) mailbox=${deps.mailbox}`);
  // Ascending uid order: the pointer records the highest message read, so reading out of order
  // would move it past messages this pass never looked at.
  const messages = [...fetched].sort(
    (left, right) => (parseEmailMessageUid(left.uid)?.uid ?? 0) - (parseEmailMessageUid(right.uid)?.uid ?? 0)
  );
  // Fetched once per poll, not per message: email alert sync only ever matches an existing Account
  // (never creates one, unlike MCP's resolve_account), so no message in this same pass can change
  // what listAccounts would return for a later message.
  const candidates = (await listAccounts(deps)).map((account) => ({
    accountId: account.id,
    accountNumber: account.accountNumber,
    institutionName: account.institution.name
  }));
  console.info(`[email-sync] account candidates=${candidates.length} mailbox=${deps.mailbox}`);

  let cursor: EmailSyncCursor | null = await cursors.get(deps.mailbox);

  // Two overlapping poll invocations for the same mailbox (overlapping cron runs, or a restarted
  // daemon racing its predecessor) can both read the same pointer and both queue the same message.
  // The unique (mailbox, messageUid) constraint rejects the loser — expected and benign (the other
  // call already recorded the same alert), not a real failure to surface.
  async function queueUnresolved(alert: UnresolvedEmailAlert): Promise<void> {
    try {
      await unresolvedAlerts.save(alert);
      result.unresolved += 1;
    } catch (error) {
      if (error instanceof DatabaseConstraintError) {
        result.skipped += 1;
        return;
      }
      throw error;
    }
  }

  for (const message of messages) {
    if (isMessageAlreadySynced(cursor, message.uid)) {
      result.skipped += 1;
      console.info(`[email-sync] message uid=${message.uid} skipped=behind-pointer`);
      continue;
    }

    await processMessage(message);

    // Per message, not once at the end: a poll that dies partway (an unreachable LLM host) must
    // not re-read and re-pay for the messages it already finished.
    const advanced = advanceEmailSyncCursor(cursor, {
      mailbox: deps.mailbox,
      messageUid: message.uid,
      now: now()
    });
    if (advanced !== null) {
      await cursors.save(advanced);
      cursor = advanced;
    }
  }

  console.info(
    `[email-sync] poll complete mailbox=${deps.mailbox} matched=${result.matched} unresolved=${result.unresolved} ignored=${result.ignored} skipped=${result.skipped}`
  );
  return result;

  async function processMessage(message: FetchedEmailMessage): Promise<void> {
    function unresolvedRow(input: {
      draft: EmailAlertDraft;
      invalidFields: string[];
      failureReason: string;
    }): UnresolvedEmailAlert {
      return {
        id: newId(),
        mailbox: deps.mailbox,
        messageUid: message.uid,
        detectedAt: now(),
        failureReason: input.failureReason,
        draft: input.draft,
        invalidFields: input.invalidFields
      };
    }

    console.info(`[email-sync] message uid=${message.uid} parsing via LLM`);
    const parsed = await parseAlertEmail(message, deps);

    if (parsed.status === "ignored") {
      // Not a bank transaction alert: read and counted, never stored.
      result.ignored += 1;
      console.info(`[email-sync] message uid=${message.uid} ignored=not-a-transaction-update`);
      return;
    }

    if (parsed.status === "invalid") {
      // The classifier judged this a real bank alert, so the owner almost certainly wants the
      // Transaction — queue it with the LLM's own values to correct rather than discarding it.
      console.info(
        `[email-sync] message uid=${message.uid} unresolved=invalid-fields fields=${parsed.invalidFields.join(",")}`
      );
      await queueUnresolved(
        unresolvedRow({
          draft: parsed.draft,
          invalidFields: parsed.invalidFields,
          failureReason: "invalid-fields"
        })
      );
      return;
    }

    const alert = parsed.alert;

    // A hallucinated occurredAt (wrong year, a date far in the future) otherwise passes field
    // validation as long as it's shaped like YYYY-MM-DD and would silently book the Transaction in
    // the wrong period — sanity-check it against when this email actually arrived.
    if (!isOccurredAtPlausible(alert.occurredAt, message.receivedAt ?? null)) {
      console.info(
        `[email-sync] message uid=${message.uid} unresolved=implausible-occurredAt occurredAt=${alert.occurredAt} receivedAt=${message.receivedAt ?? "null"}`
      );
      await queueUnresolved(
        unresolvedRow({
          draft: toEmailAlertDraft(alert),
          invalidFields: ["occurredAt"],
          failureReason: "implausible-occurredAt"
        })
      );
      return;
    }

    const match = resolveAccountByNumberSuffix(alert, candidates);

    if (match.status === "unresolved") {
      const failureReason = `${match.reason} (${alert.institutionName} …${alert.accountNumberSuffix})`;
      console.info(`[email-sync] message uid=${message.uid} unresolved ${failureReason}`);
      await queueUnresolved(
        unresolvedRow({ draft: toEmailAlertDraft(alert), invalidFields: [], failureReason })
      );
      return;
    }

    const batchId = emailAlertImportBatchId(ownerId, deps.mailbox, message.uid);
    const transactionId = emailAlertTransactionId(ownerId, deps.mailbox, message.uid);
    let n = 0;
    const stableNewId = () => {
      n += 1;
      if (n === 1) return batchId;
      if (n === 2) return transactionId;
      // createEmailAlertImportBatch always creates exactly one line item today; a second call to
      // commitImport's generic newId() would silently reuse transactionId and collide on the
      // primary key. Fail loudly instead if that invariant is ever broken.
      throw new Error(`stableNewId: expected at most 2 id allocations for one email alert, got call #${n}`);
    };

    let batch;
    try {
      batch = await createEmailAlertImportBatch(alert, match.accountId, { ...deps, newId: stableNewId });
    } catch (error) {
      // InvalidMinorUnitsError surfaces here (not from field validation) when the claimed
      // amount/balance is a shape validation can't catch without knowing the resolved Account's
      // currency yet — e.g. "1282.05" against a zero-decimal currency like JPY. Same disposition as
      // an InvalidEmailAlertError: this one alert's data needs the owner, not the whole poll.
      if (error instanceof InvalidEmailAlertError || error instanceof InvalidMinorUnitsError) {
        const failureReason = error instanceof InvalidEmailAlertError ? error.reason : "minorUnits";
        console.info(`[email-sync] message uid=${message.uid} unresolved=${failureReason}`);
        await queueUnresolved(
          unresolvedRow({
            draft: toEmailAlertDraft(alert),
            invalidFields: [failureReason === "minorUnits" ? "amount" : failureReason],
            failureReason
          })
        );
        return;
      }
      // Crash between a prior create and the pointer advancing: same deterministic ids → unique
      // conflict. Re-load the existing batch so we do not create a second ImportBatch.
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

    result.matched += 1;
    console.info(
      `[email-sync] message uid=${message.uid} matched accountId=${match.accountId} importBatchId=${batch.id}`
    );
  }
}
