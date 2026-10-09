import { notFound } from "next/navigation";

import { TransactionForm } from "@/app/accounts/[id]/transactions/new/transaction-form";
import { getAccountRepository } from "@/db/repository-factory";

export const dynamic = "force-dynamic";

type NewTransactionPageProps = {
  params: Promise<{ id: string }>;
};

export default async function NewTransactionPage({ params }: NewTransactionPageProps) {
  const { id } = await params;
  const account = await (await getAccountRepository()).getById(id);

  if (!account) {
    notFound();
  }

  return (
    <main className="pw-main">
      <TransactionForm accountId={account.id} currencyCode={account.currencyCode} />
    </main>
  );
}
