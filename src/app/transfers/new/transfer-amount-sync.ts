/**
 * Decides what the destination amount field should hold when the
 * same-currency relationship between source and destination changes.
 *
 * The destination amount mirrors the source amount while both legs share a
 * currency (transfer-form.tsx submits it via a hidden input in that case).
 * If the destination is switched to a different currency, that mirrored
 * figure is stale and must not survive — otherwise a same-value
 * cross-currency Transfer silently fabricates a 1.0 realized FX rate (see
 * realizedFxRate in src/domain/transfer.ts).
 */
export function nextDestinationAmountOnCurrencyChange(
  wasSameCurrency: boolean,
  isSameCurrency: boolean,
  currentDestinationAmount: string
): string {
  return wasSameCurrency && !isSameCurrency ? "" : currentDestinationAmount;
}
