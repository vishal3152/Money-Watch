import Link from "next/link";
import { notFound } from "next/navigation";

import { BackLink } from "@/app/components/back-link";
import {
  formatMinorUnits,
  minorUnitsToDecimalString
} from "@/app/format-money";
import { ResolutionForm } from "@/app/reconciliations/[id]/resolution-form";
import {
  getAccountRepository,
  getAdjustmentRepository,
  getBalanceSnapshotRepository,
  getReconciliationRepository,
  getTransactionRepository
} from "@/db/repository-factory";
import { getTranslator } from "@/i18n/server";

export const dynamic = "force-dynamic";

type ReconciliationDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ReconciliationDetailPage({
  params
}: ReconciliationDetailPageProps) {
  const { id } = await params;
  const { t } = await getTranslator();
  const reconciliations = await getReconciliationRepository();
  const reconciliation = await reconciliations.getById(id);

  if (!reconciliation) {
    notFound();
  }

  const [account, snapshot, discrepancy] = await Promise.all([
    getAccountRepository().then((repo) => repo.getById(reconciliation.accountId)),
    getBalanceSnapshotRepository().then((repo) => repo.getById(reconciliation.balanceSnapshotId)),
    reconciliations.getDiscrepancyByReconciliationId(id)
  ]);

  if (!account || !snapshot) {
    notFound();
  }

  const adjustment = discrepancy
    ? await (await getAdjustmentRepository()).getByDiscrepancyId(discrepancy.id)
    : null;
  const adjustmentTransaction = adjustment
    ? await (await getTransactionRepository()).getById(adjustment.transactionId)
    : null;

  return (
    <main className="pw-main">
      <article className="pw-detail">
        <BackLink href={`/accounts/${account.id}`} label={t("common.backTo", { name: account.name })} />
        <h1>{t("reconciliations.heading")}</h1>
        <p className="pw-detail-lede">
          <Link href={`/accounts/${account.id}`}>{account.name}</Link>
          {" · "}
          {snapshot.asOfDate}
        </p>
        <dl className="pw-facts">
          <div>
            <dt>{t("reconciliations.reportedBalance")}</dt>
            <dd>{formatMinorUnits(snapshot.balanceMinor, account.currencyCode)}</dd>
          </div>
          <div>
            <dt>{t("reconciliations.computedBalance")}</dt>
            <dd>
              {formatMinorUnits(reconciliation.computedBalanceMinor, account.currencyCode)}
            </dd>
          </div>
          <div>
            <dt>{t("reconciliations.difference")}</dt>
            <dd className={discrepancy ? "pw-value-alert" : undefined}>
              {formatMinorUnits(
                snapshot.balanceMinor - reconciliation.computedBalanceMinor,
                account.currencyCode
              )}
            </dd>
          </div>
        </dl>

        {discrepancy ? (
          <section className="pw-section" aria-labelledby="discrepancy-heading">
            <h2 id="discrepancy-heading">
              {t("reconciliations.discrepancy")}
              {!discrepancy.resolution ? (
                <span className="pw-badge">{t("reconciliations.unresolvedBadge")}</span>
              ) : null}
            </h2>
            <p>
              {discrepancy.resolution
                ? t("reconciliations.resolvedNote", {
                    resolution: t(`discrepancyResolution.${discrepancy.resolution}`)
                  })
                : t("reconciliations.unresolvedNote")}
            </p>
            {!discrepancy.resolution ? (
              <ResolutionForm
                reconciliationId={id}
                discrepancyId={discrepancy.id}
                defaultAmount={minorUnitsToDecimalString(
                  discrepancy.amountMinor,
                  account.currencyCode
                )}
              />
            ) : null}
            {adjustmentTransaction ? (
              <p className="pw-banner-success" role="status">
                {t("reconciliations.adjustmentCreated", {
                  amount: formatMinorUnits(adjustmentTransaction.amountMinor, account.currencyCode),
                  description: adjustmentTransaction.description
                })}
              </p>
            ) : null}
          </section>
        ) : (
          <p className="pw-empty">{t("reconciliations.balancesMatch")}</p>
        )}
      </article>
    </main>
  );
}
