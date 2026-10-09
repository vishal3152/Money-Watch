import { notFound } from "next/navigation";

import { deleteShareTradingAccount } from "@/app/share-trading-accounts/[id]/delete-actions";
import { BackLink } from "@/app/components/back-link";
import { DeleteConfirmForm } from "@/app/components/delete-confirm-form";
import { getShareTradingAccountRepository } from "@/db/repository-factory";
import { getTranslator } from "@/i18n/server";

export const dynamic = "force-dynamic";

type DeleteShareTradingAccountPageProps = {
  params: Promise<{ id: string }>;
};

export default async function DeleteShareTradingAccountPage({ params }: DeleteShareTradingAccountPageProps) {
  const { id } = await params;
  const { t, plural } = await getTranslator();
  const shareTradingAccounts = await getShareTradingAccountRepository();
  // getDependentCounts() is keyed by `id` alone, not by the resolved ShareTradingAccount, so it
  // doesn't need to wait behind getById() (mirrors accounts/[id]/delete/page.tsx).
  const [shareTradingAccount, dependents] = await Promise.all([
    shareTradingAccounts.getById(id),
    shareTradingAccounts.getDependentCounts(id)
  ]);

  if (!shareTradingAccount) {
    notFound();
  }

  const blockingReasons: string[] = [];

  if (dependents.stockTransactions > 0) {
    blockingReasons.push(plural("count.stockTransactions", dependents.stockTransactions));
  }
  if (dependents.stockImportBatches > 0) {
    blockingReasons.push(
      plural("count.stockImportBatches", dependents.stockImportBatches)
    );
  }

  return (
    <main className="pw-main">
      <section className="pw-card" aria-labelledby="delete-share-trading-account-heading">
        <BackLink href={`/share-trading-accounts/${id}`} label={t("common.backTo", { name: shareTradingAccount.name })} />
        <h1 id="delete-share-trading-account-heading">
          {t("shareTrading.delete.heading", { name: shareTradingAccount.name })}
        </h1>
        {blockingReasons.length > 0 ? (
          <>
            <p className="pw-banner-error" role="alert">
              {t("shareTrading.delete.blocked", {
                reasons: blockingReasons.join(t("common.listSeparator"))
              })}
            </p>
            <p className="pw-detail-lede">{t("shareTrading.delete.blockedNote")}</p>
          </>
        ) : (
          <>
            <p className="pw-detail-lede">{t("shareTrading.delete.warning")}</p>
            <DeleteConfirmForm
              action={deleteShareTradingAccount}
              hiddenFields={{ shareTradingAccountId: id, institutionId: shareTradingAccount.institutionId }}
              confirmLabel={t("shareTrading.delete.confirm")}
            />
          </>
        )}
      </section>
    </main>
  );
}
