import { isCloudMode } from "@/config/deployment-mode";
import { resolvePostgresConnectionString } from "@/config/postgres-connection";
import type { DrizzleDb } from "@/db/client";
import { DatabaseConfigurationError } from "@/db/errors";
import { PgAccountRepository } from "@/db/postgres/repositories/account-repository";
import { PgAdjustmentRepository } from "@/db/postgres/repositories/adjustment-repository";
import { PgBalanceSnapshotRepository } from "@/db/postgres/repositories/balance-snapshot-repository";
import { PgFixedDepositRepository } from "@/db/postgres/repositories/fixed-deposit-repository";
import { PgImportBatchRepository } from "@/db/postgres/repositories/import-batch-repository";
import { PgInstitutionRepository } from "@/db/postgres/repositories/institution-repository";
import { PgEmailSyncCursorRepository } from "@/db/postgres/repositories/email-sync-cursor-repository";
import { PgUnresolvedEmailAlertRepository } from "@/db/postgres/repositories/unresolved-email-alert-repository";
import { PgReconciliationRepository } from "@/db/postgres/repositories/reconciliation-repository";
import { PgShareTradingAccountRepository } from "@/db/postgres/repositories/share-trading-account-repository";
import { PgStockImportBatchRepository } from "@/db/postgres/repositories/stock-import-batch-repository";
import { PgStockTransactionRepository } from "@/db/postgres/repositories/stock-transaction-repository";
import { PgTransactionRepository } from "@/db/postgres/repositories/transaction-repository";
import { PgTransferRepository } from "@/db/postgres/repositories/transfer-repository";
import { AccountRepository } from "@/db/repositories/account-repository";
import { AdjustmentRepository } from "@/db/repositories/adjustment-repository";
import { BalanceSnapshotRepository } from "@/db/repositories/balance-snapshot-repository";
import { FixedDepositRepository } from "@/db/repositories/fixed-deposit-repository";
import { ImportBatchRepository } from "@/db/repositories/import-batch-repository";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { UnresolvedEmailAlertRepository } from "@/db/repositories/unresolved-email-alert-repository";
import { EmailSyncCursorRepository } from "@/db/repositories/email-sync-cursor-repository";
import type {
  AccountRepositoryPort,
  AdjustmentRepositoryPort,
  BalanceSnapshotRepositoryPort,
  FixedDepositRepositoryPort,
  ImportBatchRepositoryPort,
  InstitutionRepositoryPort,
  ReconciliationRepositoryPort,
  ShareTradingAccountRepositoryPort,
  StockImportBatchRepositoryPort,
  StockTransactionRepositoryPort,
  TransactionRepositoryPort,
  TransferRepositoryPort,
  UnresolvedEmailAlertRepositoryPort,
  EmailSyncCursorRepositoryPort
} from "@/db/repositories/ports";
import { ReconciliationRepository } from "@/db/repositories/reconciliation-repository";
import { ShareTradingAccountRepository } from "@/db/repositories/share-trading-account-repository";
import { StockImportBatchRepository } from "@/db/repositories/stock-import-batch-repository";
import { StockTransactionRepository } from "@/db/repositories/stock-transaction-repository";
import { TransactionRepository } from "@/db/repositories/transaction-repository";
import { TransferRepository } from "@/db/repositories/transfer-repository";
import { getCurrentOwnerId } from "@/lib/cloud-auth/current-owner";

export type RepositoryFactoryDeps = {
  getCurrentOwnerId?: () => Promise<string | null>;
  isCloudMode?: () => boolean;
  db?: DrizzleDb;
  postgresConnectionString?: string;
};

/** Local SQLite only — dynamic import keeps better-sqlite3 out of the cloud/Vercel graph. */
async function resolveSqliteDb(deps: RepositoryFactoryDeps): Promise<DrizzleDb> {
  if (deps.db) {
    return deps.db;
  }

  const { createDb } = await import("@/db/client");
  return createDb();
}

export async function getInstitutionRepository(
  deps: RepositoryFactoryDeps = {}
): Promise<InstitutionRepositoryPort> {
  const resolveOwnerId = deps.getCurrentOwnerId ?? getCurrentOwnerId;
  const ownerId = await resolveOwnerId();
  const cloudMode = (deps.isCloudMode ?? isCloudMode)();

  if (ownerId === null) {
    if (cloudMode) {
      throw new DatabaseConfigurationError(
        "Cloud mode requires a signed-in Owner; refusing to fall back to the local SQLite repository."
      );
    }
    return new InstitutionRepository(await resolveSqliteDb(deps));
  }

  return new PgInstitutionRepository(
    deps.postgresConnectionString ?? resolvePostgresConnectionString(),
    ownerId
  );
}

export async function getAccountRepository(
  deps: RepositoryFactoryDeps = {}
): Promise<AccountRepositoryPort> {
  const resolveOwnerId = deps.getCurrentOwnerId ?? getCurrentOwnerId;
  const ownerId = await resolveOwnerId();
  const cloudMode = (deps.isCloudMode ?? isCloudMode)();

  if (ownerId === null) {
    if (cloudMode) {
      throw new DatabaseConfigurationError(
        "Cloud mode requires a signed-in Owner; refusing to fall back to the local SQLite repository."
      );
    }
    return new AccountRepository(await resolveSqliteDb(deps));
  }

  return new PgAccountRepository(
    deps.postgresConnectionString ?? resolvePostgresConnectionString(),
    ownerId
  );
}

export async function getFixedDepositRepository(
  deps: RepositoryFactoryDeps = {}
): Promise<FixedDepositRepositoryPort> {
  const resolveOwnerId = deps.getCurrentOwnerId ?? getCurrentOwnerId;
  const ownerId = await resolveOwnerId();
  const cloudMode = (deps.isCloudMode ?? isCloudMode)();

  if (ownerId === null) {
    if (cloudMode) {
      throw new DatabaseConfigurationError(
        "Cloud mode requires a signed-in Owner; refusing to fall back to the local SQLite repository."
      );
    }
    return new FixedDepositRepository(await resolveSqliteDb(deps));
  }

  return new PgFixedDepositRepository(
    deps.postgresConnectionString ?? resolvePostgresConnectionString(),
    ownerId
  );
}

export async function getShareTradingAccountRepository(
  deps: RepositoryFactoryDeps = {}
): Promise<ShareTradingAccountRepositoryPort> {
  const resolveOwnerId = deps.getCurrentOwnerId ?? getCurrentOwnerId;
  const ownerId = await resolveOwnerId();
  const cloudMode = (deps.isCloudMode ?? isCloudMode)();

  if (ownerId === null) {
    if (cloudMode) {
      throw new DatabaseConfigurationError(
        "Cloud mode requires a signed-in Owner; refusing to fall back to the local SQLite repository."
      );
    }
    return new ShareTradingAccountRepository(await resolveSqliteDb(deps));
  }

  return new PgShareTradingAccountRepository(
    deps.postgresConnectionString ?? resolvePostgresConnectionString(),
    ownerId
  );
}

export async function getStockTransactionRepository(
  deps: RepositoryFactoryDeps = {}
): Promise<StockTransactionRepositoryPort> {
  const resolveOwnerId = deps.getCurrentOwnerId ?? getCurrentOwnerId;
  const ownerId = await resolveOwnerId();
  const cloudMode = (deps.isCloudMode ?? isCloudMode)();

  if (ownerId === null) {
    if (cloudMode) {
      throw new DatabaseConfigurationError(
        "Cloud mode requires a signed-in Owner; refusing to fall back to the local SQLite repository."
      );
    }
    return new StockTransactionRepository(await resolveSqliteDb(deps));
  }

  return new PgStockTransactionRepository(
    deps.postgresConnectionString ?? resolvePostgresConnectionString(),
    ownerId
  );
}

export async function getStockImportBatchRepository(
  deps: RepositoryFactoryDeps = {}
): Promise<StockImportBatchRepositoryPort> {
  const resolveOwnerId = deps.getCurrentOwnerId ?? getCurrentOwnerId;
  const ownerId = await resolveOwnerId();
  const cloudMode = (deps.isCloudMode ?? isCloudMode)();

  if (ownerId === null) {
    if (cloudMode) {
      throw new DatabaseConfigurationError(
        "Cloud mode requires a signed-in Owner; refusing to fall back to the local SQLite repository."
      );
    }
    return new StockImportBatchRepository(await resolveSqliteDb(deps));
  }

  return new PgStockImportBatchRepository(
    deps.postgresConnectionString ?? resolvePostgresConnectionString(),
    ownerId
  );
}

export async function getTransactionRepository(
  deps: RepositoryFactoryDeps = {}
): Promise<TransactionRepositoryPort> {
  const resolveOwnerId = deps.getCurrentOwnerId ?? getCurrentOwnerId;
  const ownerId = await resolveOwnerId();
  const cloudMode = (deps.isCloudMode ?? isCloudMode)();

  if (ownerId === null) {
    if (cloudMode) {
      throw new DatabaseConfigurationError(
        "Cloud mode requires a signed-in Owner; refusing to fall back to the local SQLite repository."
      );
    }
    return new TransactionRepository(await resolveSqliteDb(deps));
  }

  return new PgTransactionRepository(
    deps.postgresConnectionString ?? resolvePostgresConnectionString(),
    ownerId
  );
}

export async function getBalanceSnapshotRepository(
  deps: RepositoryFactoryDeps = {}
): Promise<BalanceSnapshotRepositoryPort> {
  const resolveOwnerId = deps.getCurrentOwnerId ?? getCurrentOwnerId;
  const ownerId = await resolveOwnerId();
  const cloudMode = (deps.isCloudMode ?? isCloudMode)();

  if (ownerId === null) {
    if (cloudMode) {
      throw new DatabaseConfigurationError(
        "Cloud mode requires a signed-in Owner; refusing to fall back to the local SQLite repository."
      );
    }
    return new BalanceSnapshotRepository(await resolveSqliteDb(deps));
  }

  return new PgBalanceSnapshotRepository(
    deps.postgresConnectionString ?? resolvePostgresConnectionString(),
    ownerId
  );
}

export async function getTransferRepository(
  deps: RepositoryFactoryDeps = {}
): Promise<TransferRepositoryPort> {
  const resolveOwnerId = deps.getCurrentOwnerId ?? getCurrentOwnerId;
  const ownerId = await resolveOwnerId();
  const cloudMode = (deps.isCloudMode ?? isCloudMode)();

  if (ownerId === null) {
    if (cloudMode) {
      throw new DatabaseConfigurationError(
        "Cloud mode requires a signed-in Owner; refusing to fall back to the local SQLite repository."
      );
    }
    return new TransferRepository(await resolveSqliteDb(deps));
  }

  return new PgTransferRepository(
    deps.postgresConnectionString ?? resolvePostgresConnectionString(),
    ownerId
  );
}

export async function getReconciliationRepository(
  deps: RepositoryFactoryDeps = {}
): Promise<ReconciliationRepositoryPort> {
  const resolveOwnerId = deps.getCurrentOwnerId ?? getCurrentOwnerId;
  const ownerId = await resolveOwnerId();
  const cloudMode = (deps.isCloudMode ?? isCloudMode)();

  if (ownerId === null) {
    if (cloudMode) {
      throw new DatabaseConfigurationError(
        "Cloud mode requires a signed-in Owner; refusing to fall back to the local SQLite repository."
      );
    }
    return new ReconciliationRepository(await resolveSqliteDb(deps));
  }

  return new PgReconciliationRepository(
    deps.postgresConnectionString ?? resolvePostgresConnectionString(),
    ownerId
  );
}

/** ADR-0010: ImportBatch has a Postgres port for cloud email alert sync; MCP statement import itself remains local-only (docs/adr/0010). */
export async function getImportBatchRepository(
  deps: RepositoryFactoryDeps = {}
): Promise<ImportBatchRepositoryPort> {
  const resolveOwnerId = deps.getCurrentOwnerId ?? getCurrentOwnerId;
  const ownerId = await resolveOwnerId();
  const cloudMode = (deps.isCloudMode ?? isCloudMode)();

  if (ownerId === null) {
    if (cloudMode) {
      throw new DatabaseConfigurationError(
        "Cloud mode requires a signed-in Owner; refusing to fall back to the local SQLite repository."
      );
    }
    return new ImportBatchRepository(await resolveSqliteDb(deps));
  }

  return new PgImportBatchRepository(deps.postgresConnectionString ?? resolvePostgresConnectionString(), ownerId);
}

/** ADR-0010: same local/cloud split as ImportBatch above (docs/specs/email-alert-sync.md). */
export async function getUnresolvedEmailAlertRepository(
  deps: RepositoryFactoryDeps = {}
): Promise<UnresolvedEmailAlertRepositoryPort> {
  const resolveOwnerId = deps.getCurrentOwnerId ?? getCurrentOwnerId;
  const ownerId = await resolveOwnerId();
  const cloudMode = (deps.isCloudMode ?? isCloudMode)();

  if (ownerId === null) {
    if (cloudMode) {
      throw new DatabaseConfigurationError(
        "Cloud mode requires a signed-in Owner; refusing to fall back to the local SQLite repository."
      );
    }
    return new UnresolvedEmailAlertRepository(await resolveSqliteDb(deps));
  }

  return new PgUnresolvedEmailAlertRepository(
    deps.postgresConnectionString ?? resolvePostgresConnectionString(),
    ownerId
  );
}

/** How far each mailbox has been read (docs/specs/email-alert-sync.md), same local/cloud split. */
export async function getEmailSyncCursorRepository(
  deps: RepositoryFactoryDeps = {}
): Promise<EmailSyncCursorRepositoryPort> {
  const resolveOwnerId = deps.getCurrentOwnerId ?? getCurrentOwnerId;
  const ownerId = await resolveOwnerId();
  const cloudMode = (deps.isCloudMode ?? isCloudMode)();

  if (ownerId === null) {
    if (cloudMode) {
      throw new DatabaseConfigurationError(
        "Cloud mode requires a signed-in Owner; refusing to fall back to the local SQLite repository."
      );
    }
    return new EmailSyncCursorRepository(await resolveSqliteDb(deps));
  }

  return new PgEmailSyncCursorRepository(
    deps.postgresConnectionString ?? resolvePostgresConnectionString(),
    ownerId
  );
}

export async function getAdjustmentRepository(
  deps: RepositoryFactoryDeps = {}
): Promise<AdjustmentRepositoryPort> {
  const resolveOwnerId = deps.getCurrentOwnerId ?? getCurrentOwnerId;
  const ownerId = await resolveOwnerId();
  const cloudMode = (deps.isCloudMode ?? isCloudMode)();

  if (ownerId === null) {
    if (cloudMode) {
      throw new DatabaseConfigurationError(
        "Cloud mode requires a signed-in Owner; refusing to fall back to the local SQLite repository."
      );
    }
    return new AdjustmentRepository(await resolveSqliteDb(deps));
  }

  return new PgAdjustmentRepository(
    deps.postgresConnectionString ?? resolvePostgresConnectionString(),
    ownerId
  );
}
