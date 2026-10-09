import { notFound } from "next/navigation";

import { ReconciliationForm } from "@/app/accounts/[id]/reconcile/reconciliation-form";
import { getAccountRepository } from "@/db/repository-factory";

export const dynamic = "force-dynamic";

type ReconcilePageProps = {
  params: Promise<{ id: string }>;
};

export default async function ReconcilePage({ params }: ReconcilePageProps) {
  const { id } = await params;
  const account = await (await getAccountRepository()).getById(id);

  if (!account) {
    notFound();
  }

  return (
    <main className="pw-main">
      <ReconciliationForm accountId={account.id} currencyCode={account.currencyCode} />
    </main>
  );
}
