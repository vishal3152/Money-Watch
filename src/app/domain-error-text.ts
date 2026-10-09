import type { LocalizedText } from "@/i18n/translator";

/**
 * Known gap: messages thrown by the repository layer (`src/db/errors.ts`) are
 * composed in English at the throw site, often with data folded into the prose
 * ("This Account still has 3 Transactions"). Localizing them means giving those
 * error classes structured fields, which reaches across the repository seam the
 * MCP server and email sync also depend on — out of scope for this change.
 *
 * Until then, actions forward the English detail through this single key, so
 * every remaining untranslated string is greppable from one place.
 */
export function domainErrorText(error: Error): LocalizedText {
  return { key: "errors.databaseDetail", params: { detail: error.message } };
}
