import { describe, expect, it } from "vitest";

import { filterInstitutionGroups, type InstitutionGroup } from "@/app/institution-group-filter";

type Item = { name: string; accountNumber: string | null; currencyCode: string };

function group(overrides: Partial<InstitutionGroup<Item, Item, Item>> = {}): InstitutionGroup<Item, Item, Item> {
  return {
    institution: { id: "inst-1", name: "RBL Bank" },
    accounts: [{ name: "NRO Savings", accountNumber: "XXXX4471", currencyCode: "INR" }],
    fixedDeposits: [{ name: "NRE Term 2027", accountNumber: "FD-771", currencyCode: "INR" }],
    shareTradingAccounts: [],
    ...overrides
  };
}

describe("filterInstitutionGroups", () => {
  it("returns every group unchanged when search is empty and currency filter is All", () => {
    const groups = [group()];
    expect(filterInstitutionGroups(groups, "", "All")).toEqual(groups);
  });

  it("keeps an item whose name matches the search term, case-insensitively", () => {
    const groups = [group()];
    const result = filterInstitutionGroups(groups, "nro", "All");
    expect(result).toHaveLength(1);
    expect(result[0].accounts).toHaveLength(1);
    expect(result[0].fixedDeposits).toHaveLength(0);
  });

  it("keeps an item whose account number matches the search term", () => {
    const groups = [group()];
    const result = filterInstitutionGroups(groups, "4471", "All");
    expect(result[0].accounts).toHaveLength(1);
    expect(result[0].fixedDeposits).toHaveLength(0);
  });

  it("keeps an item whose currency code exactly matches the search term", () => {
    const groups = [
      group({
        accounts: [
          { name: "NRO Savings", accountNumber: "XXXX4471", currencyCode: "INR" },
          { name: "Current", accountNumber: "XXXX9032", currencyCode: "AED" }
        ],
        fixedDeposits: []
      })
    ];
    const result = filterInstitutionGroups(groups, "aed", "All");
    expect(result[0].accounts).toEqual([
      { name: "Current", accountNumber: "XXXX9032", currencyCode: "AED" }
    ]);
  });

  it("does not treat a partial currency-code substring as a match", () => {
    const groups = [
      group({
        accounts: [
          { name: "NRO Savings", accountNumber: "XXXX4471", currencyCode: "INR" },
          { name: "Current", accountNumber: "XXXX9032", currencyCode: "AED" }
        ],
        fixedDeposits: []
      })
    ];
    // "ae" must not keep the AED account via currency alone (mobile search stands in
    // for the hidden segmented control — only a full code is intentional).
    expect(filterInstitutionGroups(groups, "ae", "All")).toEqual([]);
  });

  it("keeps every item under an institution whose own name matches the search term", () => {
    const groups = [group()];
    const result = filterInstitutionGroups(groups, "rbl", "All");
    expect(result[0].accounts).toHaveLength(1);
    expect(result[0].fixedDeposits).toHaveLength(1);
  });

  it("keeps an empty institution when its own name matches the search term", () => {
    const groups = [
      group({
        institution: { id: "inst-empty", name: "Shell Bank" },
        accounts: [],
        fixedDeposits: [],
        shareTradingAccounts: []
      })
    ];
    const result = filterInstitutionGroups(groups, "shell", "All");
    expect(result).toEqual(groups);
  });

  it("keeps empty institutions when there is no active filter", () => {
    const groups = [
      group({
        institution: { id: "inst-empty", name: "Shell Bank" },
        accounts: [],
        fixedDeposits: [],
        shareTradingAccounts: []
      })
    ];
    expect(filterInstitutionGroups(groups, "", "All")).toEqual(groups);
  });

  it("still drops an empty institution when a currency filter is active", () => {
    const groups = [
      group({
        institution: { id: "inst-empty", name: "Shell Bank" },
        accounts: [],
        fixedDeposits: [],
        shareTradingAccounts: []
      })
    ];
    expect(filterInstitutionGroups(groups, "shell", "AED")).toEqual([]);
  });

  it("drops an institution entirely when nothing under it matches the search term", () => {
    const groups = [group()];
    expect(filterInstitutionGroups(groups, "nonexistent", "All")).toEqual([]);
  });

  it("narrows to a single currency regardless of search match", () => {
    const groups = [
      group({
        accounts: [
          { name: "NRO Savings", accountNumber: "XXXX4471", currencyCode: "INR" },
          { name: "AED Current", accountNumber: "XXXX9032", currencyCode: "AED" }
        ]
      })
    ];
    const result = filterInstitutionGroups(groups, "", "AED");
    expect(result[0].accounts).toEqual([{ name: "AED Current", accountNumber: "XXXX9032", currencyCode: "AED" }]);
  });

  it("combines search and currency filters (both must match)", () => {
    const groups = [
      group({
        institution: { id: "inst-2", name: "WIO Bank" },
        accounts: [
          { name: "AED Current", accountNumber: "XXXX9032", currencyCode: "AED" },
          { name: "USD Savings", accountNumber: "XXXX9033", currencyCode: "USD" }
        ],
        fixedDeposits: []
      })
    ];
    const result = filterInstitutionGroups(groups, "current", "AED");
    expect(result[0].accounts).toEqual([{ name: "AED Current", accountNumber: "XXXX9032", currencyCode: "AED" }]);
  });

  it("treats a null account number as no match rather than throwing", () => {
    const groups = [
      group({
        accounts: [{ name: "Zerodha", accountNumber: null, currencyCode: "INR" }],
        fixedDeposits: []
      })
    ];
    expect(() => filterInstitutionGroups(groups, "4471", "All")).not.toThrow();
    expect(filterInstitutionGroups(groups, "4471", "All")).toEqual([]);
  });
});
