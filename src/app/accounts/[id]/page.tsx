import Link from "next/link";
import { notFound } from "next/navigation";

import { BackLink } from "@/app/components/back-link";
import { CollapsibleSectionList } from "@/app/components/collapsible-section-list";
import { DeleteIcon, EditIcon } from "@/app/components/icons";
import { TransactionLedger } from "@/app/components/transaction-ledger";
import { resolveSystemMessage } from "@/app/components/system-message";
import { SystemMessageBanner } from "@/app/components/system-message-banner";
import { DISPLAY_LOCALE, formatMinorUnits, minorUnitsToDecimalString } from "@/app/format-money";
import { LEDGER_FETCH_SIZE } from "@/app/list-pagination";
import { getTranslator } from "@/i18n/server";
import type { LedgerRow } from "@/app/accounts/[id]/ledger-page";
import {
  getAccountRepository,
  getInstitutionRepository,
  getReconciliationRepository,
  getTransactionRepository
} from "@/db/repository-factory";

export const dynamic = "force-dynamic";

type AccountDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ message?: string }>;
};

export default async function AccountDetailPage({ params, searchParams }: AccountDetailPageProps) {
  const { id } = await params;
  const { message } = await searchParams;
  const { t } = await getTranslator();
  const systemMessage = resolveSystemMessage(message, t);
  const account = await (await getAccountRepository()).getById(id);

  if (!account) {
    notFound();
  }

  const [institutions, transactionRepository, reconciliationRepository] = await Promise.all([
    getInstitutionRepository(),
    getTransactionRepository(),
    getReconciliationRepository()
  ]);
  // Every read here is keyed on the Account, so they all issue together. The
  // Adjustment links used to need this wave's Transaction and Reconciliation
  // ids first; resolving them by accountId in one join removes that second
  // wait, which over a remote database is a whole round trip.
  //
  // Only the ledger's first page is fetched — the rest arrives through
  // `loadLedgerPage` as the owner scrolls. The balance therefore has to be
  // summed in SQL over the whole ledger, not reduced from the rows on screen.
  const [institution, ledgerPage, months, balanceTotals, reconciliations, adjustmentLinks] =
    await Promise.all([
      institutions.getById(account.institutionId),
      transactionRepository.listPageByAccountId(id, { limit: LEDGER_FETCH_SIZE, offset: 0 }),
      transactionRepository.listMonthsByAccountId(id),
      transactionRepository.sumAmountsByAccountIds([id]),
      reconciliationRepository.listByAccountId(id),
      reconciliationRepository.listAdjustmentLinksByAccountId(id)
    ]);
  const adjustmentReconciliationIds = Object.fromEntries(
    adjustmentLinks.map((link) => [link.transactionId, link.reconciliationId])
  );
  const balance = balanceTotals[0]?.balanceMinor ?? 0;
  const initialRows: LedgerRow[] = ledgerPage.rows.map((transaction) => ({
    id: transaction.id,
    description: transaction.description,
    occurredAt: transaction.occurredAt,
    amountMinor: transaction.amountMinor,
    trustStatus: transaction.trustStatus,
    category: transaction.category,
    transferId: transaction.transferId,
    possibleDuplicateOfTransactionId: transaction.possibleDuplicateOfTransactionId ?? null
  }));

  return (
    <main className="pw-main">
      <article className="pw-detail">
        <BackLink
          href={`/institutions/${account.institutionId}`}
          label={
            institution
              ? t("common.backTo", { name: institution.name })
              : t("accounts.detail.backToInstitution")
          }
        />

        <header className="pw-detail-header">
          <div className="pw-detail-heading-row">
            <h1>{account.name}</h1>
            <div className="pw-detail-heading-actions">
              <Link className="pw-menu" href={`/accounts/${id}/edit`} aria-label={t("accounts.detail.edit")}>
                <EditIcon className="pw-detail-icon" />
              </Link>
              <Link
                className="pw-menu pw-menu-danger"
                href={`/accounts/${id}/delete`}
                aria-label={t("accounts.detail.delete")}
              >
                <DeleteIcon className="pw-detail-icon" />
              </Link>
            </div>
          </div>
          <p className="pw-detail-lede pw-detail-meta">
            {institution ? (
              <>
                <Link href={`/institutions/${institution.id}`}>{institution.name}</Link>
                <span className="pw-meta-sep" aria-hidden="true">
                  ·
                </span>
              </>
            ) : null}
            <span>{account.currencyCode}</span>
            {account.accountNumber ? (
              <>
                <span className="pw-meta-sep" aria-hidden="true">
                  ·
                </span>
                <span>{account.accountNumber}</span>
              </>
            ) : null}
          </p>
        </header>

        {systemMessage ? <SystemMessageBanner message={systemMessage} /> : null}

        <section className="pw-balance-block" aria-labelledby="balance-heading">
          <p className="pw-balance">
            <span id="balance-heading" className="pw-balance-label">
              {t("accounts.detail.computedBalance")}
            </span>
            <span className="pw-balance-figure">
              <span className="pw-balance-value">
                {minorUnitsToDecimalString(balance, account.currencyCode)}
              </span>
              <span className="pw-balance-currency">{account.currencyCode}</span>
            </span>
          </p>
        </section>

        <section className="pw-section" aria-labelledby="ledger-heading">
          <TransactionLedger
            accountId={id}
            currencyCode={account.currencyCode}
            headingId="ledger-heading"
            toggleLabel={t("accounts.detail.ledgerToggle")}
            initialRows={initialRows}
            initialTotal={ledgerPage.total}
            months={months}
            adjustmentReconciliationIds={adjustmentReconciliationIds}
          />
        </section>

        <section className="pw-section" aria-labelledby="reconciliation-heading">
          <p className="pw-detail-lede pw-section-note">{t("accounts.detail.reconcileNote")}</p>
          {reconciliations.length === 0 ? (
            <>
              <div className="pw-section-heading">
                <h2 id="reconciliation-heading">{t("accounts.detail.reconciliationHistory")}</h2>
                <Link className="pw-section-action" href={`/accounts/${id}/reconcile`}>
                  {t("accounts.detail.reconcile")}
                </Link>
              </div>
              <p className="pw-empty">{t("accounts.detail.noReconciliations")}</p>
            </>
          ) : (
            <CollapsibleSectionList
              headingId="reconciliation-heading"
              heading={
                <>
                  {t("accounts.detail.reconciliationHistory")}
                  <span className="pw-section-count">{reconciliations.length}</span>
                </>
              }
              toggleLabel={t("accounts.detail.reconciliationHistory")}
              trailing={
                <Link className="pw-section-action" href={`/accounts/${id}/reconcile`}>
                  {t("accounts.detail.reconcile")}
                </Link>
              }
            >
              {reconciliations.map((reconciliation) => (
                <li key={reconciliation.id}>
                  <Link href={`/reconciliations/${reconciliation.id}`}>
                    <span>{new Date(reconciliation.reconciledAt).toLocaleDateString(DISPLAY_LOCALE)}</span>
                    <span className="pw-item-amount">
                      {formatMinorUnits(
                        reconciliation.computedBalanceMinor,
                        account.currencyCode
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </CollapsibleSectionList>
          )}
        </section>

        <p className="pw-detail-lede pw-section-note">{t("accounts.detail.actionsNote")}</p>
        <div className="pw-actions pw-sticky-actions">
          <Link className="pw-action-primary" href={`/accounts/${id}/transactions/new`}>
            {t("accounts.detail.addTransaction")}
          </Link>
          <Link href={`/transfers/new?sourceAccountId=${id}`}>
            {t("accounts.detail.addTransfer")}
          </Link>
        </div>
      </article>
    </main>
  );
}
