import { getMinorUnitExponent } from "@/domain/currency";

/**
 * The IETF tag every `Intl`/`toLocaleString` display-formatting call in this app pins
 * itself to, instead of the ambient default (`undefined`). Per docs/specs/ui.md ("Money
 * is not localized"), number/date *formatting* is deliberately fixed regardless of the
 * active UI language (`@/i18n/locales`) — Node's server-side default and a browser's
 * client-side default aren't guaranteed to match, which could otherwise mismatch a
 * Client Component's server-rendered HTML against its client render.
 */
export const DISPLAY_LOCALE = "en-US";

export function minorUnitsToDecimalString(amountMinor: number, currencyCode: string): string {
  const exponent = getMinorUnitExponent(currencyCode);
  const sign = amountMinor < 0 ? "-" : "";
  const digits = Math.abs(amountMinor).toString().padStart(exponent + 1, "0");

  if (exponent === 0) {
    return `${sign}${digits}`;
  }

  return `${sign}${digits.slice(0, -exponent)}.${digits.slice(-exponent)}`;
}

export function formatMinorUnits(amountMinor: number, currencyCode: string): string {
  return `${minorUnitsToDecimalString(amountMinor, currencyCode)} ${currencyCode}`;
}

/** A degenerate (0/0 or divide-by-zero) realized FX rate renders as "—"
 * rather than the literal string "NaN"/"Infinity". */
export function formatRealizedFxRate(rate: number): string {
  if (!Number.isFinite(rate)) {
    return "—";
  }

  return rate.toLocaleString(DISPLAY_LOCALE, { maximumFractionDigits: 6 });
}
