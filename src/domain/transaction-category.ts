export const EXPENSE_CATEGORIES = [
  "Grocery",
  "Dining",
  "Education",
  "Transport",
  "Utilities",
  "Rent",
  "Health",
  "Entertainment",
  "Other"
] as const;

export const INCOME_CATEGORIES = ["Salary", "Interest", "Gift", "Other Income"] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];
export type TransactionCategory = ExpenseCategory | IncomeCategory;
export type TransactionKind = "Income" | "Expense";

export function categoriesForKind(kind: TransactionKind): readonly TransactionCategory[] {
  return kind === "Income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

export class InvalidTransactionCategoryError extends Error {
  constructor() {
    super("Category must match the selected Income/Expense kind.");
    this.name = "InvalidTransactionCategoryError";
  }
}

export function assertValidCategoryForKind(kind: TransactionKind, category: string): void {
  if (!(categoriesForKind(kind) as readonly string[]).includes(category)) {
    throw new InvalidTransactionCategoryError();
  }
}
