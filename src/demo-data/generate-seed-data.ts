/**
 * Deterministic demo seed dataset for Paisa-Watch.
 * Run: `pnpm demo:generate` → writes `public/demo-data/seed-data.json`
 */

export type SeedInstitution = {
  id: string;
  name: string;
};

export type SeedAccount = {
  id: string;
  institutionId: string;
  name: string;
  accountNumber: string | null;
  currencyCode: "INR" | "USD" | "AED";
};

export type SeedFixedDeposit = {
  id: string;
  name: string;
  accountNumber: string | null;
  institutionId: string;
  linkedAccountId: string;
  currencyCode: "INR" | "USD" | "AED";
  principal: string;
  interestRate: string;
  openedDate: string;
  maturityDate: string;
  debitNow: true;
  openingTransferId: string;
  openingTransactionId: string;
};

export type SeedTransaction = {
  id: string;
  accountId: string;
  kind: "Income" | "Expense";
  category: string;
  amount: string;
  occurredAt: string;
  description: string;
};

export type SeedTransfer = {
  id: string;
  sourceAccountId: string;
  destinationAccountId: string;
  sourceCurrencyCode: "INR" | "USD" | "AED";
  destinationCurrencyCode: "INR" | "USD" | "AED";
  sourceAmount: string;
  destinationAmount: string;
  occurredAt: string;
  description: string;
  purpose: "general";
};

export type DemoSeedData = {
  meta: {
    generatedAt: string;
    institutionCount: number;
    accountsPerInstitution: number;
    currencyMix: { INR: number; USD: number; AED: number };
    fixedDepositsPerAccount: number;
    transactionsPerAccount: number;
    transfersPerAccount: number;
  };
  institutions: SeedInstitution[];
  accounts: SeedAccount[];
  fixedDeposits: SeedFixedDeposit[];
  transactions: SeedTransaction[];
  transfers: SeedTransfer[];
};

const BANK_NAMES = [
  "HDFC Bank",
  "ICICI Bank",
  "SBI",
  "Axis Bank",
  "Kotak Mahindra",
  "Yes Bank",
  "IndusInd Bank",
  "IDFC First",
  "Federal Bank",
  "Bank of Baroda"
] as const;

const CURRENCY_SLOTS: Array<"INR" | "USD" | "AED"> = [
  "INR",
  "INR",
  "INR",
  "INR",
  "INR",
  "USD",
  "USD",
  "USD",
  "AED",
  "AED"
];

const INCOME_TEMPLATES = [
  { category: "Salary", amountByCurrency: { INR: "250000.00", USD: "4500.00", AED: "12000.00" } },
  { category: "Interest", amountByCurrency: { INR: "3500.00", USD: "85.00", AED: "220.00" } },
  { category: "Gift", amountByCurrency: { INR: "10000.00", USD: "200.00", AED: "500.00" } }
] as const;

const EXPENSE_TEMPLATES = [
  { category: "Grocery", amountByCurrency: { INR: "4200.00", USD: "95.00", AED: "280.00" } },
  { category: "Dining", amountByCurrency: { INR: "2800.00", USD: "65.00", AED: "190.00" } },
  { category: "Transport", amountByCurrency: { INR: "1500.00", USD: "40.00", AED: "110.00" } }
] as const;

const FD_PRINCIPAL = { INR: "75000.00", USD: "1200.00", AED: "3500.00" } as const;
const FD_RATE = "6.50";
const TRANSFER_AMOUNT = { INR: "1500.00", USD: "40.00", AED: "120.00" } as const;

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

function dayStamp(dayOffset: number): string {
  const base = Date.UTC(2026, 0, 5, 10, 0, 0);
  return new Date(base + dayOffset * 86_400_000).toISOString();
}

function dateOnly(dayOffset: number): string {
  return dayStamp(dayOffset).slice(0, 10);
}

export function generateDemoSeedData(
  options: { generatedAt?: string } = {}
): DemoSeedData {
  const institutions: SeedInstitution[] = BANK_NAMES.map((name, index) => ({
    id: `inst-${pad(index + 1)}`,
    name
  }));

  const accounts: SeedAccount[] = [];
  for (const [instIndex, institution] of institutions.entries()) {
    CURRENCY_SLOTS.forEach((currencyCode, slot) => {
      const n = slot + 1;
      accounts.push({
        id: `${institution.id}-acc-${currencyCode.toLowerCase()}-${pad(n)}`,
        institutionId: institution.id,
        name: `${currencyCode} Account ${n}`,
        accountNumber: `${currencyCode}${pad(instIndex + 1)}${pad(n)}0001`,
        currencyCode
      });
    });
  }

  const accountsByCurrency: Record<"INR" | "USD" | "AED", SeedAccount[]> = {
    INR: accounts.filter((a) => a.currencyCode === "INR"),
    USD: accounts.filter((a) => a.currencyCode === "USD"),
    AED: accounts.filter((a) => a.currencyCode === "AED")
  };

  const transactions: SeedTransaction[] = [];
  for (const account of accounts) {
    let day = 0;
    for (const template of INCOME_TEMPLATES) {
      day += 1;
      transactions.push({
        id: `${account.id}-txn-in-${template.category.toLowerCase().replace(/\s+/g, "-")}`,
        accountId: account.id,
        kind: "Income",
        category: template.category,
        amount: template.amountByCurrency[account.currencyCode],
        occurredAt: dayStamp(day),
        description: `${template.category} credit`
      });
    }
    for (const template of EXPENSE_TEMPLATES) {
      day += 1;
      transactions.push({
        id: `${account.id}-txn-ex-${template.category.toLowerCase()}`,
        accountId: account.id,
        kind: "Expense",
        category: template.category,
        amount: template.amountByCurrency[account.currencyCode],
        occurredAt: dayStamp(day),
        description: `${template.category} spend`
      });
    }
  }

  const fixedDeposits: SeedFixedDeposit[] = accounts.map((account, index) => ({
    id: `${account.id}-fd`,
    name: `${account.currencyCode} FD ${pad((index % 10) + 1)}`,
    accountNumber: `FD${account.currencyCode}${pad(index + 1)}`,
    institutionId: account.institutionId,
    linkedAccountId: account.id,
    currencyCode: account.currencyCode,
    principal: FD_PRINCIPAL[account.currencyCode],
    interestRate: FD_RATE,
    openedDate: dateOnly(10),
    maturityDate: dateOnly(375),
    debitNow: true,
    openingTransferId: `${account.id}-fd-open-xfer`,
    openingTransactionId: `${account.id}-fd-open-txn`
  }));

  const transfers: SeedTransfer[] = [];
  for (const account of accounts) {
    const peers = accountsByCurrency[account.currencyCode];
    const selfIndex = peers.findIndex((peer) => peer.id === account.id);
    for (let i = 1; i <= 6; i += 1) {
      const destination = peers[(selfIndex + i) % peers.length]!;
      transfers.push({
        id: `${account.id}-xfer-${pad(i)}`,
        sourceAccountId: account.id,
        destinationAccountId: destination.id,
        sourceCurrencyCode: account.currencyCode,
        destinationCurrencyCode: destination.currencyCode,
        sourceAmount: TRANSFER_AMOUNT[account.currencyCode],
        destinationAmount: TRANSFER_AMOUNT[account.currencyCode],
        occurredAt: dayStamp(20 + i),
        description: `Transfer ${i} from ${account.name}`,
        purpose: "general"
      });
    }
  }

  return {
    meta: {
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      institutionCount: institutions.length,
      accountsPerInstitution: CURRENCY_SLOTS.length,
      currencyMix: { INR: 5, USD: 3, AED: 2 },
      fixedDepositsPerAccount: 1,
      transactionsPerAccount: 6,
      transfersPerAccount: 6
    },
    institutions,
    accounts,
    fixedDeposits,
    transactions,
    transfers
  };
}
