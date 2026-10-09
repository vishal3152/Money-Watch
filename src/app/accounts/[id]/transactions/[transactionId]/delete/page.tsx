import { notFound } from "next/navigation";

import { BackLink } from "@/app/components/back-link";
import { DeleteConfirmForm } from "@/app/components/delete-confirm-form";
import { deleteTransaction } from "@/app/accounts/[id]/transactions/[transactionId]/delete/delete-actions";
import { resolveReturnTo } from "@/app/return-to";
import {
  getAccountRepository,
  getAdjustmentRepository,
  getTransactionRepository
} from "@/db/repository-factory";
import { getTranslator } from "@/i18n/server";

export const dynamic = "force-dynamic";

type DeleteTransactionPageProps = {
  params: Promise<{ id: string; transactionId: string }>;
  searchParams: Promise<{ returnTo?: string }>;
};

export default async function DeleteTransactionPage({ params, searchParams }: DeleteTransactionPageProps) {
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
      <section className="pw-card" aria-labelledby="delete-transaction-heading">
        <BackLink href={`/accounts/${id}`} label={t("transactions.backToAccount")} />
        <h1 id="delete-transaction-heading">{t("transactions.delete.heading")}</h1>
        <p className="pw-detail-lede">{t("transactions.delete.warning")}</p>
        <DeleteConfirmForm
          action={deleteTransaction}
          hiddenFields={{ transactionId, accountId: id, returnTo }}
          confirmLabel={t("transactions.delete.confirm")}
        />
      </section>
    </main>
  );
}
