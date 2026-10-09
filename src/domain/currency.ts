const MINOR_UNIT_EXPONENTS: Record<string, number> = {
  JPY: 0,
  KRW: 0,
  BHD: 3,
  KWD: 3,
  OMR: 3
};

export function getMinorUnitExponent(currencyCode: string): number {
  return MINOR_UNIT_EXPONENTS[currencyCode] ?? 2;
}
