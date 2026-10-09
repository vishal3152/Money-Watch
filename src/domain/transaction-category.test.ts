import { describe, expect, it } from "vitest";

import {
  assertValidCategoryForKind,
  categoriesForKind,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  InvalidTransactionCategoryError
} from "@/domain/transaction-category";

describe("categoriesForKind", () => {
  it("returns the Expense category list for Expense", () => {
    expect(categoriesForKind("Expense")).toEqual(EXPENSE_CATEGORIES);
  });

  it("returns the Income category list for Income", () => {
    expect(categoriesForKind("Income")).toEqual(INCOME_CATEGORIES);
  });
});

describe("assertValidCategoryForKind", () => {
  it("accepts a category that belongs to the given kind", () => {
    expect(() => assertValidCategoryForKind("Expense", "Grocery")).not.toThrow();
    expect(() => assertValidCategoryForKind("Income", "Salary")).not.toThrow();
  });

  it("rejects a category that belongs to the other kind", () => {
    expect(() => assertValidCategoryForKind("Income", "Grocery")).toThrow(
      InvalidTransactionCategoryError
    );
    expect(() => assertValidCategoryForKind("Expense", "Salary")).toThrow(
      InvalidTransactionCategoryError
    );
  });

  it("rejects an unknown category", () => {
    expect(() => assertValidCategoryForKind("Expense", "Not A Category")).toThrow(
      InvalidTransactionCategoryError
    );
  });
});
