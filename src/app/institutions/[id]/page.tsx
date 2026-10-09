import Link from "next/link";
import { notFound } from "next/navigation";

import { AccountListSection } from "@/app/components/account-list-section";
import { BackLink } from "@/app/components/back-link";
import { CollapsibleSectionList } from "@/app/components/collapsible-section-list";
import { DeleteIcon, EditIcon } from "@/app/components/icons";
import { InstitutionAddMenu } from "@/app/components/institution-add-menu";
import { resolveSystemMessage } from "@/app/components/system-message";
import { SystemMessageBanner } from "@/app/components/system-message-banner";
import { formatFixedDepositSubtitle } from "@/app/format-fixed-deposit";
import { formatMinorUnits } from "@/app/format-money";
import { getTranslator } from "@/i18n/server";
import { computeHoldings } from "@/domain/holdings";
import type { StockTransaction } from "@/domain/stock-transaction";
import {
  getAccountRepository,
  getFixedDepositRepository,
  getInstitutionRepository,
  getShareTradingAccountRepository,
  getStockTransactionRepository,
  getTransactionRepository
} from "@/db/repository-factory";

export const dynamic = "force-dynamic";

type InstitutionDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ message?: string }>;
};

export default async function InstitutionDetailPage({ params, searchParams }: InstitutionDetailPageProps) {
  const { id } = await params;
  const { message } = await searchParams;
  const { t, plural } = await getTranslator();
  const systemMessage = resolveSystemMessage(message, t);
  const [
    institution,
    institutionAccounts,
    institutionFixedDeposits,
    institutionShareTradingAccounts,
    transactionRepository,
    stockTransactionRepository
  ] = await Promise.all([
    getInstitutionRepository().then((repo) => repo.getById(id)),
    getAccountRepository().then((repo) => repo.listByInstitutionId(id)),
    getFixedDepositRepository().then((repo) => repo.listByInstitutionId(id)),
    getShareTradingAccountRepository().then((repo) => repo.listByInstitutionId(id)),
    getTransactionRepository(),
    getStockTransactionRepository()
  ]);

  if (!institution) {
    notFound();
  }

  const [balanceTotals, stockTransactions] = await Promise.all([
    transactionRepository.sumAmountsByAccountIds(institutionAccounts.map((account) => account.id)),
    stockTransactionRepository.listByShareTradingAccountIds(
      institutionShareTradingAccounts.map((shareTradingAccount) => shareTradingAccount.id)
    )
  ]);
  const accountBalances = new Map(
    balanceTotals.map((total) => [total.accountId, total.balanceMinor] as const)
  );
  const stockTransactionsByShareTradingAccount = stockTransactions.reduce((grouped, stockTransaction) => {
    const existing = grouped.get(stockTransaction.shareTradingAccountId);
    if (existing) {
      existing.push(stockTransaction);
    } else {
      grouped.set(stockTransaction.shareTradingAccountId, [stockTransaction]);
    }
    return grouped;
  }, new Map<string, StockTransaction[]>());

  return (
    <main className="pw-main">
      <article className="pw-detail">
        <BackLink href="/" label={t("common.backToDashboard")} />

        <header className="pw-detail-header">
          <div className="pw-detail-heading-row">
            <h1>{institution.name}</h1>
            <div className="pw-detail-heading-actions">
              <InstitutionAddMenu institutionId={id} />
              <Link
                className="pw-menu"
                href={`/institutions/${id}/edit`}
                aria-label={t("institutions.detail.edit")}
              >
                <EditIcon className="pw-detail-icon" />
              </Link>
              <Link
                className="pw-menu pw-menu-danger"
                href={`/institutions/${id}/delete`}
                aria-label={t("institutions.detail.delete")}
              >
                <DeleteIcon className="pw-detail-icon" />
              </Link>
            </div>
          </div>
          <p className="pw-detail-lede">{t("institutions.detail.lede")}</p>
        </header>

        {systemMessage ? <SystemMessageBanner message={systemMessage} /> : null}

        <section className="pw-section" aria-labelledby="accounts-heading">
          <AccountListSection
            headingId="accounts-heading"
            accounts={institutionAccounts.map((account) => ({
              id: account.id,
              name: account.name,
              accountNumber: account.accountNumber,
              currencyCode: account.currencyCode,
              balanceMinor: accountBalances.get(account.id) ?? 0
            }))}
          />
        </section>

        <section className="pw-section" aria-labelledby="fixed-deposits-heading">
          {institutionFixedDeposits.length === 0 ? (
            <>
              <h2 id="fixed-deposits-heading">{t("institutions.detail.fixedDeposits")}</h2>
              <p className="pw-empty">{t("institutions.detail.noFixedDeposits")}</p>
            </>
          ) : (
            <CollapsibleSectionList
              headingId="fixed-deposits-heading"
              heading={
                <>
                  {t("institutions.detail.fixedDeposits")}
                  <span className="pw-section-count">{institutionFixedDeposits.length}</span>
                </>
              }
              toggleLabel={t("institutions.detail.fixedDeposits")}
            >
              {institutionFixedDeposits.map((fixedDeposit) => (
                <li key={fixedDeposit.id}>
                  <Link href={`/fixed-deposits/${fixedDeposit.id}`}>
                    <span className="pw-item-title">
                      {fixedDeposit.name}
                      <span className="pw-item-sub">
                        {formatFixedDepositSubtitle(fixedDeposit, t)}
                      </span>
                    </span>
                    <span className="pw-item-amount">
                      {formatMinorUnits(
                        fixedDeposit.principalMinor,
                        fixedDeposit.currencyCode
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </CollapsibleSectionList>
          )}
        </section>

        <section className="pw-section" aria-labelledby="share-trading-accounts-heading">
          {institutionShareTradingAccounts.length === 0 ? (
            <>
              <h2 id="share-trading-accounts-heading">{t("institutions.detail.shareTradingAccounts")}</h2>
              <p className="pw-empty">{t("institutions.detail.noShareTradingAccounts")}</p>
            </>
          ) : (
            <CollapsibleSectionList
              headingId="share-trading-accounts-heading"
              heading={
                <>
                  {t("institutions.detail.shareTradingAccounts")}
                  <span className="pw-section-count">{institutionShareTradingAccounts.length}</span>
                </>
              }
              toggleLabel={t("institutions.detail.shareTradingAccounts")}
            >
              {institutionShareTradingAccounts.map((shareTradingAccount) => {
                const holdings = computeHoldings(
                  stockTransactionsByShareTradingAccount.get(shareTradingAccount.id) ?? []
                );
                return (
                  <li key={shareTradingAccount.id}>
                    <Link href={`/share-trading-accounts/${shareTradingAccount.id}`}>
                      <span className="pw-item-title">
                        {shareTradingAccount.name}
                        <span className="pw-item-sub">
                          {shareTradingAccount.accountNumber
                            ? `${shareTradingAccount.accountNumber} · `
                            : ""}
                          {shareTradingAccount.currencyCode}
                        </span>
                      </span>
                      <span className="pw-item-amount">
                        {plural("count.holdings", holdings.length)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </CollapsibleSectionList>
          )}
        </section>

      </article>
    </main>
  );
}
