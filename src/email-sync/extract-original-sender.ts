const FORWARDED_MARKER = /-{2,}\s*forwarded message\s*-{2,}/i;
const FROM_LINE = /^from:\s*(.+)$/im;

/**
 * Pulls the embedded original sender's display name out of a Gmail/Outlook-style
 * "---------- Forwarded message ---------" block in a plain-text email body, when the owner
 * manually forwarded a bank alert rather than the mailbox receiving it directly. Returns null
 * when no such block is found (not a forwarded email, or a forward format this doesn't recognize)
 * so the caller falls back to the message's own IMAP From header.
 */
export function extractOriginalSender(bodyText: string): string | null {
  const markerMatch = FORWARDED_MARKER.exec(bodyText);
  if (!markerMatch) {
    return null;
  }

  const afterMarker = bodyText.slice(markerMatch.index + markerMatch[0].length);
  const fromMatch = FROM_LINE.exec(afterMarker);
  if (!fromMatch) {
    return null;
  }

  const raw = fromMatch[1].trim();
  const emailWrapped = /<[^>]*>\s*$/.exec(raw);
  if (!emailWrapped) {
    // No "Name <email>" shape — just a bare address, e.g. "From: alerts@rblbank.com" — which
    // carries no display name to report.
    return null;
  }

  const name = raw.slice(0, emailWrapped.index).trim().replace(/^["']|["']$/g, "");
  return name.length > 0 ? name : null;
}
