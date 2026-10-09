import type { FilterableItem, InstitutionGroup } from "@/app/institution-group-filter";

type BalanceBearing = { balanceMinor: number };

function isEmptyGroup(group: {
  accounts: readonly unknown[];
  fixedDeposits: readonly unknown[];
  shareTradingAccounts: readonly unknown[];
}): boolean {
  return (
    group.accounts.length === 0 && group.fixedDeposits.length === 0 && group.shareTradingAccounts.length === 0
  );
}

/** Client-side only: drops zero-balance Accounts from each Institution group's `accounts` for the
 * Dashboard's "hide zero-balance accounts" toggle. An Institution that still has other content
 * (a non-zero Account, a FixedDeposit, a ShareTradingAccount) never disappears just because its
 * zero-balance Accounts hid; only a group that becomes entirely empty *as a result of this filter*
 * (and was not already empty) is dropped — the same "drop only if newly empty" rule
 * `filterInstitutionGroups` already applies for search/currency filtering, so an Institution with no
 * rows at all still shows its own empty-state placeholder rather than vanishing. */
export function filterZeroBalanceAccountGroups<
  TAccount extends FilterableItem & BalanceBearing,
  TFixedDeposit extends FilterableItem,
  TShareTradingAccount extends FilterableItem
>(
  groups: readonly InstitutionGroup<TAccount, TFixedDeposit, TShareTradingAccount>[],
  hideZeroBalances: boolean
): InstitutionGroup<TAccount, TFixedDeposit, TShareTradingAccount>[] {
  if (!hideZeroBalances) {
    return [...groups];
  }
  return groups.flatMap((group) => {
    const wasEmpty = isEmptyGroup(group);
    const next = { ...group, accounts: group.accounts.filter((account) => account.balanceMinor !== 0) };
    return wasEmpty || !isEmptyGroup(next) ? [next] : [];
  });
}

/** Client-side only: drops zero-balance rows from a flat Account list — the Institution detail
 * screen, which lists one Institution's Accounts directly rather than grouped. */
export function filterZeroBalanceAccounts<T extends BalanceBearing>(
  accounts: readonly T[],
  hideZeroBalances: boolean
): T[] {
  return hideZeroBalances ? accounts.filter((account) => account.balanceMinor !== 0) : [...accounts];
}
