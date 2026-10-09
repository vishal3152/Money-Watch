import { notFound } from "next/navigation";

import { StockTransactionForm } from "@/app/share-trading-accounts/[id]/stock-transactions/new/stock-transaction-form";
import { getShareTradingAccountRepository } from "@/db/repository-factory";

export const dynamic = "force-dynamic";

type NewStockTransactionPageProps = {
  params: Promise<{ id: string }>;
};

export default async function NewStockTransactionPage({ params }: NewStockTransactionPageProps) {
  const { id } = await params;
  const shareTradingAccount = await (await getShareTradingAccountRepository()).getById(id);

  if (!shareTradingAccount) {
    notFound();
  }

  return (
    <main className="pw-main">
      <StockTransactionForm
        shareTradingAccountId={shareTradingAccount.id}
        currencyCode={shareTradingAccount.currencyCode}
      />
    </main>
  );
}
