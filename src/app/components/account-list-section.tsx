"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { filterZeroBalanceAccounts } from "@/app/account-balance-filter";
import { CollapsibleSectionList } from "@/app/components/collapsible-section-list";
import { formatMinorUnits } from "@/app/format-money";
import { useTranslator } from "@/i18n/client";

export type AccountListSectionRow = {
  id: string;
  name: string;
  accountNumber: string | null;
  currencyCode: string;
  balanceMinor: number;
};

/** The Institution detail screen's Accounts section, with a "hide zero-balance accounts" toggle
 * (defaults to hidden). Pulled out of the (Server Component) page so the toggle can hold client
 * state — the FixedDeposits/ShareTradingAccounts sections on that page stay server-rendered. */
export function AccountListSection({
  headingId,
  accounts
}: {
  headingId: string;
  accounts: AccountListSectionRow[];
}) {
  const { t } = useTranslator();
  const [hideZeroBalances, setHideZeroBalances] = useState(true);
  const hasZeroBalanceAccount = accounts.some((account) => account.balanceMinor === 0);
  const visibleAccounts = useMemo(
    () => filterZeroBalanceAccounts(accounts, hideZeroBalances),
    [accounts, hideZeroBalances]
  );

  if (accounts.length === 0) {
    return (
      <>
        <h2 id={headingId}>{t("institutions.detail.accounts")}</h2>
        <p className="pw-empty">{t("institutions.detail.noAccounts")}</p>
      </>
    );
  }

  return (
    <>
      {hasZeroBalanceAccount ? (
        <div className="pw-institutions-filter">
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
        </div>
      ) : null}
      {visibleAccounts.length === 0 ? (
        <>
          <h2 id={headingId}>{t("institutions.detail.accounts")}</h2>
          <p className="pw-empty">{t("accounts.allZeroBalanceHidden")}</p>
        </>
      ) : (
        <CollapsibleSectionList
          headingId={headingId}
          heading={
            <>
              {t("institutions.detail.accounts")}
              <span className="pw-section-count">{visibleAccounts.length}</span>
            </>
          }
          toggleLabel={t("institutions.detail.accounts")}
        >
          {visibleAccounts.map((account) => (
            <li key={account.id}>
              <Link href={`/accounts/${account.id}`}>
                <span className="pw-item-title">
                  {account.name}
                  <span className="pw-item-sub">
                    {account.accountNumber ? `${account.accountNumber} · ` : ""}
                    {account.currencyCode}
                  </span>
                </span>
                <span
                  className={
                    account.balanceMinor < 0 ? "pw-item-amount pw-item-amount--negative" : "pw-item-amount"
                  }
                >
                  {formatMinorUnits(account.balanceMinor, account.currencyCode)}
                </span>
              </Link>
            </li>
          ))}
        </CollapsibleSectionList>
      )}
    </>
  );
}
