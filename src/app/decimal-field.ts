export type SanitizeDecimalInputOptions = {
  /** When true, a single leading `-` is kept so overdraft / signed balances can be entered. */
  allowNegative?: boolean;
};

/** Strip non-decimal characters from a money/rate field while typing or pasting. */
export function sanitizeDecimalInput(
  value: string,
  options: SanitizeDecimalInputOptions = {}
): string {
  const allowNegative = options.allowNegative === true;
  let result = "";
  let seenDot = false;
  let seenDigit = false;

  for (const char of value) {
    if (char >= "0" && char <= "9") {
      result += char;
      seenDigit = true;
      continue;
    }
    if (char === "." && !seenDot) {
      result += char;
      seenDot = true;
      continue;
    }
    if (char === "-" && allowNegative && result.length === 0 && !seenDigit) {
      result += char;
    }
  }

  return result;
}
