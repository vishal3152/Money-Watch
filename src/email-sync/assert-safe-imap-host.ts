import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import {
  assertSafeImapHostname,
  isBlockedIpAddress,
  UnsafeImapHostError
} from "@/domain/imap-host-safety";

/**
 * The address to actually connect to, and the hostname (if any) to present for TLS SNI/certificate
 * validation. Pinning the connection to this resolved address — instead of letting the IMAP client
 * re-resolve the hostname itself at connect time — closes the DNS-rebinding TOCTOU window between
 * this check and the connect that follows it (a validated-safe DNS answer here has no bearing on
 * what a second, independent resolution moments later would return).
 */
export type SafeImapHostConnectTarget = {
  address: string;
  /** null when `host` was already an IP literal — there is no hostname identity to verify. */
  servername: string | null;
};

/**
 * Full pre-connect SSRF check: hostname shape + every resolved A/AAAA address must be public.
 * Returns the address to connect to — call from the IMAP client immediately before
 * `ImapFlow.connect`, passing the returned address/servername through so the connection targets
 * exactly what was validated here rather than whatever a fresh resolution returns.
 */
export async function assertSafeImapHostResolved(host: string): Promise<SafeImapHostConnectTarget> {
  assertSafeImapHostname(host);

  const hostname = host.trim().replace(/^\[|\]$/g, "");
  if (isIP(hostname)) {
    return { address: hostname, servername: null };
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new UnsafeImapHostError(host, "DNS lookup failed");
  }

  if (addresses.length === 0) {
    throw new UnsafeImapHostError(host, "DNS lookup returned no addresses");
  }

  for (const { address } of addresses) {
    if (isBlockedIpAddress(address)) {
      throw new UnsafeImapHostError(host, `resolves to blocked address ${address}`);
    }
  }

  return { address: addresses[0].address, servername: hostname };
}
