/**
 * Best-effort, single-process guard against a duplicate form submission (a
 * double-click before the submit button disables, or a browser back-button
 * resubmit of an already-submitted form) creating two identical records.
 *
 * Not a distributed idempotency system: state is an in-memory Map, so it only
 * protects the process instance that first claimed a key. In the local/desktop
 * SQLite tier that is the only process, so this is a real guard; on the cloud
 * tier's serverless instances it reduces but does not eliminate the risk
 * (a follow-up submission may land on a different instance) — a known,
 * accepted limitation rather than a promise of exactly-once writes.
 */
const claimedKeys = new Map<string, number>();
const TTL_MS = 2 * 60 * 1000;
const MAX_TRACKED_KEYS = 1000;

function sweepExpired(now: number): void {
  for (const [key, expiresAt] of claimedKeys) {
    if (expiresAt <= now) {
      claimedKeys.delete(key);
    }
  }
}

/**
 * Returns true the first time a given key is claimed, false on every
 * subsequent claim within the TTL. A missing/empty key always succeeds
 * (callers that don't pass one are unaffected).
 */
export function claimIdempotencyKey(key: string | null | undefined, now: number = Date.now()): boolean {
  if (!key) {
    return true;
  }

  sweepExpired(now);

  if (claimedKeys.has(key)) {
    return false;
  }

  if (claimedKeys.size >= MAX_TRACKED_KEYS) {
    const oldestKey = claimedKeys.keys().next().value;
    if (oldestKey !== undefined) {
      claimedKeys.delete(oldestKey);
    }
  }

  claimedKeys.set(key, now + TTL_MS);
  return true;
}

export function resetIdempotencyKeysForTests(): void {
  claimedKeys.clear();
}
