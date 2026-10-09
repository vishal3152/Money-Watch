import { describe, expect, it } from "vitest";

import { filterZeroBalanceAccountGroups, filterZeroBalanceAccounts } from "@/app/account-balance-filter";
import type { InstitutionGroup } from "@/app/institution-group-filter";

type Account = { id: string; name: string; accountNumber: string | null; currencyCode: string; balanceMinor: number };
type FixedDeposit = { id: string; name: string; accountNumber: string | null; currencyCode: string };
type ShareTradingAccount = { id: string; name: string; accountNumber: string | null; currencyCode: string };

function group(
  overrides: Partial<InstitutionGroup<Account, FixedDeposit, ShareTradingAccount>> = {}
): InstitutionGroup<Account, FixedDeposit, ShareTradingAccount> {
  return {
    institution: { id: "inst-1", name: "Bank One" },
    accounts: [],
    fixedDeposits: [],
    shareTradingAccounts: [],
    ...overrides
  };
}

function account(id: string, balanceMinor: number): Account {
  return { id, name: id, accountNumber: null, currencyCode: "INR", balanceMinor };
}

describe("filterZeroBalanceAccountGroups", () => {
  it("returns groups unchanged when hideZeroBalances is false", () => {
    const groups = [group({ accounts: [account("a1", 0), account("a2", 500)] })];

    expect(filterZeroBalanceAccountGroups(groups, false)).toEqual(groups);
  });

  it("drops zero-balance Accounts from a group but keeps non-zero ones", () => {
    const groups = [group({ accounts: [account("a1", 0), account("a2", 500), account("a3", -200)] })];

    const result = filterZeroBalanceAccountGroups(groups, true);

    expect(result).toEqual([group({ accounts: [account("a2", 500), account("a3", -200)] })]);
  });

  it("drops the whole Institution group when hiding zero-balance Accounts leaves it with no Accounts, FixedDeposits, or ShareTradingAccounts", () => {
    const groups = [group({ accounts: [account("a1", 0)] })];

    expect(filterZeroBalanceAccountGroups(groups, true)).toEqual([]);
  });

  it("keeps a group whose Accounts all hid, as long as it still has a FixedDeposit or ShareTradingAccount", () => {
    const fixedDeposit: FixedDeposit = { id: "fd-1", name: "FD", accountNumber: null, currencyCode: "INR" };
    const groups = [group({ accounts: [account("a1", 0)], fixedDeposits: [fixedDeposit] })];

    expect(filterZeroBalanceAccountGroups(groups, true)).toEqual([
      group({ accounts: [], fixedDeposits: [fixedDeposit] })
    ]);
  });

  it("keeps an already-empty Institution group (no Accounts/FixedDeposits/ShareTradingAccounts to begin with) so its placeholder still renders", () => {
    const groups = [group()];

    expect(filterZeroBalanceAccountGroups(groups, true)).toEqual(groups);
  });
});

describe("filterZeroBalanceAccounts", () => {
  it("returns the list unchanged when hideZeroBalances is false", () => {
    const accounts = [account("a1", 0), account("a2", 500)];

    expect(filterZeroBalanceAccounts(accounts, false)).toEqual(accounts);
  });

  it("drops zero-balance rows and preserves the order of the rest", () => {
    const accounts = [account("a1", 500), account("a2", 0), account("a3", -100)];

    expect(filterZeroBalanceAccounts(accounts, true)).toEqual([account("a1", 500), account("a3", -100)]);
  });

  it("returns an empty list when every Account is zero-balance", () => {
    expect(filterZeroBalanceAccounts([account("a1", 0), account("a2", 0)], true)).toEqual([]);
  });
});
