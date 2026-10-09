import Link from "next/link";
import { notFound } from "next/navigation";

import { BackLink } from "@/app/components/back-link";
import { EditIcon } from "@/app/components/icons";
import { ConfirmStockImportBatchForm } from "@/app/stock-imports/[id]/confirm-import-batch-form";
import { DismissStockDuplicateForm } from "@/app/stock-imports/[id]/dismiss-duplicate-form";
import { DISPLAY_LOCALE, formatMinorUnits } from "@/app/format-money";
import {
  getInstitutionRepository,
  getShareTradingAccountRepository,
  getStockImportBatchRepository,
  getStockTransactionRepository
} from "@/db/repository-factory";
import { getTranslator } from "@/i18n/server";

export const dynamic = "force-dynamic";

type StockImportBatchPageProps = {
  params: Promise<{ id: string }>;
};

function formatLedgerTimestamp(iso: string) {
  return new Date(iso).toLocaleString(DISPLAY_LOCALE, { dateStyle: "medium", timeStyle: "short" });
}

export default async function StockImportBatchPage({ params }: StockImportBatchPageProps) {
  const { id } = await params;
  const { t } = await getTranslator();
  const batch = await (await getStockImportBatchRepository()).getById(id);

  if (!batch) {
    notFound();
  }

  const shareTradingAccount = await (await getShareTradingAccountRepository()).getById(batch.shareTradingAccountId);

  if (!shareTradingAccount) {
    notFound();
  }

  const stockTransactionRepository = await getStockTransactionRepository();
  const [institution, lineItems, accountStockTransactions] = await Promise.all([
    (await getInstitutionRepository()).getById(shareTradingAccount.institutionId),
    stockTransactionRepository.listByImportBatchId(batch.id),
    stockTransactionRepository.listByShareTradingAccountId(shareTradingAccount.id)
  ]);
  const unconfirmed = batch.confirmedAt === null;
  const currencyCode = shareTradingAccount.currencyCode;
  const stockTransactionsById = new Map(accountStockTransactions.map((stxn) => [stxn.id, stxn]));
  const unresolvedDuplicateCount = lineItems.filter(
    (stxn) => stxn.possibleDuplicateOfTransactionId !== null
  ).length;

  return (
    <main className="pw-main">
      <article className="pw-detail">
        <BackLink href="/stock-imports" label={t("stockImports.backToStockImports")} />
        <div className="pw-detail-header">
          <h1>{shareTradingAccount.name}</h1>
          <p className="pw-detail-meta">
            {institution ? institution.name : t("imports.unknownInstitution")}
            <span className="pw-meta-sep">·</span>
            {currencyCode}
            <span className="pw-meta-sep">·</span>
            {batch.source}
          </p>
        </div>

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
              {lineItems.map((stockTransaction) => (
                <li key={stockTransaction.id}>
                  <span className="pw-ledger-row">
                    <span className="pw-item-title">
                      {t(`stockTransactionType.${stockTransaction.type}`)} {stockTransaction.scripCode}
                      <span className="pw-item-sub">
                        {t("shareTrading.detail.stockTransactionSub", {
                          quantity: stockTransaction.quantity,
                          price: formatMinorUnits(stockTransaction.pricePerUnitMinor, currencyCode),
                          when: formatLedgerTimestamp(stockTransaction.occurredAt)
                        })}
                      </span>
                      {stockTransaction.description.trim().length > 0 ? (
                        <span className="pw-item-sub">{stockTransaction.description}</span>
                      ) : null}
                    </span>
                    <span className="pw-item-amount">
                      {formatMinorUnits(stockTransaction.quantity * stockTransaction.pricePerUnitMinor, currencyCode)}
                      <span className="pw-item-tags">
                        {stockTransaction.possibleDuplicateOfTransactionId !== null ? (
                          <span className="pw-duplicate-badge">{t("imports.suspectedDuplicate")}</span>
                        ) : null}
                        {unconfirmed ? (
                          <Link
                            className="pw-item-tag-edit"
                            href={`/share-trading-accounts/${shareTradingAccount.id}/stock-transactions/${stockTransaction.id}/edit`}
                            aria-label={t("ledger.editTag")}
                          >
                            <EditIcon className="pw-tag-icon" />
                          </Link>
                        ) : null}
                      </span>
                    </span>
                  </span>
                  {unconfirmed
                    ? (() => {
                        const originalId = stockTransaction.possibleDuplicateOfTransactionId ?? null;
                        if (originalId === null) {
                          return null;
                        }
                        return (
                          <div className="pw-actions pw-import-line-actions">
                            {stockTransactionsById.has(originalId) ? (
                              <Link
                                href={`/share-trading-accounts/${shareTradingAccount.id}/stock-transactions/${originalId}/edit`}
                              >
                                {t("imports.viewPossibleOriginal")}
                              </Link>
                            ) : null}
                            <DismissStockDuplicateForm stockTransactionId={stockTransaction.id} batchId={batch.id} />
                          </div>
                        );
                      })()
                    : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        {unconfirmed ? (
          <div className="pw-actions">
            <ConfirmStockImportBatchForm batchId={batch.id} unresolvedDuplicateCount={unresolvedDuplicateCount} />
            <Link className="pw-danger-link" href={`/stock-imports/${batch.id}/delete`}>
              {t("imports.undo")}
            </Link>
          </div>
        ) : null}
      </article>
    </main>
  );
}
