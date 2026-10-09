import { commitImport, type CommitImportDeps } from "@/app/api/mcp/tools";
import { getAccountRepository } from "@/db/repository-factory";
import { InvalidEmailAlertError, toSignedAmount, type ImportableEmailAlert } from "@/domain/email-alert";
import type { ImportBatch } from "@/domain/import-batch";

/**
 * Creates an unconfirmed ImportBatch (`source: "email"`) and its single Imported Transaction for
 * a resolved email alert, reusing `commitImport`'s validation path (currency-aware decimal
 * parsing, calendar-date validation) — the same untrusted-caller invariants as MCP statement
 * import apply to the LLM's output (docs/specs/email-alert-sync.md). Takes only the fields that
 * reach the ledger: an alert's claimed balance, reference, institution name and account-number
 * suffix never do, so a value the LLM mangled in one of those must not block the import.
 */
export async function createEmailAlertImportBatch(
  alert: ImportableEmailAlert,
  accountId: string,
  deps: CommitImportDeps = {}
): Promise<ImportBatch> {
  const account = await (await getAccountRepository(deps)).getById(accountId);
  if (!account) {
    throw new InvalidEmailAlertError("accountId");
  }
  if (account.currencyCode !== alert.currencyCode) {
    throw new InvalidEmailAlertError("currencyCode");
  }

  return commitImport(
    {
      accountId,
      source: "email",
      lineItems: [
        {
          amount: toSignedAmount(alert),
          occurredAt: alert.occurredAt,
          description: alert.description,
          category: null
        }
      ],
      // Deliberately never stashed as the batch's closing balance/as-of date, unlike a statement
      // import: an alert's claimed balance is the balance right after *that one* transaction, not
      // necessarily the account's true end-of-day balance — a second alert on the same account the
      // same day (or any transaction the alert-based feed never sees) makes it wrong. Stashing it
      // would create a BalanceSnapshot/Reconciliation on Confirm All that's often a false
      // Discrepancy rather than a real one. The owner can still reconcile manually via
      // /accounts/[id]/reconcile using a genuine end-of-day balance (docs/specs/email-alert-sync.md).
      closingBalance: null,
      asOfDate: null
    },
    deps
  );
}
