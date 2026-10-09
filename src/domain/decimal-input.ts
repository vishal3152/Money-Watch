import { getMinorUnitExponent } from "@/domain/currency";
import { InvalidMinorUnitsError } from "@/domain/money";

function parseScaledDecimal(input: string, exponent: number, allowNegative: boolean): number {
  const value = input.trim();
  const match = value.match(/^(-?)(\d+)(?:\.(\d+))?$/);

  if (!match || (!allowNegative && match[1] === "-")) {
    throw new InvalidMinorUnitsError();
  }

  const fraction = match[3] ?? "";
  if (fraction.length > exponent || (exponent === 0 && fraction.length > 0)) {
    throw new InvalidMinorUnitsError();
  }

  const scale = 10n ** BigInt(exponent);
  const whole = BigInt(match[2]) * scale;
  const fractional = BigInt(fraction.padEnd(exponent, "0") || "0");
  const scaled = (match[1] === "-" ? -1n : 1n) * (whole + fractional);

  if (scaled < BigInt(Number.MIN_SAFE_INTEGER) || scaled > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new InvalidMinorUnitsError();
  }

  return Number(scaled);
}

export function parseDecimalToMinorUnits(input: string, currencyCode: string): number {
  return parseScaledDecimal(input, getMinorUnitExponent(currencyCode), true);
}

export function parsePercentageToBps(input: string): number {
  return parseScaledDecimal(input, 2, false);
}
