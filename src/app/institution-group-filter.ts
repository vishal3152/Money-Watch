export type FilterableItem = {
  name: string;
  accountNumber: string | null;
  currencyCode: string;
};

export type InstitutionGroup<
  TAccount extends FilterableItem,
  TFixedDeposit extends FilterableItem,
  TShareTradingAccount extends FilterableItem
> = {
  institution: { id: string; name: string };
  accounts: TAccount[];
  fixedDeposits: TFixedDeposit[];
  shareTradingAccounts: TShareTradingAccount[];
};

function matchesSearchTerm(item: FilterableItem, lowerCaseTerm: string): boolean {
  if (lowerCaseTerm === "") {
    return true;
  }
  return (
    item.name.toLowerCase().includes(lowerCaseTerm) ||
    (item.accountNumber?.toLowerCase().includes(lowerCaseTerm) ?? false) ||
    // Exact code only: on mobile the search box stands in for the currency
    // segmented control, and a substring like "ae" must not surface every AED row.
    item.currencyCode.toLowerCase() === lowerCaseTerm
  );
}

function matchesCurrencyFilter(item: FilterableItem, currencyFilter: string): boolean {
  return currencyFilter === "All" || item.currencyCode === currencyFilter;
}

function isEmptyGroup(group: {
  accounts: readonly unknown[];
  fixedDeposits: readonly unknown[];
  shareTradingAccounts: readonly unknown[];
}): boolean {
  return (
    group.accounts.length === 0 &&
    group.fixedDeposits.length === 0 &&
    group.shareTradingAccounts.length === 0
  );
}

/** Client-side only: narrows the dashboard's institution/account/FixedDeposit/ShareTradingAccount
 * list by free-text search (name, account number, or exact currency code) and an optional
 * single-currency filter. A group is kept whenever at least one item under it still matches
 * after filtering, or when it is an empty Institution that still matches the search (so a
 * brand-new Institution remains visible); an item is kept when its own name/account
 * number/currency matches the search term, or when the Institution's own name matches
 * (search is an OR across institution-or-item, currency is always an AND). */
export function filterInstitutionGroups<
  TAccount extends FilterableItem,
  TFixedDeposit extends FilterableItem,
  TShareTradingAccount extends FilterableItem
>(
  groups: readonly InstitutionGroup<TAccount, TFixedDeposit, TShareTradingAccount>[],
  searchTerm: string,
  currencyFilter: string
): InstitutionGroup<TAccount, TFixedDeposit, TShareTradingAccount>[] {
  const lowerCaseTerm = searchTerm.trim().toLowerCase();

  return groups.flatMap((group) => {
    const institutionNameMatches =
      lowerCaseTerm === "" || group.institution.name.toLowerCase().includes(lowerCaseTerm);
    const keepItem = (item: FilterableItem) =>
      matchesCurrencyFilter(item, currencyFilter) &&
      (institutionNameMatches || matchesSearchTerm(item, lowerCaseTerm));

    const next = {
      institution: group.institution,
      accounts: group.accounts.filter(keepItem),
      fixedDeposits: group.fixedDeposits.filter(keepItem),
      shareTradingAccounts: group.shareTradingAccounts.filter(keepItem)
    };

    if (!isEmptyGroup(next)) {
      return [next];
    }

    // Empty Institutions have no currency-bearing rows, so a currency filter
    // cannot meaningfully include them; with All currencies they stay visible
    // whenever the Institution name itself matches (including the empty-search case).
    if (isEmptyGroup(group) && currencyFilter === "All" && institutionNameMatches) {
      return [next];
    }

    return [];
  });
}
