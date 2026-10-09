import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { describe, expect, it } from "vitest";

import { DatabaseConfigurationError } from "@/db/errors";
import {
  getAccountRepository,
  getAdjustmentRepository,
  getBalanceSnapshotRepository,
  getFixedDepositRepository,
  getImportBatchRepository,
  getInstitutionRepository,
  getEmailSyncCursorRepository,
  getReconciliationRepository,
  getShareTradingAccountRepository,
  getStockImportBatchRepository,
  getStockTransactionRepository,
  getTransactionRepository,
  getTransferRepository,
  getUnresolvedEmailAlertRepository
} from "@/db/repository-factory";
import { createTestDb } from "@/db/repositories/test-db";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

describe("getInstitutionRepository", () => {
  it("returns the SQLite repository, operating on the given db, when there is no owner", async () => {
    const testDb = createTestDb();
    const repo = await getInstitutionRepository({
      getCurrentOwnerId: async () => null,
      isCloudMode: () => false,
      db: testDb.db
    });

    await repo.create({ id: "inst-1", name: "Local Bank" });

    expect(await repo.listAll()).toEqual([{ id: "inst-1", name: "Local Bank" }]);
  });

  it("refuses to fall back to SQLite when cloud mode has no signed-in Owner", async () => {
    await expect(
      getInstitutionRepository({
        getCurrentOwnerId: async () => null,
        isCloudMode: () => true
      })
    ).rejects.toThrow(DatabaseConfigurationError);
  });

  it("returns a Postgres repository scoped to the resolved owner id when one exists", async () => {
    const ownerId = randomUUID();
    const repo = await getInstitutionRepository({
      getCurrentOwnerId: async () => ownerId,
      isCloudMode: () => true,
      postgresConnectionString: TEST_DATABASE_URL
    });
    const institution = { id: randomUUID(), name: "Cloud Bank" };

    const admin = postgres(TEST_DATABASE_URL, { max: 1 });
    try {
      await repo.create(institution);

      expect(await repo.listAll()).toEqual([institution]);
    } finally {
      await admin`delete from institutions where id = ${institution.id}`;
      await admin.end();
    }
  });
});

describe("getAccountRepository", () => {
  it("returns the SQLite repository, operating on the given db, when there is no owner", async () => {
    const testDb = createTestDb();
    await getInstitutionRepository({
      getCurrentOwnerId: async () => null,
      isCloudMode: () => false,
      db: testDb.db
    }).then((institutions) => institutions.create({ id: "inst-1", name: "Local Bank" }));
    const repo = await getAccountRepository({
      getCurrentOwnerId: async () => null,
      isCloudMode: () => false,
      db: testDb.db
    });

    await repo.create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Savings",
      accountNumber: null,
      currencyCode: "INR"
    });

    expect(await repo.listAll()).toEqual([
      { id: "acc-1", institutionId: "inst-1", name: "Savings", accountNumber: null, currencyCode: "INR" }
    ]);
  });

  it("refuses to fall back to SQLite when cloud mode has no signed-in Owner", async () => {
    await expect(
      getAccountRepository({
        getCurrentOwnerId: async () => null,
        isCloudMode: () => true
      })
    ).rejects.toThrow(DatabaseConfigurationError);
  });

  it("returns a Postgres repository scoped to the resolved owner id when one exists", async () => {
    const ownerId = randomUUID();
    const institutionRepo = await getInstitutionRepository({
      getCurrentOwnerId: async () => ownerId,
      isCloudMode: () => true,
      postgresConnectionString: TEST_DATABASE_URL
    });
    const institution = { id: randomUUID(), name: "Cloud Bank" };
    await institutionRepo.create(institution);

    const repo = await getAccountRepository({
      getCurrentOwnerId: async () => ownerId,
      isCloudMode: () => true,
      postgresConnectionString: TEST_DATABASE_URL
    });
    const account = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "Cloud Savings",
      accountNumber: null,
      currencyCode: "INR"
    };

    const admin = postgres(TEST_DATABASE_URL, { max: 1 });
    try {
      await repo.create(account);

      expect(await repo.listAll()).toEqual([account]);
    } finally {
      await admin`delete from accounts where id = ${account.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
      await admin.end();
    }
  });
});

describe("getFixedDepositRepository", () => {
  it("returns the SQLite repository, operating on the given db, when there is no owner", async () => {
    const testDb = createTestDb();
    const deps = { getCurrentOwnerId: async () => null, isCloudMode: () => false, db: testDb.db };
    await (await getInstitutionRepository(deps)).create({ id: "inst-1", name: "Local Bank" });
    await (await getAccountRepository(deps)).create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Savings",
      accountNumber: null,
      currencyCode: "INR"
    });
    const repo = await getFixedDepositRepository(deps);

    await repo.create({
      id: "fd-1",
      name: "Term deposit",
      accountNumber: null,
      institutionId: "inst-1",
      linkedAccountId: "acc-1",
      principalMinor: 100_000,
      originalPrincipalMinor: 100_000,
      currencyCode: "INR",
      interestRateBps: 650,
      openedDate: "2026-01-01",
      maturityDate: "2027-01-01",
      status: "Open"
    });

    expect((await repo.listAll()).map((fd) => fd.id)).toEqual(["fd-1"]);
  });

  it("refuses to fall back to SQLite when cloud mode has no signed-in Owner", async () => {
    await expect(
      getFixedDepositRepository({
        getCurrentOwnerId: async () => null,
        isCloudMode: () => true
      })
    ).rejects.toThrow(DatabaseConfigurationError);
  });

  it("returns a Postgres repository scoped to the resolved owner id when one exists", async () => {
    const ownerId = randomUUID();
    const cloudDeps = {
      getCurrentOwnerId: async () => ownerId,
      isCloudMode: () => true,
      postgresConnectionString: TEST_DATABASE_URL
    };
    const institution = { id: randomUUID(), name: "Cloud Bank" };
    await (await getInstitutionRepository(cloudDeps)).create(institution);
    const account = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "Cloud Savings",
      accountNumber: null,
      currencyCode: "INR"
    };
    await (await getAccountRepository(cloudDeps)).create(account);
    const repo = await getFixedDepositRepository(cloudDeps);
    const fixedDeposit = {
      id: randomUUID(),
      name: "Cloud Term deposit",
      accountNumber: null,
      institutionId: institution.id,
      linkedAccountId: account.id,
      principalMinor: 100_000,
      originalPrincipalMinor: 100_000,
      currencyCode: "INR",
      interestRateBps: 650,
      openedDate: "2026-01-01",
      maturityDate: "2027-01-01",
      status: "Open" as const
    };

    const admin = postgres(TEST_DATABASE_URL, { max: 1 });
    try {
      await repo.create(fixedDeposit);

      expect(await repo.listAll()).toEqual([fixedDeposit]);
    } finally {
      await admin`delete from fixed_deposits where id = ${fixedDeposit.id}`;
      await admin`delete from accounts where id = ${account.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
      await admin.end();
    }
  });
});

describe("getShareTradingAccountRepository", () => {
  it("returns the SQLite repository, operating on the given db, when there is no owner", async () => {
    const testDb = createTestDb();
    const deps = { getCurrentOwnerId: async () => null, isCloudMode: () => false, db: testDb.db };
    await (await getInstitutionRepository(deps)).create({ id: "inst-1", name: "Local Broker" });
    const repo = await getShareTradingAccountRepository(deps);

    await repo.create({
      id: "sta-1",
      institutionId: "inst-1",
      name: "US Equities",
      accountNumber: null,
      currencyCode: "USD"
    });

    expect((await repo.listAll()).map((sta) => sta.id)).toEqual(["sta-1"]);
  });

  it("refuses to fall back to SQLite when cloud mode has no signed-in Owner", async () => {
    await expect(
      getShareTradingAccountRepository({ getCurrentOwnerId: async () => null, isCloudMode: () => true })
    ).rejects.toThrow(DatabaseConfigurationError);
  });

  it("returns a Postgres repository scoped to the resolved owner id when one exists", async () => {
    const ownerId = randomUUID();
    const cloudDeps = {
      getCurrentOwnerId: async () => ownerId,
      isCloudMode: () => true,
      postgresConnectionString: TEST_DATABASE_URL
    };
    const institution = { id: randomUUID(), name: "Cloud Broker" };
    await (await getInstitutionRepository(cloudDeps)).create(institution);
    const repo = await getShareTradingAccountRepository(cloudDeps);
    const shareTradingAccount = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "Cloud US Equities",
      accountNumber: null,
      currencyCode: "USD"
    };

    const admin = postgres(TEST_DATABASE_URL, { max: 1 });
    try {
      await repo.create(shareTradingAccount);

      expect(await repo.listAll()).toEqual([shareTradingAccount]);
    } finally {
      await admin`delete from share_trading_accounts where id = ${shareTradingAccount.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
      await admin.end();
    }
  });
});

describe("getStockTransactionRepository", () => {
  it("returns the SQLite repository, operating on the given db, when there is no owner", async () => {
    const testDb = createTestDb();
    const deps = { getCurrentOwnerId: async () => null, isCloudMode: () => false, db: testDb.db };
    await (await getInstitutionRepository(deps)).create({ id: "inst-1", name: "Local Broker" });
    await (await getShareTradingAccountRepository(deps)).create({
      id: "sta-1",
      institutionId: "inst-1",
      name: "US Equities",
      accountNumber: null,
      currencyCode: "USD"
    });
    const repo = await getStockTransactionRepository(deps);

    await repo.create({
      id: "stxn-1",
      shareTradingAccountId: "sta-1",
      scripCode: "AAPL",
      type: "Buy",
      quantity: 10,
      pricePerUnitMinor: 15_000,
      occurredAt: "2026-01-01T10:00:00.000Z",
      description: "Buy AAPL",
      trustStatus: "Confirmed",
      importBatchId: null
    });

    expect((await repo.listByShareTradingAccountId("sta-1")).map((stxn) => stxn.id)).toEqual(["stxn-1"]);
  });

  it("refuses to fall back to SQLite when cloud mode has no signed-in Owner", async () => {
    await expect(
      getStockTransactionRepository({ getCurrentOwnerId: async () => null, isCloudMode: () => true })
    ).rejects.toThrow(DatabaseConfigurationError);
  });

  it("returns a Postgres repository scoped to the resolved owner id when one exists", async () => {
    const ownerId = randomUUID();
    const cloudDeps = {
      getCurrentOwnerId: async () => ownerId,
      isCloudMode: () => true,
      postgresConnectionString: TEST_DATABASE_URL
    };
    const institution = { id: randomUUID(), name: "Cloud Broker" };
    await (await getInstitutionRepository(cloudDeps)).create(institution);
    const shareTradingAccount = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "Cloud US Equities",
      accountNumber: null,
      currencyCode: "USD"
    };
    await (await getShareTradingAccountRepository(cloudDeps)).create(shareTradingAccount);
    const repo = await getStockTransactionRepository(cloudDeps);
    const stockTransaction = {
      id: randomUUID(),
      shareTradingAccountId: shareTradingAccount.id,
      scripCode: "AAPL",
      type: "Buy" as const,
      quantity: 10,
      pricePerUnitMinor: 15_000,
      occurredAt: "2026-01-01T10:00:00.000Z",
      description: "Cloud Buy AAPL",
      trustStatus: "Confirmed" as const,
      importBatchId: null,
      externalRef: null,
      possibleDuplicateOfTransactionId: null
    };

    const admin = postgres(TEST_DATABASE_URL, { max: 1 });
    try {
      await repo.create(stockTransaction);

      expect(await repo.listByShareTradingAccountId(shareTradingAccount.id)).toEqual([stockTransaction]);
    } finally {
      await admin`delete from stock_transactions where id = ${stockTransaction.id}`;
      await admin`delete from share_trading_accounts where id = ${shareTradingAccount.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
      await admin.end();
    }
  });
});

describe("getStockImportBatchRepository", () => {
  it("returns the SQLite repository, operating on the given db, when there is no owner", async () => {
    const testDb = createTestDb();
    const deps = { getCurrentOwnerId: async () => null, isCloudMode: () => false, db: testDb.db };
    await (await getInstitutionRepository(deps)).create({ id: "inst-1", name: "Local Broker" });
    await (await getShareTradingAccountRepository(deps)).create({
      id: "sta-1",
      institutionId: "inst-1",
      name: "US Equities",
      accountNumber: null,
      currencyCode: "USD"
    });
    const repo = await getStockImportBatchRepository(deps);

    await repo.create(
      { id: "batch-1", shareTradingAccountId: "sta-1", source: "mcp", createdAt: "2026-02-01T00:00:00.000Z" },
      [{ id: "stxn-1", scripCode: "AAPL", type: "Buy", quantity: "10", price: "150.00", occurredAt: "2026-01-15", description: "Buy" }]
    );

    expect((await repo.listAll()).map((batch) => batch.id)).toEqual(["batch-1"]);
  });

  it("refuses to fall back to SQLite when cloud mode has no signed-in Owner", async () => {
    await expect(
      getStockImportBatchRepository({ getCurrentOwnerId: async () => null, isCloudMode: () => true })
    ).rejects.toThrow(DatabaseConfigurationError);
  });

  it("returns a Postgres repository scoped to the resolved owner id when one exists", async () => {
    const ownerId = randomUUID();
    const cloudDeps = {
      getCurrentOwnerId: async () => ownerId,
      isCloudMode: () => true,
      postgresConnectionString: TEST_DATABASE_URL
    };
    const institution = { id: randomUUID(), name: "Cloud Broker" };
    await (await getInstitutionRepository(cloudDeps)).create(institution);
    const shareTradingAccount = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "Cloud US Equities",
      accountNumber: null,
      currencyCode: "USD"
    };
    await (await getShareTradingAccountRepository(cloudDeps)).create(shareTradingAccount);
    const repo = await getStockImportBatchRepository(cloudDeps);
    const batchId = randomUUID();
    const stxnId = randomUUID();

    const admin = postgres(TEST_DATABASE_URL, { max: 1 });
    try {
      await repo.create(
        { id: batchId, shareTradingAccountId: shareTradingAccount.id, source: "mcp", createdAt: "2026-02-01T00:00:00.000Z" },
        [{ id: stxnId, scripCode: "AAPL", type: "Buy", quantity: "10", price: "150.00", occurredAt: "2026-01-15", description: "Buy" }]
      );

      expect((await repo.listAll()).map((batch) => batch.id)).toEqual([batchId]);
    } finally {
      await admin`delete from stock_transactions where id = ${stxnId}`;
      await admin`delete from stock_import_batches where id = ${batchId}`;
      await admin`delete from share_trading_accounts where id = ${shareTradingAccount.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
      await admin.end();
    }
  });
});

describe("getTransactionRepository", () => {
  it("returns the SQLite repository, operating on the given db, when there is no owner", async () => {
    const testDb = createTestDb();
    const deps = { getCurrentOwnerId: async () => null, isCloudMode: () => false, db: testDb.db };
    await (await getInstitutionRepository(deps)).create({ id: "inst-1", name: "Local Bank" });
    await (await getAccountRepository(deps)).create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Savings",
      accountNumber: null,
      currencyCode: "INR"
    });
    const repo = await getTransactionRepository(deps);

    await repo.create({
      id: "txn-1",
      accountId: "acc-1",
      amountMinor: 120_000,
      occurredAt: "2026-01-01T09:00:00.000Z",
      description: "Opening deposit",
      trustStatus: "Imported",
      transferId: null,
      category: "Other",
      importBatchId: null
    });

    expect((await repo.listByAccountId("acc-1")).map((txn) => txn.id)).toEqual(["txn-1"]);
  });

  it("refuses to fall back to SQLite when cloud mode has no signed-in Owner", async () => {
    await expect(
      getTransactionRepository({
        getCurrentOwnerId: async () => null,
        isCloudMode: () => true
      })
    ).rejects.toThrow(DatabaseConfigurationError);
  });

  it("returns a Postgres repository scoped to the resolved owner id when one exists", async () => {
    const ownerId = randomUUID();
    const cloudDeps = {
      getCurrentOwnerId: async () => ownerId,
      isCloudMode: () => true,
      postgresConnectionString: TEST_DATABASE_URL
    };
    const institution = { id: randomUUID(), name: "Cloud Bank" };
    await (await getInstitutionRepository(cloudDeps)).create(institution);
    const account = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "Cloud Savings",
      accountNumber: null,
      currencyCode: "INR"
    };
    await (await getAccountRepository(cloudDeps)).create(account);
    const repo = await getTransactionRepository(cloudDeps);
    const transaction = {
      id: randomUUID(),
      accountId: account.id,
      amountMinor: 120_000,
      occurredAt: "2026-01-01T09:00:00.000Z",
      description: "Cloud opening deposit",
      trustStatus: "Imported" as const,
      transferId: null,
      category: "Other" as const,
      importBatchId: null,
      externalRef: null,
      possibleDuplicateOfTransactionId: null
    };

    const admin = postgres(TEST_DATABASE_URL, { max: 1 });
    try {
      await repo.create(transaction);

      expect(await repo.listByAccountId(account.id)).toEqual([transaction]);
    } finally {
      await admin`delete from transactions where id = ${transaction.id}`;
      await admin`delete from accounts where id = ${account.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
      await admin.end();
    }
  });
});

describe("getBalanceSnapshotRepository", () => {
  it("returns the SQLite repository, operating on the given db, when there is no owner", async () => {
    const testDb = createTestDb();
    const deps = { getCurrentOwnerId: async () => null, isCloudMode: () => false, db: testDb.db };
    await (await getInstitutionRepository(deps)).create({ id: "inst-1", name: "Local Bank" });
    await (await getAccountRepository(deps)).create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Savings",
      accountNumber: null,
      currencyCode: "INR"
    });
    const repo = await getBalanceSnapshotRepository(deps);

    await repo.create({ id: "snap-1", accountId: "acc-1", asOfDate: "2026-01-31", balanceMinor: 100_000 });

    expect((await repo.listByAccountId("acc-1")).map((s) => s.id)).toEqual(["snap-1"]);
  });

  it("refuses to fall back to SQLite when cloud mode has no signed-in Owner", async () => {
    await expect(
      getBalanceSnapshotRepository({ getCurrentOwnerId: async () => null, isCloudMode: () => true })
    ).rejects.toThrow(DatabaseConfigurationError);
  });

  it("returns a Postgres repository scoped to the resolved owner id when one exists", async () => {
    const ownerId = randomUUID();
    const cloudDeps = {
      getCurrentOwnerId: async () => ownerId,
      isCloudMode: () => true,
      postgresConnectionString: TEST_DATABASE_URL
    };
    const institution = { id: randomUUID(), name: "Cloud Bank" };
    await (await getInstitutionRepository(cloudDeps)).create(institution);
    const account = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "Cloud Savings",
      accountNumber: null,
      currencyCode: "INR"
    };
    await (await getAccountRepository(cloudDeps)).create(account);
    const repo = await getBalanceSnapshotRepository(cloudDeps);
    const snapshot = { id: randomUUID(), accountId: account.id, asOfDate: "2026-01-31", balanceMinor: 100_000 };

    const admin = postgres(TEST_DATABASE_URL, { max: 1 });
    try {
      await repo.create(snapshot);

      expect(await repo.listByAccountId(account.id)).toEqual([snapshot]);
    } finally {
      await admin`delete from balance_snapshots where id = ${snapshot.id}`;
      await admin`delete from accounts where id = ${account.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
      await admin.end();
    }
  });
});

describe("getTransferRepository", () => {
  it("returns the SQLite repository, operating on the given db, when there is no owner", async () => {
    const testDb = createTestDb();
    const deps = { getCurrentOwnerId: async () => null, isCloudMode: () => false, db: testDb.db };
    await (await getInstitutionRepository(deps)).create({ id: "inst-1", name: "Local Bank" });
    await (await getAccountRepository(deps)).create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Checking",
      accountNumber: null,
      currencyCode: "INR"
    });
    await (await getAccountRepository(deps)).create({
      id: "acc-2",
      institutionId: "inst-1",
      name: "Savings",
      accountNumber: null,
      currencyCode: "INR"
    });
    const repo = await getTransferRepository(deps);

    await repo.create({
      id: "transfer-1",
      sourceAccountId: "acc-1",
      sourceFixedDepositId: null,
      sourceAmountMinor: 50_000,
      sourceCurrencyCode: "INR",
      destinationAccountId: "acc-2",
      destinationFixedDepositId: null,
      destinationAmountMinor: 50_000,
      destinationCurrencyCode: "INR",
      occurredAt: "2026-01-05T00:00:00.000Z",
      description: "Move to savings",
      purpose: "general"
    });

    expect((await repo.listByLeg("acc-1")).map((t) => t.id)).toEqual(["transfer-1"]);
  });

  it("refuses to fall back to SQLite when cloud mode has no signed-in Owner", async () => {
    await expect(
      getTransferRepository({ getCurrentOwnerId: async () => null, isCloudMode: () => true })
    ).rejects.toThrow(DatabaseConfigurationError);
  });

  it("returns a Postgres repository scoped to the resolved owner id when one exists", async () => {
    const ownerId = randomUUID();
    const cloudDeps = {
      getCurrentOwnerId: async () => ownerId,
      isCloudMode: () => true,
      postgresConnectionString: TEST_DATABASE_URL
    };
    const institution = { id: randomUUID(), name: "Cloud Bank" };
    await (await getInstitutionRepository(cloudDeps)).create(institution);
    const accountA = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "Checking",
      accountNumber: null,
      currencyCode: "INR"
    };
    const accountB = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "Savings",
      accountNumber: null,
      currencyCode: "INR"
    };
    await (await getAccountRepository(cloudDeps)).create(accountA);
    await (await getAccountRepository(cloudDeps)).create(accountB);
    const repo = await getTransferRepository(cloudDeps);
    const transferId = randomUUID();

    const admin = postgres(TEST_DATABASE_URL, { max: 1 });
    try {
      await repo.create({
        id: transferId,
        sourceAccountId: accountA.id,
        sourceFixedDepositId: null,
        sourceAmountMinor: 50_000,
        sourceCurrencyCode: "INR",
        destinationAccountId: accountB.id,
        destinationFixedDepositId: null,
        destinationAmountMinor: 50_000,
        destinationCurrencyCode: "INR",
        occurredAt: "2026-01-05T00:00:00.000Z",
        description: "Move to savings",
        purpose: "general"
      });

      expect((await repo.listByLeg(accountA.id)).map((t) => t.id)).toEqual([transferId]);
    } finally {
      await admin`delete from transactions where transfer_id = ${transferId}`;
      await admin`delete from transfers where id = ${transferId}`;
      await admin`delete from accounts where id in (${accountA.id}, ${accountB.id})`;
      await admin`delete from institutions where id = ${institution.id}`;
      await admin.end();
    }
  });
});

describe("getReconciliationRepository", () => {
  it("returns the SQLite repository, operating on the given db, when there is no owner", async () => {
    const testDb = createTestDb();
    const deps = { getCurrentOwnerId: async () => null, isCloudMode: () => false, db: testDb.db };
    await (await getInstitutionRepository(deps)).create({ id: "inst-1", name: "Local Bank" });
    await (await getAccountRepository(deps)).create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Checking",
      accountNumber: null,
      currencyCode: "INR"
    });
    await (await getBalanceSnapshotRepository(deps)).create({
      id: "snap-1",
      accountId: "acc-1",
      asOfDate: "2026-01-31",
      balanceMinor: 0
    });
    const repo = await getReconciliationRepository(deps);

    await repo.create({
      id: "recon-1",
      accountId: "acc-1",
      balanceSnapshotId: "snap-1",
      reconciledAt: "2026-02-01T00:00:00.000Z"
    });

    expect((await repo.listByAccountId("acc-1")).map((r) => r.id)).toEqual(["recon-1"]);
  });

  it("refuses to fall back to SQLite when cloud mode has no signed-in Owner", async () => {
    await expect(
      getReconciliationRepository({ getCurrentOwnerId: async () => null, isCloudMode: () => true })
    ).rejects.toThrow(DatabaseConfigurationError);
  });

  it("returns a Postgres repository scoped to the resolved owner id when one exists", async () => {
    const ownerId = randomUUID();
    const cloudDeps = {
      getCurrentOwnerId: async () => ownerId,
      isCloudMode: () => true,
      postgresConnectionString: TEST_DATABASE_URL
    };
    const institution = { id: randomUUID(), name: "Cloud Bank" };
    await (await getInstitutionRepository(cloudDeps)).create(institution);
    const account = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "Checking",
      accountNumber: null,
      currencyCode: "INR"
    };
    await (await getAccountRepository(cloudDeps)).create(account);
    const snapshot = { id: randomUUID(), accountId: account.id, asOfDate: "2026-01-31", balanceMinor: 0 };
    await (await getBalanceSnapshotRepository(cloudDeps)).create(snapshot);
    const repo = await getReconciliationRepository(cloudDeps);
    const reconciliationId = randomUUID();

    const admin = postgres(TEST_DATABASE_URL, { max: 1 });
    try {
      await repo.create({
        id: reconciliationId,
        accountId: account.id,
        balanceSnapshotId: snapshot.id,
        reconciledAt: "2026-02-01T00:00:00.000Z"
      });

      expect((await repo.listByAccountId(account.id)).map((r) => r.id)).toEqual([reconciliationId]);
    } finally {
      await admin`delete from reconciliations where id = ${reconciliationId}`;
      await admin`delete from balance_snapshots where id = ${snapshot.id}`;
      await admin`delete from accounts where id = ${account.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
      await admin.end();
    }
  });
});

describe("getImportBatchRepository", () => {
  it("returns the SQLite repository, operating on the given db, when there is no owner", async () => {
    const testDb = createTestDb();
    const deps = { getCurrentOwnerId: async () => null, isCloudMode: () => false, db: testDb.db };
    await (await getInstitutionRepository(deps)).create({ id: "inst-1", name: "Local Bank" });
    await (await getAccountRepository(deps)).create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Savings",
      accountNumber: null,
      currencyCode: "INR"
    });
    const repo = await getImportBatchRepository(deps);

    await repo.create(
      {
        id: "batch-1",
        accountId: "acc-1",
        source: "statement.pdf",
        createdAt: "2026-02-01T00:00:00.000Z",
        closingBalance: null,
        asOfDate: null
      },
      [{ id: "txn-1", amount: "-1500.00", occurredAt: "2026-01-15", description: "Grocery run", category: null }]
    );

    expect((await repo.listAll()).map((batch) => batch.id)).toEqual(["batch-1"]);
  });

  it("refuses to fall back to SQLite when cloud mode has no signed-in Owner", async () => {
    await expect(
      getImportBatchRepository({ getCurrentOwnerId: async () => null, isCloudMode: () => true })
    ).rejects.toThrow(DatabaseConfigurationError);
  });

  // ADR-0010: ImportBatch has a Postgres port, unlike the earlier local-only restriction.
  it("returns a Postgres repository scoped to the resolved owner id when one exists", async () => {
    const ownerId = randomUUID();
    const cloudDeps = {
      getCurrentOwnerId: async () => ownerId,
      isCloudMode: () => true,
      postgresConnectionString: TEST_DATABASE_URL
    };
    const institution = { id: randomUUID(), name: "Cloud Bank" };
    await (await getInstitutionRepository(cloudDeps)).create(institution);
    const account = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "Cloud Savings",
      accountNumber: null,
      currencyCode: "INR"
    };
    await (await getAccountRepository(cloudDeps)).create(account);
    const repo = await getImportBatchRepository(cloudDeps);
    const batchId = randomUUID();

    await repo.create(
      {
        id: batchId,
        accountId: account.id,
        source: "statement.pdf",
        createdAt: "2026-02-01T00:00:00.000Z",
        closingBalance: null,
        asOfDate: null
      },
      [{ id: randomUUID(), amount: "-15.00", occurredAt: "2026-01-15", description: "Grocery run", category: null }]
    );

    expect((await repo.listAll()).map((batch) => batch.id)).toEqual([batchId]);
  });
});

describe("getUnresolvedEmailAlertRepository", () => {
  it("returns the SQLite repository, operating on the given db, when there is no owner", async () => {
    const testDb = createTestDb();
    const repo = await getUnresolvedEmailAlertRepository({
      getCurrentOwnerId: async () => null,
      isCloudMode: () => false,
      db: testDb.db
    });

    expect(await repo.listAll()).toEqual([]);
  });

  it("refuses to fall back to SQLite when cloud mode has no signed-in Owner", async () => {
    await expect(
      getUnresolvedEmailAlertRepository({ getCurrentOwnerId: async () => null, isCloudMode: () => true })
    ).rejects.toThrow(DatabaseConfigurationError);
  });

  it("returns a Postgres repository scoped to the resolved owner id when one exists", async () => {
    const ownerId = randomUUID();
    const repo = await getUnresolvedEmailAlertRepository({
      getCurrentOwnerId: async () => ownerId,
      isCloudMode: () => true,
      postgresConnectionString: TEST_DATABASE_URL
    });
    const id = randomUUID();

    await repo.save({
      id,
      mailbox: "inbox@example.com",
      messageUid: "uid-1",
      detectedAt: "2026-09-09T15:02:13.000Z",
      failureReason: "no-match (RBL Bank …1602)",
      draft: {
        direction: "credit",
        amount: "1282.05",
        currencyCode: "INR",
        occurredAt: "2026-09-09",
        accountNumberSuffix: "1602",
        institutionName: "RBL Bank",
        description: "NEFT",
        reference: null,
        balance: null
      },
      invalidFields: []
    });

    expect((await repo.listAll()).map((alert) => alert.id)).toEqual([id]);
  });
});

describe("getEmailSyncCursorRepository", () => {
  it("returns the SQLite repository, operating on the given db, when there is no owner", async () => {
    const testDb = createTestDb();
    const repo = await getEmailSyncCursorRepository({
      getCurrentOwnerId: async () => null,
      isCloudMode: () => false,
      db: testDb.db
    });

    expect(await repo.get("inbox@example.com")).toBeNull();
  });

  it("refuses to fall back to SQLite when cloud mode has no signed-in Owner", async () => {
    await expect(
      getEmailSyncCursorRepository({ getCurrentOwnerId: async () => null, isCloudMode: () => true })
    ).rejects.toThrow(DatabaseConfigurationError);
  });

  it("returns a Postgres repository scoped to the resolved owner id when one exists", async () => {
    const ownerId = randomUUID();
    const repo = await getEmailSyncCursorRepository({
      getCurrentOwnerId: async () => ownerId,
      isCloudMode: () => true,
      postgresConnectionString: TEST_DATABASE_URL
    });

    await repo.save({
      mailbox: "inbox@example.com",
      uidValidity: "1757000000",
      lastMessageUid: 120,
      updatedAt: "2026-09-09T15:02:13.000Z"
    });

    expect(await repo.get("inbox@example.com")).toEqual({
      mailbox: "inbox@example.com",
      uidValidity: "1757000000",
      lastMessageUid: 120,
      updatedAt: "2026-09-09T15:02:13.000Z"
    });
  });
});

describe("getAdjustmentRepository", () => {
  async function seedDiscrepancy(deps: {
    getCurrentOwnerId: () => Promise<string | null>;
    isCloudMode: () => boolean;
    db?: import("@/db/client").DrizzleDb;
    postgresConnectionString?: string;
  }) {
    const institution = { id: randomUUID(), name: "Bank" };
    const account = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "Checking",
      accountNumber: null,
      currencyCode: "INR"
    };
    const snapshot = { id: randomUUID(), accountId: account.id, asOfDate: "2026-01-31", balanceMinor: 5_000 };
    const reconciliationId = randomUUID();

    await (await getInstitutionRepository(deps)).create(institution);
    await (await getAccountRepository(deps)).create(account);
    await (await getBalanceSnapshotRepository(deps)).create(snapshot);
    await (await getReconciliationRepository(deps)).create({
      id: reconciliationId,
      accountId: account.id,
      balanceSnapshotId: snapshot.id,
      reconciledAt: "2026-02-01T00:00:00.000Z"
    });
    const discrepancy = await (
      await getReconciliationRepository(deps)
    ).getDiscrepancyByReconciliationId(reconciliationId);

    return { institution, account, snapshot, reconciliationId, discrepancyId: discrepancy!.id };
  }

  it("returns the SQLite repository, operating on the given db, when there is no owner", async () => {
    const testDb = createTestDb();
    const deps = { getCurrentOwnerId: async () => null, isCloudMode: () => false, db: testDb.db };
    const { account, discrepancyId } = await seedDiscrepancy(deps);
    const repo = await getAdjustmentRepository(deps);

    const adjustment = await repo.create(
      {
        id: "adj-txn-1",
        accountId: account.id,
        amountMinor: 5_000,
        occurredAt: "2026-02-01T00:00:00.000Z",
        description: "Corrected balance"
      },
      discrepancyId
    );

    expect(await repo.getByTransactionId("adj-txn-1")).toEqual(adjustment);
  });

  it("refuses to fall back to SQLite when cloud mode has no signed-in Owner", async () => {
    await expect(
      getAdjustmentRepository({ getCurrentOwnerId: async () => null, isCloudMode: () => true })
    ).rejects.toThrow(DatabaseConfigurationError);
  });

  it("returns a Postgres repository scoped to the resolved owner id when one exists", async () => {
    const ownerId = randomUUID();
    const cloudDeps = {
      getCurrentOwnerId: async () => ownerId,
      isCloudMode: () => true,
      postgresConnectionString: TEST_DATABASE_URL
    };
    const { institution, account, snapshot, reconciliationId, discrepancyId } =
      await seedDiscrepancy(cloudDeps);
    const repo = await getAdjustmentRepository(cloudDeps);
    const transactionId = randomUUID();

    const admin = postgres(TEST_DATABASE_URL, { max: 1 });
    try {
      const adjustment = await repo.create(
        {
          id: transactionId,
          accountId: account.id,
          amountMinor: 5_000,
          occurredAt: "2026-02-01T00:00:00.000Z",
          description: "Corrected balance"
        },
        discrepancyId
      );

      expect(await repo.getByTransactionId(transactionId)).toEqual(adjustment);
    } finally {
      await admin`delete from adjustments where transaction_id = ${transactionId}`;
      await admin`delete from transactions where id = ${transactionId}`;
      await admin`delete from discrepancies where id = ${discrepancyId}`;
      await admin`delete from reconciliations where id = ${reconciliationId}`;
      await admin`delete from balance_snapshots where id = ${snapshot.id}`;
      await admin`delete from accounts where id = ${account.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
      await admin.end();
    }
  });
});
