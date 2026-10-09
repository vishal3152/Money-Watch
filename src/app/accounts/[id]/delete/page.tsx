import { notFound } from "next/navigation";

import { deleteAccount, hardDeleteAccount } from "@/app/accounts/[id]/delete-actions";
import { BackLink } from "@/app/components/back-link";
import { DeleteConfirmForm } from "@/app/components/delete-confirm-form";
import { HardDeleteConfirmForm } from "@/app/components/hard-delete-confirm-form";
import {
  getAccountRepository,
  getReconciliationRepository,
  getTransactionRepository,
  getTransferRepository
} from "@/db/repository-factory";
import { getTranslator } from "@/i18n/server";

export const dynamic = "force-dynamic";

type DeleteAccountPageProps = {
  params: Promise<{ id: string }>;
};

export default async function DeleteAccountPage({ params }: DeleteAccountPageProps) {
  const { id } = await params;
  const { t, plural } = await getTranslator();
  const accounts = await getAccountRepository();
  // getDependentCounts() is keyed by `id` alone, not by the resolved
  // Account, so it doesn't need to wait behind getById().
  const [account, dependents] = await Promise.all([
    accounts.getById(id),
    accounts.getDependentCounts(id)
  ]);

  if (!account) {
    notFound();
  }

  const blockingReasons: string[] = [];

  if (dependents.transactions > 0) {
    blockingReasons.push(plural("count.transactions", dependents.transactions));
  }
  if (dependents.reconciliations > 0) {
    blockingReasons.push(plural("count.reconciliations", dependents.reconciliations));
  }
  if (dependents.fixedDeposits > 0) {
    blockingReasons.push(plural("count.linkedFixedDeposits", dependents.fixedDeposits));
  }

  const [transactionRepository, reconciliationRepository, transferRepository] = await Promise.all([
    getTransactionRepository(),
    getReconciliationRepository(),
    getTransferRepository()
  ]);

  const [transactionCount, reconciliations, adjustmentLinks, transferImpact] = await Promise.all([
    transactionRepository.countByAccountId(id),
    reconciliationRepository.listByAccountId(id),
    reconciliationRepository.listAdjustmentLinksByAccountId(id),
    transferRepository.getTransferImpactByAccountId(id)
  ]);

  const separator = t("common.listSeparator");
  const hardDeleteBreakdown: string[] = [];
  if (transactionCount > 0) {
    hardDeleteBreakdown.push(plural("count.transactions", transactionCount));
  }
  if (reconciliations.length > 0) {
    hardDeleteBreakdown.push(plural("count.reconciliations", reconciliations.length));
  }
  if (adjustmentLinks.length > 0) {
    hardDeleteBreakdown.push(plural("count.adjustments", adjustmentLinks.length));
  }
  if (transferImpact.transferCount > 0) {
    const transferCount = plural("count.transfers", transferImpact.transferCount);
    hardDeleteBreakdown.push(
      transferImpact.counterpartyAccountNames.length > 0
        ? t("accounts.delete.transfersAffecting", {
            transfers: transferCount,
            names: transferImpact.counterpartyAccountNames.join(separator)
          })
        : transferCount
    );
  }

  return (
    <main className="pw-main">
      <div className="pw-form-stack">
        <section className="pw-card" aria-labelledby="delete-account-heading">
          <BackLink href={`/accounts/${id}`} label={t("common.backTo", { name: account.name })} />
          <h1 id="delete-account-heading">
            {t("accounts.delete.heading", { name: account.name })}
          </h1>
          {blockingReasons.length > 0 ? (
            <>
              <p className="pw-banner-error" role="alert">
                {t("accounts.delete.blocked", { reasons: blockingReasons.join(separator) })}
              </p>
              <p className="pw-detail-lede">{t("accounts.delete.blockedNote")}</p>
            </>
          ) : (
            <>
              <p className="pw-detail-lede">{t("accounts.delete.warning")}</p>
              <DeleteConfirmForm
                action={deleteAccount}
                hiddenFields={{ accountId: id, institutionId: account.institutionId }}
                confirmLabel={t("accounts.delete.confirm")}
              />
            </>
          )}
        </section>
        <section className="pw-card" aria-labelledby="hard-delete-account-heading">
          <h2 id="hard-delete-account-heading">{t("accounts.delete.dangerZone")}</h2>
          <p className="pw-detail-lede">
            {hardDeleteBreakdown.length > 0
              ? t("accounts.delete.hardWarningWithBreakdown", {
                  breakdown: hardDeleteBreakdown.join(separator)
                })
              : t("accounts.delete.hardWarning")}
          </p>
          <HardDeleteConfirmForm
            action={hardDeleteAccount}
            hiddenFields={{ accountId: id, institutionId: account.institutionId }}
            confirmName={account.name}
            confirmLabel={t("accounts.delete.hardConfirm")}
          />
        </section>
      </div>
    </main>
  );
}
