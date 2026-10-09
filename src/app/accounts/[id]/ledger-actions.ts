"use server";

import { LEDGER_FETCH_SIZE } from "@/app/list-pagination";
import { getTransactionRepository } from "@/db/repository-factory";
import type { LedgerPage, LedgerPageRequest } from "@/app/accounts/[id]/ledger-page";

/**
 * Next page of one Account's ledger, for the client component's scroll-to-load.
 * `accountId` arrives from the client, but the repository is owner-scoped, so
 * another Owner's id simply reads as an empty ledger — the same seam every
 * other read goes through, rather than a second ownership check beside it.
 */
export async function loadLedgerPage(request: LedgerPageRequest): Promise<LedgerPage> {
  const transactionRepository = await getTransactionRepository();
  const page = await transactionRepository.listPageByAccountId(request.accountId, {
    limit: LEDGER_FETCH_SIZE,
    offset: request.offset,
    search: request.search,
    month: request.month
  });

  return {
    rows: page.rows.map((transaction) => ({
      id: transaction.id,
      description: transaction.description,
      occurredAt: transaction.occurredAt,
      amountMinor: transaction.amountMinor,
      trustStatus: transaction.trustStatus,
      category: transaction.category,
      transferId: transaction.transferId,
      possibleDuplicateOfTransactionId: transaction.possibleDuplicateOfTransactionId ?? null
    })),
    total: page.total
  };
}
