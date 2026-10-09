import Link from "next/link";

import { DashboardAddMenu } from "@/app/components/dashboard-add-menu";
import { InstitutionsBrowser } from "@/app/components/institutions-browser";
import { resolveSystemMessage } from "@/app/components/system-message";
import { SystemMessageBanner } from "@/app/components/system-message-banner";
import { computeCurrencyTotals, type CurrencyTotalEntry } from "@/domain/currency-totals";
import { minorUnitsToDecimalString } from "@/app/format-money";
import { getTranslator } from "@/i18n/server";
import { computeHoldings } from "@/domain/holdings";
import type { StockTransaction } from "@/domain/stock-transaction";
import {
  getAccountRepository,
  getFixedDepositRepository,
  getInstitutionRepository,
  getReconciliationRepository,
  getShareTradingAccountRepository,
  getStockTransactionRepository,
  getTransactionRepository
} from "@/db/repository-factory";

export const dynamic = "force-dynamic";

type HomePageProps = {
  searchParams: Promise<{ message?: string }>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const { message } = await searchParams;
  const { t, plural } = await getTranslator();
  const systemMessage = resolveSystemMessage(message, t);
  const [
    institutions,
    accounts,
    fixedDeposits,
    shareTradingAccounts,
    transactionRepository,
    reconciliationRepository,
    stockTransactionRepository
  ] = await Promise.all([
    getInstitutionRepository().then((repo) => repo.listAll()),
    getAccountRepository().then((repo) => repo.listAll()),
    getFixedDepositRepository().then((repo) => repo.listAll()),
    getShareTradingAccountRepository().then((repo) => repo.listAll()),
    getTransactionRepository(),
    getReconciliationRepository(),
    getStockTransactionRepository()
  ]);
  const accountIds = accounts.map((account) => account.id);
  // One batched round trip each: the Accounts' balances, their open Discrepancy
  // counts, and every listed ShareTradingAccount's StockTransactions. Against a
  // remote database the page's cost is round trips, not rows, so nothing here
  // may run per Account.
  const [balanceTotals, openDiscrepancyCounts, stockTransactions] = await Promise.all([
    transactionRepository.sumAmountsByAccountIds(accountIds),
    reconciliationRepository.countOpenDiscrepanciesByAccountIds(accountIds),
    stockTransactionRepository.listByShareTradingAccountIds(
      shareTradingAccounts.map((shareTradingAccount) => shareTradingAccount.id)
    )
  ]);
  const balanceByAccountId = new Map(
    balanceTotals.map((total) => [total.accountId, total.balanceMinor] as const)
  );
  const openDiscrepancyCountByAccountId = new Map(
    openDiscrepancyCounts.map((entry) => [entry.accountId, entry.openDiscrepancies] as const)
  );
  const accountSummaries = new Map(
    accounts.map((account) => [
      account.id,
      {
        balance: balanceByAccountId.get(account.id) ?? 0,
        openDiscrepancies: openDiscrepancyCountByAccountId.get(account.id) ?? 0
      }
    ])
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

  const currencyTotalEntries: CurrencyTotalEntry[] = [
    ...accounts.map((account) => ({
      currencyCode: account.currencyCode,
      amountMinor: accountSummaries.get(account.id)!.balance,
      kind: "account" as const
    })),
    ...fixedDeposits.map((fixedDeposit) => ({
      currencyCode: fixedDeposit.currencyCode,
      amountMinor: fixedDeposit.principalMinor,
      kind: "fixedDeposit" as const
    }))
  ];
  const currencyTotals = computeCurrencyTotals(currencyTotalEntries);

  const institutionGroups = institutions.map((institution) => ({
    institution: { id: institution.id, name: institution.name },
    accounts: accounts
      .filter((account) => account.institutionId === institution.id)
      .map((account) => ({
        id: account.id,
        name: account.name,
        accountNumber: account.accountNumber,
        currencyCode: account.currencyCode,
        balanceMinor: accountSummaries.get(account.id)!.balance,
        openDiscrepancies: accountSummaries.get(account.id)!.openDiscrepancies
      })),
    fixedDeposits: fixedDeposits
      .filter((fixedDeposit) => fixedDeposit.institutionId === institution.id)
      .map((fixedDeposit) => ({
        id: fixedDeposit.id,
        name: fixedDeposit.name,
        accountNumber: fixedDeposit.accountNumber,
        currencyCode: fixedDeposit.currencyCode,
        principalMinor: fixedDeposit.principalMinor,
        interestRateBps: fixedDeposit.interestRateBps,
        maturityDate: fixedDeposit.maturityDate,
        status: fixedDeposit.status
      })),
    shareTradingAccounts: shareTradingAccounts
      .filter((shareTradingAccount) => shareTradingAccount.institutionId === institution.id)
      .map((shareTradingAccount) => ({
        id: shareTradingAccount.id,
        name: shareTradingAccount.name,
        accountNumber: shareTradingAccount.accountNumber,
        currencyCode: shareTradingAccount.currencyCode,
        holdings: computeHoldings(stockTransactionsByShareTradingAccount.get(shareTradingAccount.id) ?? [])
      }))
  }));

  return (
    <main className="pw-main">
      <section className="pw-dashboard">
        <header className="pw-detail-header">
          <div className="pw-detail-heading-row">
            <h1>{t("dashboard.heading")}</h1>
            <div className="pw-detail-heading-actions">
              <DashboardAddMenu />
            </div>
          </div>
          <p className="pw-detail-lede">{t("dashboard.lede")}</p>
        </header>
        {systemMessage ? <SystemMessageBanner message={systemMessage} /> : null}

        {currencyTotals.length > 0 ? (
          <section className="pw-section pw-currency-totals" aria-labelledby="currency-totals-heading">
            <h2 id="currency-totals-heading">{t("dashboard.currencyTotals.heading")}</h2>
            <p className="pw-detail-lede">{t("dashboard.currencyTotals.note")}</p>
            <ul className="pw-currency-total-grid">
              {currencyTotals.map((total) => (
                <li
                  key={total.currencyCode}
                  className={
                    total.totalMinor < 0
                      ? "pw-currency-total-card pw-currency-total-card--negative"
                      : "pw-currency-total-card"
                  }
                >
                  <span className="pw-currency-total-topline">
                    <span className="pw-currency-total-code">{total.currencyCode}</span>
                    <span className="pw-currency-total-meta">
                      {plural("count.accounts", total.accountCount)}
                      {total.fixedDepositCount > 0
                        ? ` · ${plural("count.fixedDepositsShort", total.fixedDepositCount)}`
                        : ""}
                    </span>
                  </span>
                  <span
                    className={
                      total.totalMinor < 0
                        ? "pw-currency-total-value pw-currency-total-value--negative"
                        : "pw-currency-total-value"
                    }
                  >
                    {minorUnitsToDecimalString(total.totalMinor, total.currencyCode)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {institutions.length === 0 ? (
          <p className="pw-empty">{t("dashboard.noInstitutions")}</p>
        ) : (
          <InstitutionsBrowser
            groups={institutionGroups}
            currencyCodes={currencyTotals.map((total) => total.currencyCode)}
          />
        )}

        {institutions.length > 0 ? (
          <>
            <p className="pw-detail-lede pw-section-note">{t("dashboard.transferNote")}</p>
            <div className="pw-actions pw-sticky-actions">
              <Link className="pw-action-primary" href="/transfers/new">
                {t("dashboard.addTransfer")}
              </Link>
            </div>
          </>
        ) : (
          <div className="pw-actions pw-sticky-actions">
            <Link className="pw-action-primary" href="/institutions/new">
              {t("dashboard.addInstitution")}
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
