import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";

import { resolveOwnerIdFromAuthHeader } from "@/app/api/mcp/cloud-auth";
import { isAllowedOrigin, isLoopbackHost } from "@/app/api/mcp/loopback-guard";
import {
  commitImport,
  commitStockImport,
  createAccount,
  createInstitution,
  createShareTradingAccount,
  listAccounts,
  listInstitutions,
  listShareTradingAccounts,
  resolveAccount,
  resolveShareTradingAccount,
  stageImport,
  stageStockImport
} from "@/app/api/mcp/tools";
import { isCloudMode } from "@/config/deployment-mode";
import type { RepositoryFactoryDeps } from "@/db/repository-factory";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/domain/transaction-category";

const lineItemSchema = z.object({
  amount: z.string(),
  occurredAt: z.string(),
  description: z.string(),
  category: z.enum([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]).nullable(),
  // The statement's own reference/confirmation number for this line, when the assistant can read
  // one off the statement — preferred over date+amount for Suspected Duplicate matching
  // (CONTEXT.md) when an existing Transaction on the same Account also has one. Optional: most
  // statements carry no such number.
  externalRef: z.string().nullable().optional()
});

/** Hard cap so a compromised MCP token cannot OOM the route with a multi-megabyte statement. */
const MAX_IMPORT_LINE_ITEMS = 5_000;

const stageImportInputShape = {
  accountId: z.string(),
  lineItems: z.array(lineItemSchema).max(MAX_IMPORT_LINE_ITEMS),
  closingBalance: z.string().nullable(),
  asOfDate: z.string().nullable(),
  /** Paired with openingAsOfDate. Applied only when the Account has no Transactions yet; ignored otherwise. */
  openingBalance: z.string().nullable().optional(),
  openingAsOfDate: z.string().nullable().optional()
};

// Free-text, not a fixed enum — legitimately a filename/description the assistant chooses
// ("statement.pdf", "Chase Jan 2026 statement.csv"). Only bounded so a compromised/malicious token
// can't stash an arbitrarily long string here; `source` carries no access-control meaning anywhere
// in this app (a value of "email" is not treated as more trusted than any other).
const sourceSchema = z.string().min(1).max(200);

const commitImportInputShape = {
  ...stageImportInputShape,
  source: sourceSchema,
  idempotencyKey: z.string().optional()
};

const resolveAccountInputShape = {
  accountNumber: z.string(),
  institutionName: z.string(),
  // Optional leftovers from when resolve_* auto-created on no-match; ignored by the tools now.
  accountName: z.string().optional(),
  currencyCode: z.string().optional()
};

const createInstitutionInputShape = {
  name: z.string(),
  confirmed: z.boolean()
};

const createAccountInputShape = {
  institutionId: z.string(),
  name: z.string(),
  currencyCode: z.string(),
  accountNumber: z.string(),
  confirmed: z.boolean()
};

const stockLineItemSchema = z.object({
  scripCode: z.string(),
  type: z.enum(["Buy", "Sell"]),
  quantity: z.string(),
  price: z.string(),
  occurredAt: z.string(),
  description: z.string(),
  // The broker statement's own reference/order/contract-note number for this line, when the
  // assistant can read one off the statement — preferred over the natural key for Suspected
  // Duplicate matching (CONTEXT.md) when an existing StockTransaction also has one.
  externalRef: z.string().nullable().optional()
});

const stageStockImportInputShape = {
  shareTradingAccountId: z.string(),
  lineItems: z.array(stockLineItemSchema).max(MAX_IMPORT_LINE_ITEMS)
};

const commitStockImportInputShape = {
  ...stageStockImportInputShape,
  source: sourceSchema,
  idempotencyKey: z.string().optional()
};

function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error.";
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

/** deps flows through to every tool call — the same repository-factory override seam every
 * Server Action already uses, threaded here so cloud mode can resolve tools against the token's
 * Owner instead of the (nonexistent, for an external client) browser session cookie. */
function createMcpServer(deps: RepositoryFactoryDeps): McpServer {
  const server = new McpServer({ name: "paisa-watch", version: "1.0.0" });

  server.registerTool(
    "list_institutions",
    { description: "List every Institution the owner has recorded." },
    async () => {
      try {
        return jsonResult(await listInstitutions(deps));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "create_institution",
    {
      description:
        "Create an Institution only AFTER the owner explicitly confirms in conversation. Call with confirmed:true only after they say yes. If an Institution with the same name already exists (case-insensitive), returns it without creating a duplicate. Never invent Institutions without confirmation.",
      inputSchema: createInstitutionInputShape
    },
    async (input) => {
      try {
        return jsonResult(await createInstitution(input, deps));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "list_accounts",
    {
      description:
        "List every Account with its Institution, currency, and account number, so the assistant can disambiguate which Account a statement belongs to."
    },
    async () => {
      try {
        return jsonResult(await listAccounts(deps));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "create_account",
    {
      description:
        "Create an Account only AFTER the owner explicitly confirms in conversation. Call with confirmed:true only after they say yes. Requires institutionId and an accountNumber with at least 4 digits. If an Account at that Institution already shares the same last 4 digits, returns it (created:false) instead of duplicating. Never invent Accounts without confirmation.",
      inputSchema: createAccountInputShape
    },
    async (input) => {
      try {
        return jsonResult(await createAccount(input, deps));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "resolve_account",
    {
      description:
        "REQUIRED before stage_import/commit_import: resolve the target Account from the statement's (often masked) account number and institution name, matching by the account number's last 4 digits plus case-insensitive institution name. Exactly one match → use that accountId. status unresolved → ASK the owner which Account to use (list_accounts) OR whether to create one via create_institution then create_account after they confirm; never guess by display name, product type, or currency. status ambiguous → ask owner to pick from candidates. status wrong-account-type → call resolve_share_trading_account instead.",
      inputSchema: resolveAccountInputShape
    },
    async (input) => {
      try {
        return jsonResult(await resolveAccount(input, deps));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "stage_import",
    {
      description:
        "Preview a proposed statement import against an Account: flags line items that look like duplicates of existing Transactions, and writes nothing. If the statement shows a reference/confirmation number for a line, pass it as that line's externalRef — it's preferred over date+amount for duplicate matching when an existing Transaction also has one; omit it when the statement has none. Optional openingBalance+openingAsOfDate: on an empty Account, the result's openingBalanceLine (kept separate from lineItems, never included in it) previews the synthetic Opening balance line commit_import will create; on a non-empty Account they are ignored (prior ledger already implies period open — mismatches surface via closing-balance Reconciliation on Confirm All). When calling commit_import, pass the same openingBalance/openingAsOfDate again alongside lineItems as-is from this preview — never copy openingBalanceLine into the lineItems array yourself, or the opening amount is booked twice. Call resolve_account first and only pass an accountId the owner confirmed (or that resolve_account returned as resolved) — never pick an Account by guessing from list_accounts names.",
      inputSchema: stageImportInputShape
    },
    async (input) => {
      try {
        return jsonResult(await stageImport(input, deps));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "commit_import",
    {
      description:
        "Commit a statement import: atomically creates one ImportBatch and its Imported-trust-status Transactions on the target Account. This always succeeds — it never rejects a line item for looking like a duplicate. Instead, any line that matches an existing Transaction (by externalRef when both have one, else by date+amount) is written with that match recorded as a Suspected Duplicate, visible in-app; the owner resolves it there (dismiss or remove) before the ImportBatch can be confirmed. Optional openingBalance+openingAsOfDate: when the Account has no existing Transactions, prepends a synthetic Opening balance Transaction so the ledger starts from the statement open; when the Account already has Transactions, opening is ignored and statement lines still import (any mismatch is for Reconciliation via closingBalance on Confirm All). Pass an idempotencyKey (any stable string, e.g. a hash of the request) to make a retry after a dropped/ambiguous response return the same ImportBatch instead of creating a duplicate.",
      inputSchema: commitImportInputShape
    },
    async (input) => {
      try {
        return jsonResult(await commitImport(input, deps));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "list_share_trading_accounts",
    {
      description:
        "List every ShareTradingAccount with its Institution, currency, and account number, so the assistant can disambiguate which one a broker statement belongs to."
    },
    async () => {
      try {
        return jsonResult(await listShareTradingAccounts(deps));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "create_share_trading_account",
    {
      description:
        "Create a ShareTradingAccount only AFTER the owner explicitly confirms. Call with confirmed:true only after they say yes. Requires institutionId and an accountNumber with at least 4 digits. Reuses an existing same last-4 match at that Institution (created:false) instead of duplicating.",
      inputSchema: createAccountInputShape
    },
    async (input) => {
      try {
        return jsonResult(await createShareTradingAccount(input, deps));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "resolve_share_trading_account",
    {
      description:
        "REQUIRED before stage_stock_import/commit_stock_import: resolve the target ShareTradingAccount from the statement's (often masked) account number and institution name, matching by last 4 digits plus case-insensitive institution name. Exactly one match → use that id. status unresolved → ASK the owner which to use (list_share_trading_accounts) OR whether to create via create_institution then create_share_trading_account after they confirm; never guess. status ambiguous → ask owner to pick. status wrong-account-type → call resolve_account instead.",
      inputSchema: resolveAccountInputShape
    },
    async (input) => {
      try {
        return jsonResult(await resolveShareTradingAccount(input, deps));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "stage_stock_import",
    {
      description:
        "Preview a proposed stock trade import against a ShareTradingAccount: flags line items that look like duplicates, and writes nothing. If the statement shows an order/contract-note number for a line, pass it as that line's externalRef — it's preferred over the natural key (date, scrip, type, quantity, price) for duplicate matching when an existing StockTransaction also has one; omit it when the statement has none. Call resolve_share_trading_account first and only pass an id the owner confirmed (or that resolve returned as resolved).",
      inputSchema: stageStockImportInputShape
    },
    async (input) => {
      try {
        return jsonResult(await stageStockImport(input, deps));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "commit_stock_import",
    {
      description:
        "Commit a stock trade import: atomically creates one StockImportBatch and its Imported-trust-status StockTransactions (Buy/Sell, scrip code, quantity, price) on the target ShareTradingAccount. This always succeeds — it never rejects a line item for looking like a duplicate. Instead, any line that matches an existing StockTransaction (by externalRef when both have one, else by the natural key) is written with that match recorded as a Suspected Duplicate, visible in-app; the owner resolves it there (dismiss or remove) before the StockImportBatch can be confirmed. Pass an idempotencyKey (any stable string) to make a retry return the same batch instead of creating a duplicate.",
      inputSchema: commitStockImportInputShape
    },
    async (input) => {
      try {
        return jsonResult(await commitStockImport(input, deps));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  return server;
}

async function runMcpServer(request: Request, deps: RepositoryFactoryDeps): Promise<Response> {
  const server = createMcpServer(deps);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });

  await server.connect(transport);
  return transport.handleRequest(request);
}

/** Cloud mode has no "same machine" to trust (a real hosted deployment), so it authenticates via
 * the Owner's MCP access token (ADR-0011) instead of the loopback Host-header guard local mode
 * uses. A fresh server+transport per request either way — stateless Streamable HTTP, matching a
 * Next.js Route Handler's per-request lifecycle. */
async function handleMcpRequest(request: Request): Promise<Response> {
  if (isCloudMode()) {
    const { resolveOwnerIdByTokenHash } = await import("@/db/postgres/repositories/mcp-access-token-repository");
    const { resolvePostgresConnectionString } = await import("@/config/postgres-connection");

    const ownerId = await resolveOwnerIdFromAuthHeader(request.headers.get("authorization"), {
      resolveOwnerIdByTokenHash: (tokenHash) => resolveOwnerIdByTokenHash(resolvePostgresConnectionString(), tokenHash)
    });

    if (ownerId === null) {
      return new Response("Unauthorized", { status: 401 });
    }

    return runMcpServer(request, { getCurrentOwnerId: async () => ownerId, isCloudMode: () => true });
  }

  if (!isLoopbackHost(request.headers.get("host")) || !isAllowedOrigin(request.headers.get("origin"))) {
    return new Response("Forbidden", { status: 403 });
  }

  return runMcpServer(request, {});
}

export async function POST(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}

export async function GET(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}
