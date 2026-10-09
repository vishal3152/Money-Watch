import { isIP } from "node:net";

/**
 * Blocks hosts that would let a cloud Owner (or a settings-form XSS) turn a server-side outbound
 * call (IMAP, and — cloud mode only — the LLM base URL, `src/domain/llm-host-safety.ts`) into an
 * SSRF client against loopback, RFC1918, link-local, or cloud-metadata targets. Literal IPs are
 * checked here; hostname→A/AAAA resolution is `assertSafeImapHostResolved`/
 * `assertSafeLlmBaseUrlResolved`.
 */
export const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.",
  "metadata.google.internal",
  "metadata.goog",
  "kubernetes.default",
  "kubernetes.default.svc"
]);

export class UnsafeImapHostError extends Error {
  constructor(public readonly host: string, reason: string) {
    super(`IMAP host "${host}" is not allowed (${reason}).`);
    this.name = "UnsafeImapHostError";
  }
}

function parseIpv4(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) {
    return null;
  }
  const octets = parts.map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return null;
  }
  return octets;
}

/**
 * Canonicalizes any IPv6 spelling (mixed-notation, zero-compressed, zero-padded) to the same hex
 * form Node's URL parser produces, so every equivalent spelling of one address hits the same check
 * below instead of only the one literal spelling a regex happens to expect.
 */
function canonicalizeIpv6(address: string): string {
  try {
    return new URL(`http://[${address}]`).hostname.replace(/^\[|\]$/g, "");
  } catch {
    return address;
  }
}

function ipv4FromMappedHex(highHex: string, lowHex: string): string {
  const value = Number.parseInt(highHex, 16) * 0x10000 + Number.parseInt(lowHex, 16);
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff].join(".");
}

/** True for loopback, RFC1918, link-local, CGNAT, unspecified, and IPv6 ULA/link-local/loopback. */
export function isBlockedIpAddress(ip: string): boolean {
  const trimmed = ip.trim().toLowerCase().replace(/^\[|\]$/g, "");
  const normalized = isIP(trimmed) === 6 ? canonicalizeIpv6(trimmed) : trimmed;

  if (normalized === "::1" || normalized === "::" || normalized.startsWith("fe80:")) {
    return true;
  }
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }
  // IPv4-mapped IPv6, canonical hex form after canonicalizeIpv6 above (e.g. "::ffff:7f00:1").
  const mapped = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mapped) {
    return isBlockedIpAddress(ipv4FromMappedHex(mapped[1], mapped[2]));
  }

  const octets = parseIpv4(normalized);
  if (!octets) {
    return false;
  }
  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  if (a === 172 && b !== undefined && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  // Carrier-grade NAT 100.64.0.0/10
  if (a === 100 && b !== undefined && b >= 64 && b <= 127) {
    return true;
  }
  return false;
}

function normalizeHostname(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "");
}

/**
 * Sync check for settings-form validation: rejects empty hosts, URLs, blocked names, and
 * literal blocked IPs. Does not resolve DNS — call `assertSafeImapHostResolved` before connect.
 */
export function assertSafeImapHostname(host: string): void {
  const trimmed = host.trim();
  if (trimmed.length === 0) {
    throw new UnsafeImapHostError(host, "empty");
  }
  if (/[\s/\\@?#]/.test(trimmed) || trimmed.includes("://")) {
    throw new UnsafeImapHostError(host, "must be a bare hostname or IP, not a URL");
  }

  const hostname = normalizeHostname(trimmed);
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new UnsafeImapHostError(host, "blocked hostname");
  }

  const ipLiteral = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
  if (isIP(ipLiteral) && isBlockedIpAddress(ipLiteral)) {
    throw new UnsafeImapHostError(host, "private or link-local address");
  }
}
