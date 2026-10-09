"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { filterZeroBalanceAccountGroups } from "@/app/account-balance-filter";
import { CollapsibleSectionList } from "@/app/components/collapsible-section-list";
import { SegmentedControl } from "@/app/components/segmented-control";
import { formatFixedDepositSubtitle } from "@/app/format-fixed-deposit";
import { formatMinorUnits } from "@/app/format-money";
import { filterInstitutionGroups, type InstitutionGroup } from "@/app/institution-group-filter";
import type { FixedDepositStatus } from "@/domain/fixed-deposit";
import type { Holding } from "@/domain/holdings";
import { useTranslator } from "@/i18n/client";

export type AccountListItem = {
  id: string;
  name: string;
  accountNumber: string | null;
  currencyCode: string;
  balanceMinor: number;
  openDiscrepancies: number;
};

export type FixedDepositListItem = {
  id: string;
  name: string;
  accountNumber: string | null;
  currencyCode: string;
  principalMinor: number;
  interestRateBps: number;
  maturityDate: string;
  status: FixedDepositStatus;
};

export type ShareTradingAccountListItem = {
  id: string;
  name: string;
  accountNumber: string | null;
  currencyCode: string;
  holdings: Holding[];
};

type Group = InstitutionGroup<AccountListItem, FixedDepositListItem, ShareTradingAccountListItem>;

export function InstitutionsBrowser({
  groups,
  currencyCodes
}: {
  groups: Group[];
  currencyCodes: string[];
}) {
  const { t, plural } = useTranslator();
  const [searchTerm, setSearchTerm] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("All");
  const [hideZeroBalances, setHideZeroBalances] = useState(true);
  // While actively filtering, a matching Account/FixedDeposit/ShareTradingAccount inside a
  // collapsed Institution would otherwise stay hidden behind an extra tap — search results
  // should just be visible. Zero-balance hiding is a standing default, not an active search, so
  // it deliberately does not force sections open the way search/currency do.
  const isFiltering = searchTerm.trim() !== "" || currencyFilter !== "All";
  const hasZeroBalanceAccount = groups.some((group) =>
    group.accounts.some((account) => account.balanceMinor === 0)
  );

  const filteredGroups = useMemo(
    () => filterInstitutionGroups(groups, searchTerm, currencyFilter),
    [groups, searchTerm, currencyFilter]
  );

  const visibleGroups = useMemo(
    () => filterZeroBalanceAccountGroups(filteredGroups, hideZeroBalances),
    [filteredGroups, hideZeroBalances]
  );

  // "First Institution starts open" means the first group that has rows to
  // collapse — an empty Institution at index 0 has no CollapsibleSectionList,
  // so the next populated one should own the default-open slot.
  const firstPopulatedIndex = visibleGroups.findIndex(
    (group) =>
      group.accounts.length > 0 ||
      group.fixedDeposits.length > 0 ||
      group.shareTradingAccounts.length > 0
  );

  // Derived from the same visibleGroups as the Institution list below, so the
  // currency/search/zero-balance filters narrow these cross-institution digests too — a
  // FixedDeposit or ShareTradingAccount hidden above (wrong currency, no
  // match) does not still surface here.
  const upcomingFixedDeposits = visibleGroups
    .flatMap((group) =>
      group.fixedDeposits
        .filter((fixedDeposit) => fixedDeposit.status === "Open")
        .map((fixedDeposit) => ({ fixedDeposit, institutionName: group.institution.name }))
    )
    .sort((a, b) => a.fixedDeposit.maturityDate.localeCompare(b.fixedDeposit.maturityDate));

  const portfolioEntries = visibleGroups.flatMap((group) =>
    group.shareTradingAccounts.map((shareTradingAccount) => ({
      shareTradingAccount,
      institutionName: group.institution.name
    }))
  );

  return (
    <>
      <div className="pw-institutions-filter">
        <input
          type="search"
          className="pw-institutions-search"
          placeholder={t("browser.filterPlaceholder")}
          aria-label={t("browser.filterPlaceholder")}
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
        {currencyCodes.length > 1 ? (
          <SegmentedControl
            value={currencyFilter}
            onChange={setCurrencyFilter}
            aria-label={t("browser.filterByCurrency")}
            options={[
              { value: "All", label: t("browser.allCurrencies") },
              ...currencyCodes.map((code) => ({ value: code, label: code }))
            ]}
          />
        ) : null}
        {hasZeroBalanceAccount ? (
          <label className="pw-inline-toggle">
            <input
              type="checkbox"
              className="pw-toggle-input"
              checked={hideZeroBalances}
              onChange={(event) => setHideZeroBalances(event.target.checked)}
            />
            <span className="pw-toggle-track" aria-hidden="true">
              <span className="pw-toggle-thumb" />
            </span>
            {t("accounts.hideZeroBalances")}
          </label>
        ) : null}
      </div>

      {visibleGroups.length === 0 ? (
        <p className="pw-empty">
          {filteredGroups.length > 0 ? t("accounts.allZeroBalanceHidden") : t("browser.noMatches")}
        </p>
      ) : (
        visibleGroups.map(({ institution, accounts, fixedDeposits, shareTradingAccounts }, index) => (
          <section
            className={
              index % 2 === 1
                ? "pw-section pw-institution-section pw-institution-section--alt"
                : "pw-section pw-institution-section"
            }
            key={institution.id}
            aria-labelledby={`institution-${institution.id}`}
          >
            {accounts.length === 0 && fixedDeposits.length === 0 && shareTradingAccounts.length === 0 ? (
              <>
                <h2 id={`institution-${institution.id}`}>
                  <Link href={`/institutions/${institution.id}`}>{institution.name}</Link>
                </h2>
                <p className="pw-empty">{t("browser.emptyInstitution")}</p>
              </>
            ) : (
              <CollapsibleSectionList
                // Remounts (fresh `defaultExpanded`) right at the transition into/out of
                // filtering, so a group that was collapsed before typing began still opens
                // to show a match; clearing the filter restores the default (first open,
                // rest collapsed).
                key={isFiltering ? `${institution.id}-filtered` : institution.id}
                headingId={`institution-${institution.id}`}
                heading={<Link href={`/institutions/${institution.id}`}>{institution.name}</Link>}
                toggleLabel={institution.name}
                defaultExpanded={isFiltering || index === firstPopulatedIndex}
              >
                {accounts.map((account) => (
                  <li key={account.id}>
                    <Link href={`/accounts/${account.id}`}>
                      <span className="pw-item-title">
                        {account.name}
                        <span className="pw-item-sub">
                          {account.accountNumber ? `${account.accountNumber} · ` : ""}
                          {account.currencyCode}
                        </span>
                        {account.openDiscrepancies > 0 ? (
                          <span className="pw-badge">
                            {plural("count.openDiscrepancies", account.openDiscrepancies)}
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={
                          account.balanceMinor < 0
                            ? "pw-item-amount pw-item-amount--negative"
                            : "pw-item-amount"
                        }
                      >
                        {formatMinorUnits(account.balanceMinor, account.currencyCode)}
                      </span>
                    </Link>
                  </li>
                ))}
                {fixedDeposits.map((fixedDeposit) => (
                  <li key={fixedDeposit.id}>
                    <Link href={`/fixed-deposits/${fixedDeposit.id}`}>
                      <span className="pw-item-title">
                        {fixedDeposit.name}
                        <span className="pw-item-sub">
                          {fixedDeposit.accountNumber ? `${fixedDeposit.accountNumber} · ` : ""}
                          {formatFixedDepositSubtitle(fixedDeposit, t)}
                        </span>
                      </span>
                      <span className="pw-item-amount">
                        {formatMinorUnits(fixedDeposit.principalMinor, fixedDeposit.currencyCode)}
                      </span>
                    </Link>
                  </li>
                ))}
                {shareTradingAccounts.map((shareTradingAccount) => (
                  <li key={shareTradingAccount.id}>
                    <Link href={`/share-trading-accounts/${shareTradingAccount.id}`}>
                      <span className="pw-item-title">
                        {shareTradingAccount.name}
                        <span className="pw-item-sub">
                          {shareTradingAccount.accountNumber ? `${shareTradingAccount.accountNumber} · ` : ""}
                          {shareTradingAccount.currencyCode}
                        </span>
                      </span>
                      <span className="pw-item-amount">
                        {plural("count.holdings", shareTradingAccount.holdings.length)}
                      </span>
                    </Link>
                  </li>
                ))}
              </CollapsibleSectionList>
            )}
          </section>
        ))
      )}

      {upcomingFixedDeposits.length > 0 ? (
        <section className="pw-section" aria-labelledby="fd-maturity-heading">
          <CollapsibleSectionList
            headingId="fd-maturity-heading"
            heading={
              <>
                {t("dashboard.fixedDepositMaturity.heading")}
                <span className="pw-section-count">{upcomingFixedDeposits.length}</span>
              </>
            }
            toggleLabel={t("dashboard.fixedDepositMaturity.heading")}
          >
            {upcomingFixedDeposits.map(({ fixedDeposit, institutionName }) => (
              <li key={fixedDeposit.id}>
                <Link href={`/fixed-deposits/${fixedDeposit.id}`}>
                  <span className="pw-item-title">
                    {fixedDeposit.name}
                    <span className="pw-item-sub">
                      {institutionName} ·{" "}
                      {fixedDeposit.accountNumber ? `${fixedDeposit.accountNumber} · ` : ""}
                      {(fixedDeposit.interestRateBps / 100).toFixed(2)}% ·{" "}
                      {t("dashboard.fixedDepositMaturity.matures", {
                        date: fixedDeposit.maturityDate
                      })}
                    </span>
                  </span>
                  <span className="pw-item-amount">
                    {formatMinorUnits(fixedDeposit.principalMinor, fixedDeposit.currencyCode)}
                  </span>
                </Link>
              </li>
            ))}
          </CollapsibleSectionList>
        </section>
      ) : null}

      {portfolioEntries.length > 0 ? (
        <section className="pw-section" aria-labelledby="portfolio-heading">
          <CollapsibleSectionList
            headingId="portfolio-heading"
            heading={
              <>
                {t("dashboard.portfolio.heading")}
                <span className="pw-section-count">{portfolioEntries.length}</span>
              </>
            }
            toggleLabel={t("dashboard.portfolio.heading")}
          >
            {portfolioEntries.map(({ shareTradingAccount, institutionName }) => (
              <li key={shareTradingAccount.id}>
                <Link href={`/share-trading-accounts/${shareTradingAccount.id}`}>
                  <span className="pw-item-title">
                    {shareTradingAccount.name}
                    <span className="pw-item-sub">
                      {institutionName} ·{" "}
                      {shareTradingAccount.accountNumber ? `${shareTradingAccount.accountNumber} · ` : ""}
                      {shareTradingAccount.currencyCode}
                    </span>
                  </span>
                  <span className="pw-item-amount">
                    {plural("count.holdings", shareTradingAccount.holdings.length)}
                  </span>
                </Link>
              </li>
            ))}
          </CollapsibleSectionList>
        </section>
      ) : null}
    </>
  );
}
