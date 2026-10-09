export type AccountNumberMatchCandidate = {
  accountId: string;
  accountNumber: string | null;
  institutionName: string;
};

export type AccountNumberMatch =
  | { status: "resolved"; accountId: string }
  | { status: "unresolved"; reason: "no-match" | "multiple-matches" };

const SUFFIX_DIGIT_COUNT = 4;

/**
 * Last `length` *digits* of `value`, ignoring any non-digit characters anywhere in it (mask
 * asterisks/"X"s, spaces, dashes — on either side, per `docs/specs/import.md`'s invariant) — never
 * a raw string suffix. Returns null if `value` has fewer than `length` digits, so a claim or a
 * stored account number that's mostly mask characters can never satisfy the match by accident.
 */
function lastDigits(value: string, length: number): string | null {
  const digits = value.replace(/\D/g, "");
  return digits.length >= length ? digits.slice(-length) : null;
}

/**
 * Every existing Account/ShareTradingAccount candidate whose account number's last 4 digits equal
 * the claim's, and whose institution name matches case-insensitively (trimmed) — the shared
 * matching step behind `resolveAccountByNumberSuffix` below, also used directly wherever a caller
 * needs the full candidate list rather than just the resolved/ambiguous outcome (MCP's
 * `resolve_account`/`resolve_share_trading_account` build their `ambiguous` response from this).
 */
export function findAccountNumberMatches<T extends AccountNumberMatchCandidate>(
  claim: { accountNumberSuffix: string; institutionName: string },
  candidates: T[]
): T[] {
  const claimedDigits = lastDigits(claim.accountNumberSuffix, SUFFIX_DIGIT_COUNT);
  if (claimedDigits === null) {
    return [];
  }
  const claimedInstitution = claim.institutionName.trim().toLowerCase();

  return candidates.filter((candidate) => {
    if (candidate.accountNumber === null) {
      return false;
    }
    const candidateDigits = lastDigits(candidate.accountNumber, SUFFIX_DIGIT_COUNT);
    return (
      candidateDigits !== null &&
      candidateDigits === claimedDigits &&
      candidate.institutionName.trim().toLowerCase() === claimedInstitution
    );
  });
}

/**
 * Matches a claimed account-number suffix and institution name against the owner's existing
 * Accounts, deterministically — never a fuzzy/heuristic guess. Exactly one match resolves the
 * Account; zero or multiple candidates leave it unresolved for the owner to pick by hand (or, for
 * a zero-match MCP import caller, to ask the owner and optionally create via create_account after
 * confirmation).
 *
 * Shared by email alert sync (docs/specs/email-alert-sync.md, the original caller) and MCP
 * import's `resolve_account` tool (docs/specs/import.md) — both need to resolve an Account from
 * nothing but a masked/partial account number and an institution name. Both callers pass whatever
 * shape of claim they have (a full account number, an already-masked one, one with a different
 * mask style than what's stored) — matching by digits-only, on both the claim and the stored
 * value, is what makes that safe to share instead of each caller normalizing differently (see
 * `findAccountNumberMatches`).
 */
export function resolveAccountByNumberSuffix(
  claim: { accountNumberSuffix: string; institutionName: string },
  candidates: AccountNumberMatchCandidate[]
): AccountNumberMatch {
  const matches = findAccountNumberMatches(claim, candidates);

  if (matches.length === 0) {
    return { status: "unresolved", reason: "no-match" };
  }
  if (matches.length > 1) {
    return { status: "unresolved", reason: "multiple-matches" };
  }
  return { status: "resolved", accountId: matches[0].accountId };
}
