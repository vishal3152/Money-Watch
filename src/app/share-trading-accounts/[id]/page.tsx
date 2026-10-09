import Link from "next/link";
import { notFound } from "next/navigation";

import { BackLink } from "@/app/components/back-link";
import { CollapsibleSectionList } from "@/app/components/collapsible-section-list";
import { DeleteIcon, EditIcon } from "@/app/components/icons";
import { resolveSystemMessage } from "@/app/components/system-message";
import { SystemMessageBanner } from "@/app/components/system-message-banner";
import { DISPLAY_LOCALE, formatMinorUnits } from "@/app/format-money";
import {
  getInstitutionRepository,
  getShareTradingAccountRepository,
  getStockTransactionRepository
} from "@/db/repository-factory";
import { computeHoldings } from "@/domain/holdings";
import { getTranslator } from "@/i18n/server";

export const dynamic = "force-dynamic";

type ShareTradingAccountDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ message?: string }>;
};

function formatLedgerTimestamp(iso: string) {
  return new Date(iso).toLocaleString(DISPLAY_LOCALE, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

export default async function ShareTradingAccountDetailPage({
  params,
  searchParams
}: ShareTradingAccountDetailPageProps) {
  const { id } = await params;
  const { message } = await searchParams;
  const { t, plural } = await getTranslator();
  const systemMessage = resolveSystemMessage(message, t);
  const shareTradingAccount = await (await getShareTradingAccountRepository()).getById(id);

  if (!shareTradingAccount) {
    notFound();
  }

  const [institution, stockTransactions] = await Promise.all([
    (await getInstitutionRepository()).getById(shareTradingAccount.institutionId),
    (await getStockTransactionRepository()).listByShareTradingAccountId(id)
  ]);
  const holdings = computeHoldings(stockTransactions);
  const currencyCode = shareTradingAccount.currencyCode;

  return (
    <main className="pw-main">
      <article className="pw-detail">
        <BackLink
          href={`/institutions/${shareTradingAccount.institutionId}`}
          label={
            institution
              ? t("common.backTo", { name: institution.name })
              : t("accounts.detail.backToInstitution")
          }
        />

        <header className="pw-detail-header">
          <div className="pw-detail-heading-row">
            <h1>{shareTradingAccount.name}</h1>
            <div className="pw-detail-heading-actions">
              <Link
                className="pw-menu"
                href={`/share-trading-accounts/${id}/edit`}
                aria-label={t("shareTrading.detail.edit")}
              >
                <EditIcon className="pw-detail-icon" />
              </Link>
              <Link
                className="pw-menu pw-menu-danger"
                href={`/share-trading-accounts/${id}/delete`}
                aria-label={t("shareTrading.detail.delete")}
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
            {shareTradingAccount.accountNumber ? (
              <>
                {shareTradingAccount.accountNumber}
                <span className="pw-meta-sep" aria-hidden="true">
                  ·
                </span>
              </>
            ) : null}
            {currencyCode}
          </p>
        </header>

        {systemMessage ? <SystemMessageBanner message={systemMessage} /> : null}

        {stockTransactions.length === 0 ? (
          <section className="pw-section">
            <p className="pw-empty">{t("shareTrading.detail.noStockTransactions")}</p>
          </section>
        ) : (
          <>
            <section className="pw-section" aria-labelledby="holdings-heading">
              <CollapsibleSectionList
                headingId="holdings-heading"
                heading={
                  <>
                    {t("shareTrading.detail.holdings")}
                    <span className="pw-section-count">{holdings.length}</span>
                  </>
                }
                toggleLabel={t("shareTrading.detail.holdings")}
              >
                {holdings.map((holding) => (
                  <li key={holding.scripCode}>
                    <span>
                      <span className="pw-item-title">{holding.scripCode}</span>
                      <span className="pw-item-amount">
                        {plural("count.shares", holding.quantity)}
                      </span>
                    </span>
                  </li>
                ))}
              </CollapsibleSectionList>
            </section>

            <section className="pw-section" aria-labelledby="stock-transactions-heading">
              <CollapsibleSectionList
                headingId="stock-transactions-heading"
                heading={
                  <>
                    {t("shareTrading.detail.transactions")}
                    <span className="pw-section-count">{stockTransactions.length}</span>
                  </>
                }
                toggleLabel={t("shareTrading.detail.transactions")}
              >
                {stockTransactions.map((stockTransaction) => (
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
                        {formatMinorUnits(
                          stockTransaction.quantity * stockTransaction.pricePerUnitMinor,
                          currencyCode
                        )}
                        <span className="pw-item-tags">
                          <Link
                            className="pw-item-tag-edit"
                            href={`/share-trading-accounts/${id}/stock-transactions/${stockTransaction.id}/edit`}
                            aria-label={t("ledger.editTag")}
                          >
                            <EditIcon className="pw-tag-icon" />
                          </Link>
                        </span>
                      </span>
                    </span>
                  </li>
                ))}
              </CollapsibleSectionList>
            </section>
          </>
        )}

        <div className="pw-actions pw-sticky-actions">
          <Link className="pw-action-primary" href={`/share-trading-accounts/${id}/stock-transactions/new`}>
            {t("shareTrading.detail.addStockTransaction")}
          </Link>
        </div>
      </article>
    </main>
  );
}
