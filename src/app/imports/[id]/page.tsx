import Link from "next/link";
import { notFound } from "next/navigation";

import { BackLink } from "@/app/components/back-link";
import { EditIcon } from "@/app/components/icons";
import { resolveSystemMessage } from "@/app/components/system-message";
import { SystemMessageBanner } from "@/app/components/system-message-banner";
import { ConfirmImportBatchForm } from "@/app/imports/[id]/confirm-import-batch-form";
import { DismissDuplicateForm } from "@/app/imports/[id]/dismiss-duplicate-form";
import { formatCalendarDate } from "@/app/format-calendar-date";
import { formatMinorUnits } from "@/app/format-money";
import {
  getAccountRepository,
  getImportBatchRepository,
  getInstitutionRepository,
  getTransactionRepository
} from "@/db/repository-factory";
import { getTranslator } from "@/i18n/server";

export const dynamic = "force-dynamic";

type ImportBatchPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ message?: string }>;
};

export default async function ImportBatchPage({ params, searchParams }: ImportBatchPageProps) {
  const { id } = await params;
  const { message } = await searchParams;
  const { t } = await getTranslator();
  const systemMessage = resolveSystemMessage(message, t);
  const batch = await (await getImportBatchRepository()).getById(id);

  if (!batch) {
    notFound();
  }

  const account = await (await getAccountRepository()).getById(batch.accountId);

  if (!account) {
    notFound();
  }

  const [institution, accountTransactions] = await Promise.all([
    (await getInstitutionRepository()).getById(account.institutionId),
    (await getTransactionRepository()).listByAccountId(batch.accountId)
  ]);
  const lineItems = accountTransactions.filter((transaction) => transaction.importBatchId === batch.id);
  const unconfirmed = batch.confirmedAt === null;
  const transactionsById = new Map(accountTransactions.map((transaction) => [transaction.id, transaction]));
  const unresolvedDuplicateCount = lineItems.filter(
    (transaction) => transaction.possibleDuplicateOfTransactionId !== null
  ).length;

  return (
    <main className="pw-main">
      <article className="pw-detail">
        <BackLink href="/imports" label={t("imports.backToImports")} />
        <div className="pw-detail-header">
          <h1>{account.name}</h1>
          <p className="pw-detail-meta">
            {institution ? institution.name : t("imports.unknownInstitution")}
            <span className="pw-meta-sep">·</span>
            {account.currencyCode}
            <span className="pw-meta-sep">·</span>
            {batch.source}
          </p>
        </div>

        {systemMessage ? <SystemMessageBanner message={systemMessage} /> : null}

        <span className={`pw-trust-status pw-trust-status--${unconfirmed ? "imported" : "confirmed"}`}>
          {unconfirmed ? t("imports.unconfirmed") : t("imports.confirmed")}
        </span>

        <section className="pw-section" aria-labelledby="line-items-heading">
          <div className="pw-section-heading">
            <h2 id="line-items-heading">
              {t("imports.lineItems")}
              <span className="pw-section-count">{lineItems.length}</span>
            </h2>
          </div>
          {lineItems.length === 0 ? (
            <p className="pw-empty">{t("imports.noLineItems")}</p>
          ) : (
            <ul className="pw-list">
              {lineItems.map((transaction) => (
                <li key={transaction.id}>
                  <span className="pw-ledger-row">
                    <span className="pw-item-title">
                      {transaction.description.trim().length > 0 ? (
                        transaction.description
                      ) : (
                        <span className="pw-item-untitled">{t("ledger.noDescription")}</span>
                      )}
                      <span className="pw-item-sub">
                        {formatCalendarDate(transaction.occurredAt.slice(0, 10))}
                      </span>
                    </span>
                    <span className="pw-item-amount">
                      {formatMinorUnits(transaction.amountMinor, account.currencyCode)}
                      <span className="pw-item-tags">
                        {transaction.category ? (
                          <span className="pw-category-tag">{t(`category.${transaction.category}`)}</span>
                        ) : null}
                        {transaction.possibleDuplicateOfTransactionId !== null ? (
                          <span className="pw-duplicate-badge">{t("imports.suspectedDuplicate")}</span>
                        ) : null}
                        {unconfirmed ? (
                          <Link
                            className="pw-item-tag-edit"
                            href={`/accounts/${account.id}/transactions/${transaction.id}/edit?returnTo=${encodeURIComponent(`/imports/${batch.id}`)}`}
                            aria-label={t("ledger.editTag")}
                          >
                            <EditIcon className="pw-tag-icon" />
                          </Link>
                        ) : null}
                      </span>
                    </span>
                  </span>
                  {unconfirmed ? (
                    <div className="pw-actions pw-import-line-actions">
                      {(() => {
                        const originalId = transaction.possibleDuplicateOfTransactionId ?? null;
                        if (originalId === null) {
                          return null;
                        }
                        return (
                          <>
                            {transactionsById.has(originalId) ? (
                              <Link
                                href={`/accounts/${account.id}/transactions/${originalId}/edit?returnTo=${encodeURIComponent(`/imports/${batch.id}`)}`}
                              >
                                {t("imports.viewPossibleOriginal")}
                              </Link>
                            ) : null}
                            <DismissDuplicateForm transactionId={transaction.id} batchId={batch.id} />
                          </>
                        );
                      })()}
                      <Link
                        className="pw-danger-link"
                        href={`/accounts/${account.id}/transactions/${transaction.id}/delete?returnTo=${encodeURIComponent(`/imports/${batch.id}`)}`}
                      >
                        {t("imports.removeFromImport")}
                      </Link>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        {unconfirmed ? (
          <div className="pw-actions">
            <ConfirmImportBatchForm batchId={batch.id} unresolvedDuplicateCount={unresolvedDuplicateCount} />
            <Link className="pw-danger-link" href={`/imports/${batch.id}/delete`}>
              {t("imports.undo")}
            </Link>
          </div>
        ) : (
          <div className="pw-actions">
            {batch.reconciliationId ? (
              <Link href={`/reconciliations/${batch.reconciliationId}`}>
                {t("imports.viewReconciliation")}
              </Link>
            ) : null}
            <Link className="pw-danger-link" href={`/imports/${batch.id}/delete`}>
              {t("imports.undo")}
            </Link>
          </div>
        )}
      </article>
    </main>
  );
}
