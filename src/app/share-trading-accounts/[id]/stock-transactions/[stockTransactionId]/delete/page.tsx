import { notFound } from "next/navigation";

import { BackLink } from "@/app/components/back-link";
import { DeleteConfirmForm } from "@/app/components/delete-confirm-form";
import { deleteStockTransaction } from "@/app/share-trading-accounts/[id]/stock-transactions/[stockTransactionId]/delete/actions";
import {
  getShareTradingAccountRepository,
  getStockTransactionRepository
} from "@/db/repository-factory";
import { getTranslator } from "@/i18n/server";

export const dynamic = "force-dynamic";

type DeleteStockTransactionPageProps = {
  params: Promise<{ id: string; stockTransactionId: string }>;
};

export default async function DeleteStockTransactionPage({ params }: DeleteStockTransactionPageProps) {
  const { id, stockTransactionId } = await params;
  const { t } = await getTranslator();
  const [shareTradingAccount, stockTransaction] = await Promise.all([
    (await getShareTradingAccountRepository()).getById(id),
    (await getStockTransactionRepository()).getById(stockTransactionId)
  ]);

  if (!shareTradingAccount || !stockTransaction || stockTransaction.shareTradingAccountId !== id) {
    notFound();
  }

  return (
    <main className="pw-main">
      <section className="pw-card" aria-labelledby="delete-stock-transaction-heading">
        <BackLink href={`/share-trading-accounts/${id}`} label={t("transactions.backToAccount")} />
        <h1 id="delete-stock-transaction-heading">{t("stockTransactions.delete.heading")}</h1>
        <p className="pw-detail-lede">{t("stockTransactions.delete.warning")}</p>
        <DeleteConfirmForm
          action={deleteStockTransaction}
          hiddenFields={{ stockTransactionId, shareTradingAccountId: id }}
          confirmLabel={t("stockTransactions.delete.confirm")}
        />
      </section>
    </main>
  );
}
