import Link from "next/link";
import { notFound } from "next/navigation";

import { StockTransactionForm } from "@/app/share-trading-accounts/[id]/stock-transactions/new/stock-transaction-form";
import { toDatetimeLocalValue } from "@/app/datetime-local";
import { minorUnitsToDecimalString } from "@/app/format-money";
import {
  getShareTradingAccountRepository,
  getStockTransactionRepository
} from "@/db/repository-factory";
import { getTranslator } from "@/i18n/server";

export const dynamic = "force-dynamic";

type EditStockTransactionPageProps = {
  params: Promise<{ id: string; stockTransactionId: string }>;
};

export default async function EditStockTransactionPage({ params }: EditStockTransactionPageProps) {
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
      <div className="pw-form-stack">
        <StockTransactionForm
          shareTradingAccountId={id}
          currencyCode={shareTradingAccount.currencyCode}
          initialValues={{
            stockTransactionId: stockTransaction.id,
            type: stockTransaction.type,
            scripCode: stockTransaction.scripCode,
            quantity: String(stockTransaction.quantity),
            price: minorUnitsToDecimalString(stockTransaction.pricePerUnitMinor, shareTradingAccount.currencyCode),
            description: stockTransaction.description,
            occurredAt: toDatetimeLocalValue(new Date(stockTransaction.occurredAt))
          }}
        />
        <div className="pw-actions pw-danger-zone">
          <Link
            className="pw-danger-link"
            href={`/share-trading-accounts/${id}/stock-transactions/${stockTransactionId}/delete`}
          >
            {t("stockTransactions.delete.link")}
          </Link>
        </div>
      </div>
    </main>
  );
}
