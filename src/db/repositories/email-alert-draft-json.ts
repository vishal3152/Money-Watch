import type { EmailAlertDraft } from "@/domain/email-alert";

const EMPTY_DRAFT: EmailAlertDraft = {
  direction: null,
  amount: null,
  currencyCode: null,
  occurredAt: null,
  accountNumberSuffix: null,
  institutionName: null,
  description: null,
  reference: null,
  balance: null
};

function parseJson(raw: string | null): unknown {
  if (raw === null) {
    return null;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    // Corrupt JSON must not crash `/imports` — the owner still needs to see the alert, and can
    // retype the fields by hand.
    return null;
  }
}

/**
 * Reads whichever payload an unresolved alert row carries: `alert_draft_json` for rows written
 * since drafts existed, the older `parsed_alert_json` otherwise. Anything missing or non-string
 * becomes null rather than being dropped — the full draft shape is what the correction form on
 * `/imports` renders. Shared by both tiers' repositories so they can never diverge.
 */
export function deserializeEmailAlertDraft(
  alertDraftJson: string | null,
  parsedAlertJson: string | null
): EmailAlertDraft {
  const stored = parseJson(alertDraftJson) ?? parseJson(parsedAlertJson);
  if (typeof stored !== "object" || stored === null) {
    return { ...EMPTY_DRAFT };
  }
  const fields = stored as Record<string, unknown>;
  const draft = { ...EMPTY_DRAFT };
  for (const field of Object.keys(EMPTY_DRAFT) as (keyof EmailAlertDraft)[]) {
    draft[field] = typeof fields[field] === "string" ? (fields[field] as string) : null;
  }
  return draft;
}

export function deserializeInvalidFields(raw: string | null): string[] {
  const stored = parseJson(raw);
  return Array.isArray(stored) ? stored.filter((field): field is string => typeof field === "string") : [];
}
