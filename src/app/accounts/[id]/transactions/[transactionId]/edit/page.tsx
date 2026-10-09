import Link from "next/link";
import { notFound } from "next/navigation";

import { TransactionForm } from "@/app/accounts/[id]/transactions/new/transaction-form";
import { toDatetimeLocalValue } from "@/app/datetime-local";
import { minorUnitsToDecimalString } from "@/app/format-money";
import { resolveReturnTo } from "@/app/return-to";
import {
  getAccountRepository,
  getAdjustmentRepository,
  getTransactionRepository
} from "@/db/repository-factory";
import { getTranslator } from "@/i18n/server";

export const dynamic = "force-dynamic";

type EditTransactionPageProps = {
  params: Promise<{ id: string; transactionId: string }>;
  searchParams: Promise<{ returnTo?: string }>;
};

export default async function EditTransactionPage({ params, searchParams }: EditTransactionPageProps) {
  const { id, transactionId } = await params;
  const { t } = await getTranslator();
  const { returnTo: returnToParam } = await searchParams;
  const returnTo = resolveReturnTo(returnToParam, `/accounts/${id}`);
  const [account, transaction] = await Promise.all([
    (await getAccountRepository()).getById(id),
    (await getTransactionRepository()).getById(transactionId)
  ]);

  if (!account || !transaction || transaction.accountId !== id) {
    notFound();
  }

  if (transaction.transferId !== null) {
    notFound();
  }
  const adjustment = await (await getAdjustmentRepository()).getByTransactionId(transactionId);
  if (adjustment) {
    notFound();
  }

  return (
    <main className="pw-main">
      <div className="pw-form-stack">
        <TransactionForm
          accountId={id}
          currencyCode={account.currencyCode}
          returnTo={returnTo}
          initialValues={{
            transactionId: transaction.id,
            kind: transaction.amountMinor < 0 ? "Expense" : "Income",
            category: transaction.category ?? "",
            amount: minorUnitsToDecimalString(Math.abs(transaction.amountMinor), account.currencyCode),
            description: transaction.description,
            occurredAt: toDatetimeLocalValue(new Date(transaction.occurredAt))
          }}
        />
        <div className="pw-actions pw-danger-zone">
          <Link
            className="pw-danger-link"
            href={`/accounts/${id}/transactions/${transactionId}/delete?returnTo=${encodeURIComponent(returnTo)}`}
          >
            {t("transactions.delete.link")}
          </Link>
        </div>
      </div>
    </main>
  );
}
