import type { MessageKey, Translator } from "@/i18n/translator";

export type SystemMessage = {
  type: "success" | "error";
  text: string;
};

/**
 * Maps an opaque code carried across a redirect (`?message=`/`?error=`) to
 * fixed, server-owned copy. Never render the raw query value directly —
 * that would let `?error=<anything>` put arbitrary text on the page.
 */
const MESSAGES_BY_CODE: Record<string, { type: SystemMessage["type"]; key: MessageKey }> = {
  account_created: { type: "success", key: "systemMessage.accountCreated" },
  password_reset_requested: { type: "success", key: "systemMessage.passwordResetRequested" },
  password_reset: { type: "success", key: "systemMessage.passwordReset" },
  link_expired: { type: "error", key: "systemMessage.linkExpired" },
  sign_in_cancelled: { type: "error", key: "systemMessage.signInCancelled" },
  database_path_saved: { type: "success", key: "systemMessage.databasePathSaved" },
  institution_created: { type: "success", key: "systemMessage.institutionCreated" },
  institution_updated: { type: "success", key: "systemMessage.institutionUpdated" },
  institution_deleted: { type: "success", key: "systemMessage.institutionDeleted" },
  bank_account_created: { type: "success", key: "systemMessage.bankAccountCreated" },
  bank_account_updated: { type: "success", key: "systemMessage.bankAccountUpdated" },
  bank_account_deleted: { type: "success", key: "systemMessage.bankAccountDeleted" },
  bank_account_hard_deleted: { type: "success", key: "systemMessage.bankAccountHardDeleted" },
  transaction_created: { type: "success", key: "systemMessage.transactionCreated" },
  transaction_updated: { type: "success", key: "systemMessage.transactionUpdated" },
  transaction_deleted: { type: "success", key: "systemMessage.transactionDeleted" },
  transfer_created: { type: "success", key: "systemMessage.transferCreated" },
  transfer_updated: { type: "success", key: "systemMessage.transferUpdated" },
  transfer_deleted: { type: "success", key: "systemMessage.transferDeleted" },
  fixed_deposit_created: { type: "success", key: "systemMessage.fixedDepositCreated" },
  share_trading_account_created: {
    type: "success",
    key: "systemMessage.shareTradingAccountCreated"
  },
  share_trading_account_updated: {
    type: "success",
    key: "systemMessage.shareTradingAccountUpdated"
  },
  share_trading_account_deleted: {
    type: "success",
    key: "systemMessage.shareTradingAccountDeleted"
  },
  stock_transaction_created: { type: "success", key: "systemMessage.stockTransactionCreated" },
  stock_transaction_updated: { type: "success", key: "systemMessage.stockTransactionUpdated" },
  stock_transaction_deleted: { type: "success", key: "systemMessage.stockTransactionDeleted" }
};

export function resolveSystemMessage(
  code: string | undefined,
  t: Translator["t"]
): SystemMessage | undefined {
  // Object.hasOwn, not `code in MESSAGES_BY_CODE` / a bare index — a plain object literal still
  // inherits Object.prototype, so `?message=constructor`/`toString` would otherwise resolve to
  // that inherited function instead of `undefined` and render a message with undefined type/text.
  const message = code && Object.hasOwn(MESSAGES_BY_CODE, code) ? MESSAGES_BY_CODE[code] : undefined;

  return message ? { type: message.type, text: t(message.key) } : undefined;
}

/** Appends `?message=<code>` (or `&message=<code>` if `path` already has a query string). */
export function withSystemMessage(path: string, code: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}message=${code}`;
}
