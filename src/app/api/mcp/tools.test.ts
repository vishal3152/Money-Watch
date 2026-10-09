import { describe, expect, it } from "vitest";

import { AccountRepository } from "@/db/repositories/account-repository";
import { ImportBatchRepository } from "@/db/repositories/import-batch-repository";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { ShareTradingAccountRepository } from "@/db/repositories/share-trading-account-repository";
import { StockImportBatchRepository } from "@/db/repositories/stock-import-batch-repository";
import { StockTransactionRepository } from "@/db/repositories/stock-transaction-repository";
import { createTestDb } from "@/db/repositories/test-db";
import { TransactionRepository } from "@/db/repositories/transaction-repository";
import { DatabaseConstraintError } from "@/db/errors";
import { computeAccountBalance } from "@/domain/account-balance";
import { InvalidMinorUnitsError } from "@/domain/money";
import { ImportBatchClosingBalanceError, ImportBatchOpeningBalanceError } from "@/domain/import-batch";
import { EmptyStockImportBatchError } from "@/domain/stock-import-batch";
import { InvalidStockQuantityError } from "@/domain/stock-transaction";
import { InvalidTransactionCategoryError } from "@/domain/transaction-category";
import { TEXT_FIELD_MAX_LENGTH } from "@/app/form-limits";
import {
  commitImport,
  commitStockImport,
  createAccount,
  createInstitution,
  createShareTradingAccount,
  InvalidAccountResolutionInputError,
  InvalidMcpCreateInputError,
  listAccounts,
  listInstitutions,
  listShareTradingAccounts,
  OwnerConfirmationRequiredError,
  resolveAccount,
  resolveShareTradingAccount,
  stageImport,
  stageStockImport
} from "@/app/api/mcp/tools";

function deps(testDb: ReturnType<typeof createTestDb>) {
  return { getCurrentOwnerId: async () => null, isCloudMode: () => false, db: testDb.db };
}

async function seedAccount(testDb: ReturnType<typeof createTestDb>) {
  await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Bank One" });
  await new AccountRepository(testDb.db).create({
    id: "acc-1",
    institutionId: "inst-1",
    name: "Primary Checking",
    accountNumber: "1234",
    currencyCode: "INR"
  });
}

describe("listInstitutions", () => {
  it("returns every Institution", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Bank One" });

    expect(await listInstitutions(deps(testDb))).toEqual([{ id: "inst-1", name: "Bank One" }]);
  });
});

describe("createInstitution", () => {
  it("refuses to write when confirmed is not true", async () => {
    const testDb = createTestDb();

    await expect(
      createInstitution({ name: "RBL Bank", confirmed: false }, deps(testDb))
    ).rejects.toBeInstanceOf(OwnerConfirmationRequiredError);

    expect(await new InstitutionRepository(testDb.db).listAll()).toEqual([]);
  });

  it("creates an Institution when confirmed and the name is new", async () => {
    const testDb = createTestDb();

    const result = await createInstitution(
      { name: "RBL Bank", confirmed: true },
      { ...deps(testDb), newId: () => "inst-new" }
    );

    expect(result).toEqual({
      created: true,
      institution: { id: "inst-new", name: "RBL Bank" }
    });
    expect(await new InstitutionRepository(testDb.db).listAll()).toEqual([
      { id: "inst-new", name: "RBL Bank" }
    ]);
  });

  it("returns the existing Institution without creating a duplicate when the name matches case-insensitively", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-rbl", name: "RBL Bank" });

    const result = await createInstitution(
      { name: "rbl bank", confirmed: true },
      { ...deps(testDb), newId: () => "inst-should-not-exist" }
    );

    expect(result).toEqual({
      created: false,
      institution: { id: "inst-rbl", name: "RBL Bank" }
    });
    expect(await new InstitutionRepository(testDb.db).listAll()).toEqual([
      { id: "inst-rbl", name: "RBL Bank" }
    ]);
  });
  it("rejects an empty name before any write", async () => {
    const testDb = createTestDb();

    await expect(
      createInstitution({ name: "   ", confirmed: true }, deps(testDb))
    ).rejects.toBeInstanceOf(InvalidMcpCreateInputError);

    expect(await new InstitutionRepository(testDb.db).listAll()).toEqual([]);
  });

  it("rejects an overlong name before any write", async () => {
    const testDb = createTestDb();

    await expect(
      createInstitution({ name: "x".repeat(TEXT_FIELD_MAX_LENGTH + 1), confirmed: true }, deps(testDb))
    ).rejects.toBeInstanceOf(InvalidMcpCreateInputError);

    expect(await new InstitutionRepository(testDb.db).listAll()).toEqual([]);
  });
});

describe("createAccount", () => {
  it("refuses to write when confirmed is not true", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "RBL Bank" });

    await expect(
      createAccount(
        {
          institutionId: "inst-1",
          name: "NRE",
          currencyCode: "INR",
          accountNumber: "309007751596",
          confirmed: false
        },
        deps(testDb)
      )
    ).rejects.toBeInstanceOf(OwnerConfirmationRequiredError);

    expect(await new AccountRepository(testDb.db).listAll()).toEqual([]);
  });

  it("creates an Account when confirmed with valid fields", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "RBL Bank" });

    const result = await createAccount(
      {
        institutionId: "inst-1",
        name: "NRE",
        currencyCode: "inr",
        accountNumber: "309007751596",
        confirmed: true
      },
      { ...deps(testDb), newId: () => "acc-new" }
    );

    expect(result).toEqual({
      created: true,
      account: {
        id: "acc-new",
        name: "NRE",
        currencyCode: "INR",
        accountNumber: "309007751596"
      },
      institution: { id: "inst-1", name: "RBL Bank" }
    });
    expect(await new AccountRepository(testDb.db).getById("acc-new")).toMatchObject({
      institutionId: "inst-1",
      name: "NRE",
      currencyCode: "INR",
      accountNumber: "309007751596"
    });
  });

  it("returns the existing Account without creating a duplicate when last-4 digits already match at that Institution", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "RBL Bank" });
    await new AccountRepository(testDb.db).create({
      id: "acc-existing",
      institutionId: "inst-1",
      name: "NRE",
      accountNumber: "XXXX1596",
      currencyCode: "INR"
    });

    const result = await createAccount(
      {
        institutionId: "inst-1",
        name: "NRE Savings",
        currencyCode: "INR",
        accountNumber: "309007751596",
        confirmed: true
      },
      { ...deps(testDb), newId: () => "acc-should-not-exist" }
    );

    expect(result).toEqual({
      created: false,
      account: {
        id: "acc-existing",
        name: "NRE",
        currencyCode: "INR",
        accountNumber: "XXXX1596"
      },
      institution: { id: "inst-1", name: "RBL Bank" }
    });
    expect(await new AccountRepository(testDb.db).listAll()).toHaveLength(1);
  });

  it("rejects a missing or short accountNumber before any write", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "RBL Bank" });

    await expect(
      createAccount(
        { institutionId: "inst-1", name: "NRE", currencyCode: "INR", accountNumber: "", confirmed: true },
        deps(testDb)
      )
    ).rejects.toBeInstanceOf(InvalidMcpCreateInputError);

    await expect(
      createAccount(
        { institutionId: "inst-1", name: "NRE", currencyCode: "INR", accountNumber: "12", confirmed: true },
        deps(testDb)
      )
    ).rejects.toBeInstanceOf(InvalidMcpCreateInputError);

    expect(await new AccountRepository(testDb.db).listAll()).toEqual([]);
  });

  it("rejects an empty name and an invalid currencyCode before any write", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "RBL Bank" });

    await expect(
      createAccount(
        {
          institutionId: "inst-1",
          name: "  ",
          currencyCode: "INR",
          accountNumber: "309007751596",
          confirmed: true
        },
        deps(testDb)
      )
    ).rejects.toBeInstanceOf(InvalidMcpCreateInputError);

    await expect(
      createAccount(
        {
          institutionId: "inst-1",
          name: "NRE",
          currencyCode: "rupees",
          accountNumber: "309007751596",
          confirmed: true
        },
        deps(testDb)
      )
    ).rejects.toBeInstanceOf(InvalidMcpCreateInputError);

    expect(await new AccountRepository(testDb.db).listAll()).toEqual([]);
  });

  it("rejects an unknown institutionId before any write", async () => {
    const testDb = createTestDb();

    await expect(
      createAccount(
        {
          institutionId: "missing",
          name: "NRE",
          currencyCode: "INR",
          accountNumber: "309007751596",
          confirmed: true
        },
        deps(testDb)
      )
    ).rejects.toBeInstanceOf(DatabaseConstraintError);

    expect(await new AccountRepository(testDb.db).listAll()).toEqual([]);
  });

  it("rejects creating an Account when a ShareTradingAccount already matches the same last-4 and Institution", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Broker One" });
    await new ShareTradingAccountRepository(testDb.db).create({
      id: "sta-1",
      institutionId: "inst-1",
      name: "Equities",
      accountNumber: "XXXX9988",
      currencyCode: "USD"
    });

    await expect(
      createAccount(
        {
          institutionId: "inst-1",
          name: "Cash",
          currencyCode: "USD",
          accountNumber: "999988",
          confirmed: true
        },
        deps(testDb)
      )
    ).rejects.toBeInstanceOf(InvalidMcpCreateInputError);

    expect(await new AccountRepository(testDb.db).listAll()).toEqual([]);
  });
});

describe("createShareTradingAccount", () => {
  it("creates a ShareTradingAccount when confirmed with valid fields", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Broker One" });

    const result = await createShareTradingAccount(
      {
        institutionId: "inst-1",
        name: "US Equities",
        currencyCode: "usd",
        accountNumber: "XXXX1234",
        confirmed: true
      },
      { ...deps(testDb), newId: () => "sta-new" }
    );

    expect(result).toEqual({
      created: true,
      shareTradingAccount: {
        id: "sta-new",
        name: "US Equities",
        currencyCode: "USD",
        accountNumber: "XXXX1234"
      },
      institution: { id: "inst-1", name: "Broker One" }
    });
  });

  it("refuses to write when confirmed is not true", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Broker One" });

    await expect(
      createShareTradingAccount(
        {
          institutionId: "inst-1",
          name: "US Equities",
          currencyCode: "USD",
          accountNumber: "XXXX1234",
          confirmed: false
        },
        deps(testDb)
      )
    ).rejects.toBeInstanceOf(OwnerConfirmationRequiredError);

    expect(await new ShareTradingAccountRepository(testDb.db).listAll()).toEqual([]);
  });
});

describe("listAccounts", () => {
  it("includes each Account's Institution, currency, and accountNumber", async () => {
    const testDb = createTestDb();
    await seedAccount(testDb);

    expect(await listAccounts(deps(testDb))).toEqual([
      {
        id: "acc-1",
        name: "Primary Checking",
        currencyCode: "INR",
        accountNumber: "1234",
        institution: { id: "inst-1", name: "Bank One" }
      }
    ]);
  });
});

describe("stageImport", () => {
  it("flags no duplicates against an Account with no existing Transactions", async () => {
    const testDb = createTestDb();
    await seedAccount(testDb);

    const result = await stageImport(
      {
        accountId: "acc-1",
        lineItems: [
          { amount: "-1500.00", occurredAt: "2026-01-15", description: "Grocery run", category: "Grocery" }
        ],
        closingBalance: null,
        asOfDate: null
      },
      deps(testDb)
    );

    expect(result.account).toEqual({
      id: "acc-1",
      name: "Primary Checking",
      currencyCode: "INR",
      accountNumber: "1234"
    });
    expect(result.institution).toEqual({ id: "inst-1", name: "Bank One" });
    expect(result.lineItems).toEqual([
      {
        amount: "-1500.00",
        occurredAt: "2026-01-15",
        description: "Grocery run",
        category: "Grocery",
        amountMinor: -1_500_00,
        isDuplicate: false
      }
    ]);
  });

  it("flags a line item matching an existing Transaction's (accountId, occurredAt, amountMinor) as a likely duplicate, regardless of description, without altering any data", async () => {
    const testDb = createTestDb();
    await seedAccount(testDb);
    await new TransactionRepository(testDb.db).create({
      id: "txn-existing",
      accountId: "acc-1",
      amountMinor: -1_500_00,
      occurredAt: "2026-01-15T00:00:00.000Z",
      description: "GROCERY STORE #42",
      trustStatus: "Confirmed",
      transferId: null,
      category: "Grocery",
      importBatchId: null
    });

    const result = await stageImport(
      {
        accountId: "acc-1",
        lineItems: [
          { amount: "-1500.00", occurredAt: "2026-01-15", description: "Different phrasing", category: null }
        ],
        closingBalance: null,
        asOfDate: null
      },
      deps(testDb)
    );

    expect(result.lineItems[0]?.isDuplicate).toBe(true);
    expect(await new TransactionRepository(testDb.db).listByAccountId("acc-1")).toHaveLength(1);
  });

  it("flags a line item matching a manually-entered Transaction on the same calendar date and amount, even though its timestamp carries a real time-of-day", async () => {
    const testDb = createTestDb();
    await seedAccount(testDb);
    await new TransactionRepository(testDb.db).create({
      id: "txn-manual",
      accountId: "acc-1",
      amountMinor: -1_500_00,
      occurredAt: "2026-01-15T14:32:00.000Z",
      description: "Manually entered",
      trustStatus: "Confirmed",
      transferId: null,
      category: "Grocery",
      importBatchId: null
    });

    const result = await stageImport(
      {
        accountId: "acc-1",
        lineItems: [
          { amount: "-1500.00", occurredAt: "2026-01-15", description: "Grocery run", category: "Grocery" }
        ],
        closingBalance: null,
        asOfDate: null
      },
      deps(testDb)
    );

    expect(result.lineItems[0]?.isDuplicate).toBe(true);
  });

  it("flags a line item by externalRef even when its date differs from the matching existing Transaction", async () => {
    const testDb = createTestDb();
    await seedAccount(testDb);
    await new TransactionRepository(testDb.db).create({
      id: "txn-existing",
      accountId: "acc-1",
      amountMinor: -1_500_00,
      occurredAt: "2026-01-15T00:00:00.000Z",
      description: "Grocery run",
      trustStatus: "Confirmed",
      transferId: null,
      category: "Grocery",
      importBatchId: null,
      externalRef: "REF123"
    });

    const result = await stageImport(
      {
        accountId: "acc-1",
        lineItems: [
          {
            amount: "-1500.00",
            occurredAt: "2026-01-20",
            description: "Grocery run (restated)",
            category: "Grocery",
            externalRef: "REF123"
          }
        ],
        closingBalance: null,
        asOfDate: null
      },
      deps(testDb)
    );

    expect(result.lineItems[0]?.isDuplicate).toBe(true);
  });

  it("rejects an unknown accountId", async () => {
    const testDb = createTestDb();

    await expect(
      stageImport(
        {
          accountId: "missing-account",
          lineItems: [{ amount: "-100.00", occurredAt: "2026-01-15", description: "x", category: null }],
          closingBalance: null,
          asOfDate: null
        },
        deps(testDb)
      )
    ).rejects.toBeInstanceOf(DatabaseConstraintError);
  });

  it("flags a later repeat of an identical line item within the same staged batch, but not the first occurrence", async () => {
    const testDb = createTestDb();
    await seedAccount(testDb);

    const result = await stageImport(
      {
        accountId: "acc-1",
        lineItems: [
          { amount: "-1500.00", occurredAt: "2026-01-15", description: "Grocery run", category: "Grocery" },
          { amount: "-1500.00", occurredAt: "2026-01-15", description: "Grocery run", category: "Grocery" },
          { amount: "-200.00", occurredAt: "2026-01-15", description: "Coffee", category: "Dining" }
        ],
        closingBalance: null,
        asOfDate: null
      },
      deps(testDb)
    );

    // An OCR/AI extraction glitch or a genuinely duplicated statement line — the first occurrence
    // is "the original" and stays unflagged; a later repeat of the same (occurredAt, amountMinor)
    // is flagged even though it never appeared in already-persisted history.
    expect(result.lineItems[0]?.isDuplicate).toBe(false);
    expect(result.lineItems[1]?.isDuplicate).toBe(true);
    expect(result.lineItems[2]?.isDuplicate).toBe(false);
  });

  it("on an empty Account, returns a synthetic Opening balance line as openingBalanceLine, separate from lineItems, when openingBalance is provided", async () => {
    const testDb = createTestDb();
    await seedAccount(testDb);

    const result = await stageImport(
      {
        accountId: "acc-1",
        lineItems: [
          { amount: "-39900.00", occurredAt: "2025-10-26", description: "Withdrawal", category: null }
        ],
        closingBalance: null,
        asOfDate: null,
        openingBalance: "39900.00",
        openingAsOfDate: "2025-10-25"
      },
      deps(testDb)
    );

    expect(result.openingBalanceLine).toEqual({
      amount: "39900.00",
      occurredAt: "2025-10-25",
      description: "Opening balance",
      category: null,
      amountMinor: 39_900_00,
      isDuplicate: false
    });
    // Kept out of `lineItems` — echoing this preview's lineItems straight back into commit_import
    // (alongside the same openingBalance/openingAsOfDate) must never double-prepend the opening line.
    expect(result.lineItems).toEqual([
      {
        amount: "-39900.00",
        occurredAt: "2025-10-26",
        description: "Withdrawal",
        category: null,
        amountMinor: -39_900_00,
        isDuplicate: false
      }
    ]);
  });

  it("returns openingBalanceLine: null when no opening pair is supplied, or the Account is non-empty, or the amount is zero", async () => {
    const testDb = createTestDb();
    await seedAccount(testDb);

    const noPair = await stageImport(
      {
        accountId: "acc-1",
        lineItems: [{ amount: "-100.00", occurredAt: "2026-01-15", description: "x", category: null }],
        closingBalance: null,
        asOfDate: null
      },
      deps(testDb)
    );
    expect(noPair.openingBalanceLine).toBeNull();

    const zeroAmount = await stageImport(
      {
        accountId: "acc-1",
        lineItems: [{ amount: "-100.00", occurredAt: "2026-01-15", description: "x", category: null }],
        closingBalance: null,
        asOfDate: null,
        openingBalance: "0.00",
        openingAsOfDate: "2026-01-14"
      },
      deps(testDb)
    );
    expect(zeroAmount.openingBalanceLine).toBeNull();
  });
});

describe("commitImport", () => {
  it("creates exactly one unconfirmed ImportBatch and its Imported Transactions", async () => {
    const testDb = createTestDb();
    await seedAccount(testDb);
    let idCount = 0;
    const newId = () => `id-${++idCount}`;

    const batch = await commitImport(
      {
        accountId: "acc-1",
        source: "statement.pdf",
        lineItems: [
          { amount: "-1500.00", occurredAt: "2026-01-15", description: "Grocery run", category: "Grocery" }
        ],
        closingBalance: null,
        asOfDate: null
      },
      { ...deps(testDb), newId }
    );

    expect(batch.confirmedAt).toBeNull();
    expect(batch.accountId).toBe("acc-1");
    const transactions = await new TransactionRepository(testDb.db).listByAccountId("acc-1");
    expect(transactions).toEqual([
      expect.objectContaining({
        amountMinor: -1_500_00,
        trustStatus: "Imported",
        importBatchId: batch.id
      })
    ]);
  });

  it("persists externalRef and flags a Suspected Duplicate match against an existing Transaction with the same ref", async () => {
    const testDb = createTestDb();
    await seedAccount(testDb);
    await new TransactionRepository(testDb.db).create({
      id: "txn-existing",
      accountId: "acc-1",
      amountMinor: -1_500_00,
      occurredAt: "2026-01-15T00:00:00.000Z",
      description: "Grocery run",
      trustStatus: "Confirmed",
      transferId: null,
      category: "Grocery",
      importBatchId: null,
      externalRef: "REF123"
    });
    let idCount = 0;
    const newId = () => `id-${++idCount}`;

    await commitImport(
      {
        accountId: "acc-1",
        source: "statement.pdf",
        lineItems: [
          {
            amount: "-1500.00",
            occurredAt: "2026-01-15",
            description: "Grocery run [REF123]",
            category: "Grocery",
            externalRef: "REF123"
          }
        ],
        closingBalance: null,
        asOfDate: null
      },
      { ...deps(testDb), newId }
    );

    const transactionRepository = new TransactionRepository(testDb.db);
    const transactions = await transactionRepository.listByAccountId("acc-1");
    const imported = transactions.find((transaction) => transaction.id !== "txn-existing");
    expect(imported?.externalRef).toBe("REF123");
    expect(imported?.possibleDuplicateOfTransactionId).toBe("txn-existing");
  });

  it("writes nothing for an unknown accountId", async () => {
    const testDb = createTestDb();

    await expect(
      commitImport(
        {
          accountId: "missing-account",
          source: "statement.pdf",
          lineItems: [{ amount: "-100.00", occurredAt: "2026-01-15", description: "x", category: null }],
          closingBalance: null,
          asOfDate: null
        },
        deps(testDb)
      )
    ).rejects.toBeInstanceOf(DatabaseConstraintError);
  });

  it("writes nothing for an empty line-item list", async () => {
    const testDb = createTestDb();
    await seedAccount(testDb);

    await expect(
      commitImport(
        { accountId: "acc-1", source: "statement.pdf", lineItems: [], closingBalance: null, asOfDate: null },
        deps(testDb)
      )
    ).rejects.toThrow();

    expect(await new TransactionRepository(testDb.db).listByAccountId("acc-1")).toEqual([]);
  });

  it("writes nothing for a line item amount that doesn't parse for the Account's currency", async () => {
    const testDb = createTestDb();
    await seedAccount(testDb);

    await expect(
      commitImport(
        {
          accountId: "acc-1",
          source: "statement.pdf",
          lineItems: [{ amount: "not-a-number", occurredAt: "2026-01-15", description: "x", category: null }],
          closingBalance: null,
          asOfDate: null
        },
        deps(testDb)
      )
    ).rejects.toBeInstanceOf(InvalidMinorUnitsError);

    expect(await new TransactionRepository(testDb.db).listByAccountId("acc-1")).toEqual([]);
  });

  it("writes nothing for a closing balance given without its as-of date", async () => {
    const testDb = createTestDb();
    await seedAccount(testDb);

    await expect(
      commitImport(
        {
          accountId: "acc-1",
          source: "statement.pdf",
          lineItems: [{ amount: "-100.00", occurredAt: "2026-01-15", description: "x", category: null }],
          closingBalance: "5000.00",
          asOfDate: null
        },
        deps(testDb)
      )
    ).rejects.toBeInstanceOf(ImportBatchClosingBalanceError);

    expect(await new TransactionRepository(testDb.db).listByAccountId("acc-1")).toEqual([]);
  });

  it("on an empty Account, prepends an Opening balance Transaction from openingBalance so the ledger includes the statement starting balance", async () => {
    const testDb = createTestDb();
    await seedAccount(testDb);
    let idCount = 0;
    const newId = () => `id-${++idCount}`;

    // Statement opening 39900 AED, then a full withdrawal of that principal — computed balance must be 0.
    const batch = await commitImport(
      {
        accountId: "acc-1",
        source: "wio-statement.pdf",
        lineItems: [
          { amount: "-39900.00", occurredAt: "2025-10-26", description: "Fixed Saving Space to VISHAL YADAV", category: null }
        ],
        closingBalance: "0",
        asOfDate: "2025-10-26",
        openingBalance: "39900.00",
        openingAsOfDate: "2025-10-25"
      },
      { ...deps(testDb), newId }
    );

    const transactions = await new TransactionRepository(testDb.db).listByAccountId("acc-1");
    expect(transactions).toEqual([
      expect.objectContaining({
        amountMinor: 39_900_00,
        description: "Opening balance",
        occurredAt: "2025-10-25T00:00:00.000Z",
        trustStatus: "Imported",
        importBatchId: batch.id,
        category: null
      }),
      expect.objectContaining({
        amountMinor: -39_900_00,
        description: "Fixed Saving Space to VISHAL YADAV",
        importBatchId: batch.id
      })
    ]);
    expect(computeAccountBalance(transactions)).toBe(0);
  });

  it("stage→commit round trip does not double-count the opening balance when the assistant echoes stage_import's preview lineItems back into commit_import", async () => {
    const testDb = createTestDb();
    await seedAccount(testDb);

    const staged = await stageImport(
      {
        accountId: "acc-1",
        lineItems: [
          { amount: "-39900.00", occurredAt: "2025-10-26", description: "Fixed Saving Space to VISHAL YADAV", category: null }
        ],
        closingBalance: null,
        asOfDate: null,
        openingBalance: "39900.00",
        openingAsOfDate: "2025-10-25"
      },
      deps(testDb)
    );

    let idCount = 0;
    const newId = () => `id-${++idCount}`;
    const batch = await commitImport(
      {
        accountId: "acc-1",
        source: "wio-statement.pdf",
        lineItems: staged.lineItems.map(({ amountMinor: _amountMinor, isDuplicate: _isDuplicate, ...lineItem }) => lineItem),
        closingBalance: null,
        asOfDate: null,
        openingBalance: "39900.00",
        openingAsOfDate: "2025-10-25"
      },
      { ...deps(testDb), newId }
    );

    const transactions = await new TransactionRepository(testDb.db).listByAccountId("acc-1");
    expect(transactions.filter((transaction) => transaction.importBatchId === batch.id)).toHaveLength(2);
    expect(transactions.filter((transaction) => transaction.description === "Opening balance")).toHaveLength(1);
    expect(computeAccountBalance(transactions)).toBe(0);
  });

  it("on a non-empty Account, ignores openingBalance and still imports the statement line items", async () => {
    const testDb = createTestDb();
    await seedAccount(testDb);
    await new TransactionRepository(testDb.db).create({
      id: "txn-prior",
      accountId: "acc-1",
      amountMinor: 10_000_00,
      occurredAt: "2025-01-01T00:00:00.000Z",
      description: "Prior activity",
      trustStatus: "Confirmed",
      transferId: null,
      category: null,
      importBatchId: null
    });
    let idCount = 0;
    const newId = () => `id-${++idCount}`;

    const batch = await commitImport(
      {
        accountId: "acc-1",
        source: "wio-statement.pdf",
        lineItems: [
          { amount: "-500.00", occurredAt: "2025-10-26", description: "Withdrawal", category: null }
        ],
        closingBalance: null,
        asOfDate: null,
        openingBalance: "39900.00",
        openingAsOfDate: "2025-10-25"
      },
      { ...deps(testDb), newId }
    );

    const transactions = await new TransactionRepository(testDb.db).listByAccountId("acc-1");
    expect(transactions).toEqual([
      expect.objectContaining({ id: "txn-prior", amountMinor: 10_000_00 }),
      expect.objectContaining({
        amountMinor: -500_00,
        description: "Withdrawal",
        importBatchId: batch.id
      })
    ]);
    expect(transactions.some((transaction) => transaction.description === "Opening balance")).toBe(false);
  });

  it("on an empty Account, skips a zero openingBalance and does not create a synthetic Opening balance Transaction", async () => {
    const testDb = createTestDb();
    await seedAccount(testDb);
    let idCount = 0;
    const newId = () => `id-${++idCount}`;

    const batch = await commitImport(
      {
        accountId: "acc-1",
        source: "statement.pdf",
        lineItems: [{ amount: "-100.00", occurredAt: "2026-01-15", description: "Fee", category: null }],
        closingBalance: null,
        asOfDate: null,
        openingBalance: "0.00",
        openingAsOfDate: "2026-01-14"
      },
      { ...deps(testDb), newId }
    );

    const transactions = await new TransactionRepository(testDb.db).listByAccountId("acc-1");
    expect(transactions).toEqual([
      expect.objectContaining({
        amountMinor: -100_00,
        description: "Fee",
        importBatchId: batch.id
      })
    ]);
  });

  it("writes nothing for an opening balance that doesn't parse for the Account's currency, even on a non-empty Account where opening is otherwise ignored", async () => {
    const testDb = createTestDb();
    await seedAccount(testDb);
    await new TransactionRepository(testDb.db).create({
      id: "txn-prior",
      accountId: "acc-1",
      amountMinor: 10_000_00,
      occurredAt: "2025-01-01T00:00:00.000Z",
      description: "Prior activity",
      trustStatus: "Confirmed",
      transferId: null,
      category: null,
      importBatchId: null
    });

    await expect(
      commitImport(
        {
          accountId: "acc-1",
          source: "statement.pdf",
          lineItems: [{ amount: "-100.00", occurredAt: "2026-01-15", description: "x", category: null }],
          closingBalance: null,
          asOfDate: null,
          openingBalance: "not-a-number",
          openingAsOfDate: "2025-01-01"
        },
        deps(testDb)
      )
    ).rejects.toBeInstanceOf(InvalidMinorUnitsError);

    expect(await new TransactionRepository(testDb.db).listByAccountId("acc-1")).toEqual([
      expect.objectContaining({ id: "txn-prior" })
    ]);
  });

  it("writes nothing for an opening balance given without its as-of date", async () => {
    const testDb = createTestDb();
    await seedAccount(testDb);

    await expect(
      commitImport(
        {
          accountId: "acc-1",
          source: "statement.pdf",
          lineItems: [{ amount: "-100.00", occurredAt: "2026-01-15", description: "x", category: null }],
          closingBalance: null,
          asOfDate: null,
          openingBalance: "39900.00",
          openingAsOfDate: null
        },
        deps(testDb)
      )
    ).rejects.toBeInstanceOf(ImportBatchOpeningBalanceError);

    expect(await new TransactionRepository(testDb.db).listByAccountId("acc-1")).toEqual([]);
  });

  it("writes nothing when a line item's category doesn't match the Income/Expense kind implied by its amount sign", async () => {
    const testDb = createTestDb();
    await seedAccount(testDb);

    await expect(
      commitImport(
        {
          accountId: "acc-1",
          source: "statement.pdf",
          // Negative amount is an Expense, "Salary" is an Income category.
          lineItems: [{ amount: "-100.00", occurredAt: "2026-01-15", description: "x", category: "Salary" }],
          closingBalance: null,
          asOfDate: null
        },
        deps(testDb)
      )
    ).rejects.toBeInstanceOf(InvalidTransactionCategoryError);

    expect(await new TransactionRepository(testDb.db).listByAccountId("acc-1")).toEqual([]);
  });

  it("with an idempotencyKey, a repeated call (a client retry after a dropped response) returns the same ImportBatch instead of creating a duplicate", async () => {
    const testDb = createTestDb();
    await seedAccount(testDb);
    const input = {
      accountId: "acc-1",
      source: "statement.pdf",
      lineItems: [
        { amount: "-1500.00", occurredAt: "2026-01-15", description: "Grocery run", category: "Grocery" as const }
      ],
      closingBalance: null,
      asOfDate: null,
      idempotencyKey: "retry-key-1"
    };

    const first = await commitImport(input, deps(testDb));
    const second = await commitImport(input, deps(testDb));

    expect(second.id).toBe(first.id);
    expect(await new ImportBatchRepository(testDb.db).listAll()).toHaveLength(1);
    expect(await new TransactionRepository(testDb.db).listByAccountId("acc-1")).toHaveLength(1);
  });

  it("without an idempotencyKey, a repeated identical call creates a second ImportBatch (unchanged default behavior)", async () => {
    const testDb = createTestDb();
    await seedAccount(testDb);
    const input = {
      accountId: "acc-1",
      source: "statement.pdf",
      lineItems: [{ amount: "-1500.00", occurredAt: "2026-01-15", description: "Grocery run", category: null }],
      closingBalance: null,
      asOfDate: null
    };

    const first = await commitImport(input, deps(testDb));
    const second = await commitImport(input, deps(testDb));

    expect(second.id).not.toBe(first.id);
  });
});

describe("resolveAccount", () => {
  it("resolves to the one existing Account matching the statement's last 4 digits and institution name, ignoring mask characters on both sides", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-rbl", name: "RBL Bank" });
    await new AccountRepository(testDb.db).create({
      id: "acc-rbl",
      institutionId: "inst-rbl",
      name: "Savings",
      accountNumber: "XXXX1602",
      currencyCode: "INR"
    });

    const result = await resolveAccount(
      {
        accountNumber: "****1602", // different mask style than the stored "XXXX1602"
        institutionName: "RBL Bank",
        accountName: "unused",
        currencyCode: "INR"
      },
      deps(testDb)
    );

    expect(result).toEqual({
      status: "resolved",
      created: false,
      account: { id: "acc-rbl", name: "Savings", currencyCode: "INR", accountNumber: "XXXX1602" },
      institution: { id: "inst-rbl", name: "RBL Bank" }
    });
    expect(await new AccountRepository(testDb.db).listAll()).toHaveLength(1);
  });

  it("returns unresolved without creating anything when nothing matches", async () => {
    const testDb = createTestDb();

    const result = await resolveAccount(
      {
        accountNumber: "XXXX9988",
        institutionName: "New Bank",
        accountName: "Statement Account",
        currencyCode: "inr"
      },
      deps(testDb)
    );

    expect(result).toEqual({
      status: "unresolved",
      reason: "no-match"
    });
    expect(await new InstitutionRepository(testDb.db).listAll()).toEqual([]);
    expect(await new AccountRepository(testDb.db).listAll()).toEqual([]);
  });

  it("returns unresolved without creating an Account when an Institution name matches but no account-number suffix does", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-rbl", name: "RBL Bank" });

    const result = await resolveAccount(
      {
        accountNumber: "XXXX1602",
        institutionName: "rbl bank",
        accountName: "New Savings",
        currencyCode: "INR"
      },
      deps(testDb)
    );

    expect(result).toEqual({
      status: "unresolved",
      reason: "no-match"
    });
    expect(await new AccountRepository(testDb.db).listAll()).toEqual([]);
    expect(await new InstitutionRepository(testDb.db).listAll()).toEqual([{ id: "inst-rbl", name: "RBL Bank" }]);
  });

  it("returns every candidate without creating anything when more than one Account matches", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-rbl", name: "RBL Bank" });
    const accounts = new AccountRepository(testDb.db);
    await accounts.create({
      id: "acc-a",
      institutionId: "inst-rbl",
      name: "Savings A",
      accountNumber: "XXXX1602",
      currencyCode: "INR"
    });
    await accounts.create({
      id: "acc-b",
      institutionId: "inst-rbl",
      name: "Savings B",
      accountNumber: "YYYY1602",
      currencyCode: "INR"
    });

    const result = await resolveAccount(
      { accountNumber: "1602", institutionName: "RBL Bank", accountName: "unused", currencyCode: "INR" },
      deps(testDb)
    );

    expect(result).toEqual({
      status: "ambiguous",
      candidates: [
        { accountId: "acc-a", name: "Savings A", accountNumber: "XXXX1602", institutionName: "RBL Bank" },
        { accountId: "acc-b", name: "Savings B", accountNumber: "YYYY1602", institutionName: "RBL Bank" }
      ]
    });
    expect(await accounts.listAll()).toHaveLength(2);
  });

  it("rejects an account number with fewer than 4 digits without creating anything", async () => {
    const testDb = createTestDb();

    await expect(
      resolveAccount(
        { accountNumber: "12", institutionName: "New Bank", accountName: "x", currencyCode: "INR" },
        deps(testDb)
      )
    ).rejects.toBeInstanceOf(InvalidAccountResolutionInputError);

    expect(await new InstitutionRepository(testDb.db).listAll()).toEqual([]);
  });

  it("does not create a duplicate Account when no Account matches but a ShareTradingAccount at the same institution does — the statement likely belongs to the other tool", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-broker", name: "Broker One" });
    await new ShareTradingAccountRepository(testDb.db).create({
      id: "sta-1",
      institutionId: "inst-broker",
      name: "US Equities",
      accountNumber: "XXXX9988",
      currencyCode: "USD"
    });

    const result = await resolveAccount(
      { accountNumber: "9988", institutionName: "Broker One", accountName: "unused", currencyCode: "USD" },
      deps(testDb)
    );

    expect(result).toEqual({
      status: "wrong-account-type",
      shareTradingAccountCandidates: [
        { shareTradingAccountId: "sta-1", name: "US Equities", accountNumber: "XXXX9988", institutionName: "Broker One" }
      ]
    });
    expect(await new AccountRepository(testDb.db).listAll()).toEqual([]);
  });

  it("rejects an empty institutionName without creating anything", async () => {
    const testDb = createTestDb();

    await expect(
      resolveAccount(
        { accountNumber: "1234", institutionName: "   ", accountName: "x", currencyCode: "INR" },
        deps(testDb)
      )
    ).rejects.toBeInstanceOf(InvalidAccountResolutionInputError);

    expect(await new InstitutionRepository(testDb.db).listAll()).toEqual([]);
  });

});

async function seedShareTradingAccount(testDb: ReturnType<typeof createTestDb>) {
  await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Broker One" });
  await new ShareTradingAccountRepository(testDb.db).create({
    id: "sta-1",
    institutionId: "inst-1",
    name: "US Equities",
    accountNumber: "9988",
    currencyCode: "USD"
  });
}

describe("listShareTradingAccounts", () => {
  it("includes each ShareTradingAccount's Institution, currency, and accountNumber", async () => {
    const testDb = createTestDb();
    await seedShareTradingAccount(testDb);

    expect(await listShareTradingAccounts(deps(testDb))).toEqual([
      {
        id: "sta-1",
        name: "US Equities",
        currencyCode: "USD",
        accountNumber: "9988",
        institution: { id: "inst-1", name: "Broker One" }
      }
    ]);
  });
});

describe("resolveShareTradingAccount", () => {
  it("resolves an existing ShareTradingAccount by account-number suffix and institution name", async () => {
    const testDb = createTestDb();
    await seedShareTradingAccount(testDb);

    const result = await resolveShareTradingAccount(
      { accountNumber: "XXXX9988", institutionName: "Broker One", accountName: "unused", currencyCode: "USD" },
      deps(testDb)
    );

    expect(result).toEqual({
      status: "resolved",
      created: false,
      shareTradingAccount: { id: "sta-1", name: "US Equities", currencyCode: "USD", accountNumber: "9988" },
      institution: { id: "inst-1", name: "Broker One" }
    });
  });

  it("returns unresolved without creating anything when nothing matches", async () => {
    const testDb = createTestDb();

    const result = await resolveShareTradingAccount(
      { accountNumber: "XXXX1234", institutionName: "New Broker", accountName: "New Equities", currencyCode: "usd" },
      deps(testDb)
    );

    expect(result).toEqual({
      status: "unresolved",
      reason: "no-match"
    });
    expect(await new InstitutionRepository(testDb.db).listAll()).toEqual([]);
    expect(await new ShareTradingAccountRepository(testDb.db).listAll()).toEqual([]);
  });

  it("returns every candidate, creating nothing, when more than one ShareTradingAccount matches", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Broker One" });
    await new ShareTradingAccountRepository(testDb.db).create({
      id: "sta-1",
      institutionId: "inst-1",
      name: "Equities A",
      accountNumber: "1234",
      currencyCode: "USD"
    });
    await new ShareTradingAccountRepository(testDb.db).create({
      id: "sta-2",
      institutionId: "inst-1",
      name: "Equities B",
      accountNumber: "991234",
      currencyCode: "USD"
    });

    const result = await resolveShareTradingAccount(
      { accountNumber: "XXXX1234", institutionName: "Broker One", accountName: "unused", currencyCode: "USD" },
      deps(testDb)
    );

    expect(result.status).toBe("ambiguous");
    expect(await new ShareTradingAccountRepository(testDb.db).listAll()).toHaveLength(2);
  });

  it("rejects an account number with fewer than 4 digits before any write", async () => {
    const testDb = createTestDb();

    await expect(
      resolveShareTradingAccount(
        { accountNumber: "XX1", institutionName: "Broker", accountName: "x", currencyCode: "USD" },
        deps(testDb)
      )
    ).rejects.toBeInstanceOf(InvalidAccountResolutionInputError);
  });

  it("does not create a duplicate ShareTradingAccount when no ShareTradingAccount matches but an Account at the same institution does", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-bank", name: "RBL Bank" });
    await new AccountRepository(testDb.db).create({
      id: "acc-1",
      institutionId: "inst-bank",
      name: "Savings",
      accountNumber: "XXXX1602",
      currencyCode: "INR"
    });

    const result = await resolveShareTradingAccount(
      { accountNumber: "1602", institutionName: "RBL Bank", accountName: "unused", currencyCode: "INR" },
      deps(testDb)
    );

    expect(result).toEqual({
      status: "wrong-account-type",
      accountCandidates: [
        { accountId: "acc-1", name: "Savings", accountNumber: "XXXX1602", institutionName: "RBL Bank" }
      ]
    });
    expect(await new ShareTradingAccountRepository(testDb.db).listAll()).toEqual([]);
  });
});

describe("stageStockImport", () => {
  it("flags a line item matching an existing StockTransaction as a likely duplicate", async () => {
    const testDb = createTestDb();
    await seedShareTradingAccount(testDb);
    await new StockTransactionRepository(testDb.db).create({
      id: "stxn-existing",
      shareTradingAccountId: "sta-1",
      scripCode: "AAPL",
      type: "Buy",
      quantity: 10,
      pricePerUnitMinor: 15_000,
      occurredAt: "2026-01-15T00:00:00.000Z",
      description: "Existing",
      trustStatus: "Confirmed",
      importBatchId: null
    });

    const result = await stageStockImport(
      {
        shareTradingAccountId: "sta-1",
        lineItems: [
          { scripCode: "AAPL", type: "Buy", quantity: "10", price: "150.00", occurredAt: "2026-01-15", description: "Buy AAPL" },
          { scripCode: "MSFT", type: "Buy", quantity: "5", price: "300.00", occurredAt: "2026-01-16", description: "Buy MSFT" }
        ]
      },
      deps(testDb)
    );

    expect(result.lineItems.map((item) => item.isDuplicate)).toEqual([true, false]);
    expect(result.shareTradingAccount.id).toBe("sta-1");
    expect(result.institution).toEqual({ id: "inst-1", name: "Broker One" });
  });

  it("flags a line item by externalRef even when its date differs from the matching existing StockTransaction", async () => {
    const testDb = createTestDb();
    await seedShareTradingAccount(testDb);
    await new StockTransactionRepository(testDb.db).create({
      id: "stxn-existing",
      shareTradingAccountId: "sta-1",
      scripCode: "AAPL",
      type: "Buy",
      quantity: 10,
      pricePerUnitMinor: 15_000,
      occurredAt: "2026-01-15T00:00:00.000Z",
      description: "Existing",
      trustStatus: "Confirmed",
      importBatchId: null,
      externalRef: "ORD123"
    });

    const result = await stageStockImport(
      {
        shareTradingAccountId: "sta-1",
        lineItems: [
          {
            scripCode: "AAPL",
            type: "Buy",
            quantity: "10",
            price: "150.00",
            occurredAt: "2026-01-20",
            description: "Buy AAPL (restated)",
            externalRef: "ORD123"
          }
        ]
      },
      deps(testDb)
    );

    expect(result.lineItems[0]?.isDuplicate).toBe(true);
  });

  it("rejects an unknown shareTradingAccountId", async () => {
    const testDb = createTestDb();

    await expect(
      stageStockImport({ shareTradingAccountId: "missing", lineItems: [] }, deps(testDb))
    ).rejects.toBeInstanceOf(DatabaseConstraintError);
  });

  it("rejects a non-positive quantity", async () => {
    const testDb = createTestDb();
    await seedShareTradingAccount(testDb);

    await expect(
      stageStockImport(
        {
          shareTradingAccountId: "sta-1",
          lineItems: [{ scripCode: "AAPL", type: "Buy", quantity: "0", price: "150.00", occurredAt: "2026-01-15", description: "Buy" }]
        },
        deps(testDb)
      )
    ).rejects.toBeInstanceOf(InvalidStockQuantityError);
  });
});

describe("commitStockImport", () => {
  it("creates one StockImportBatch and its Imported StockTransactions", async () => {
    const testDb = createTestDb();
    await seedShareTradingAccount(testDb);

    const batch = await commitStockImport(
      {
        shareTradingAccountId: "sta-1",
        source: "broker-confirmation.pdf",
        lineItems: [
          { scripCode: "aapl", type: "Buy", quantity: "10", price: "150.00", occurredAt: "2026-01-15", description: "Buy AAPL" }
        ]
      },
      deps(testDb)
    );

    expect(batch.confirmedAt).toBeNull();
    const stockTransactions = await new StockTransactionRepository(testDb.db).listByShareTradingAccountId("sta-1");
    expect(stockTransactions).toEqual([
      expect.objectContaining({ scripCode: "AAPL", trustStatus: "Imported", importBatchId: batch.id })
    ]);
  });

  it("persists externalRef and flags a Suspected Duplicate match against an existing StockTransaction with the same ref", async () => {
    const testDb = createTestDb();
    await seedShareTradingAccount(testDb);
    await new StockTransactionRepository(testDb.db).create({
      id: "stxn-existing",
      shareTradingAccountId: "sta-1",
      scripCode: "AAPL",
      type: "Buy",
      quantity: 10,
      pricePerUnitMinor: 15_000,
      occurredAt: "2026-01-15T00:00:00.000Z",
      description: "Existing",
      trustStatus: "Confirmed",
      importBatchId: null,
      externalRef: "ORD123"
    });
    let idCount = 0;
    const newId = () => `id-${++idCount}`;

    await commitStockImport(
      {
        shareTradingAccountId: "sta-1",
        source: "broker-confirmation.pdf",
        lineItems: [
          {
            scripCode: "AAPL",
            type: "Buy",
            quantity: "10",
            price: "150.00",
            occurredAt: "2026-01-15",
            description: "Buy AAPL [ORD123]",
            externalRef: "ORD123"
          }
        ]
      },
      { ...deps(testDb), newId }
    );

    const stockTransactionRepository = new StockTransactionRepository(testDb.db);
    const transactions = await stockTransactionRepository.listByShareTradingAccountId("sta-1");
    const imported = transactions.find((transaction) => transaction.id !== "stxn-existing");
    expect(imported?.externalRef).toBe("ORD123");
    expect(imported?.possibleDuplicateOfTransactionId).toBe("stxn-existing");
  });

  it("rejects an empty line-item list, writing nothing", async () => {
    const testDb = createTestDb();
    await seedShareTradingAccount(testDb);

    await expect(
      commitStockImport({ shareTradingAccountId: "sta-1", source: "x", lineItems: [] }, deps(testDb))
    ).rejects.toBeInstanceOf(EmptyStockImportBatchError);
    expect(await new StockImportBatchRepository(testDb.db).listAll()).toEqual([]);
  });

  it("rejects an unknown shareTradingAccountId, writing nothing", async () => {
    const testDb = createTestDb();

    await expect(
      commitStockImport(
        {
          shareTradingAccountId: "missing",
          source: "x",
          lineItems: [{ scripCode: "AAPL", type: "Buy", quantity: "10", price: "150.00", occurredAt: "2026-01-15", description: "Buy" }]
        },
        deps(testDb)
      )
    ).rejects.toBeInstanceOf(DatabaseConstraintError);
  });

  it("with an idempotencyKey, a repeated call returns the same StockImportBatch instead of creating a duplicate", async () => {
    const testDb = createTestDb();
    await seedShareTradingAccount(testDb);
    const input = {
      shareTradingAccountId: "sta-1",
      source: "broker-confirmation.pdf",
      lineItems: [
        { scripCode: "AAPL", type: "Buy" as const, quantity: "10", price: "150.00", occurredAt: "2026-01-15", description: "Buy AAPL" }
      ],
      idempotencyKey: "retry-key-1"
    };

    const first = await commitStockImport(input, deps(testDb));
    const second = await commitStockImport(input, deps(testDb));

    expect(second.id).toBe(first.id);
    expect(await new StockImportBatchRepository(testDb.db).listAll()).toHaveLength(1);
  });
});
