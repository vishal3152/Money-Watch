/**
 * AUTH_PROVIDER=simple has no sign-up and no users table: the set of valid
 * accounts is configured once, as `email:password` pairs, in AUTH_USERS. Each
 * email is its own Owner — resolved to a deterministic id (`deriveOwnerId`) so
 * a person who only knows their own password can never see another email's
 * data (docs/adr/0015-simple-email-password-auth-as-supabase-alternative.md).
 */
export const SIMPLE_SESSION_COOKIE = "pw_simple_session";

// Fixed so the same email always derives the same owner id — not a real DNS
// namespace, just a constant that must never change once deployed.
const OWNER_ID_NAMESPACE = "96286f74-9d62-4ac9-9e06-8166f0a6bdd7";

// Web Crypto (the global `crypto`), not node:crypto — middleware.ts imports this
// module and Next's middleware runs on the Edge runtime, which has no node:crypto.
function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function parseAuthUsers(raw: string): Map<string, string> {
  const users = new Map<string, string>();

  for (const rawPair of raw.split(",")) {
    const pair = rawPair.trim();
    if (pair.length === 0) {
      continue;
    }

    const separatorIndex = pair.indexOf(":");
    if (separatorIndex === -1) {
      throw new Error(`AUTH_USERS entry "${pair}" is not in email:password format.`);
    }

    const email = pair.slice(0, separatorIndex).trim().toLowerCase();
    const password = pair.slice(separatorIndex + 1);
    if (email.length === 0 || password.length === 0) {
      throw new Error(`AUTH_USERS entry "${pair}" is missing an email or a password.`);
    }

    users.set(email, password);
  }

  if (users.size === 0) {
    throw new Error("AUTH_USERS must contain at least one email:password pair.");
  }

  return users;
}

/** The configured `email -> password` accounts. Throws (fails loudly, rather
 * than silently granting no one access) when AUTH_USERS is unset or malformed. */
export function getAuthUsers(): Map<string, string> {
  const raw = process.env.AUTH_USERS;
  if (!raw) {
    throw new Error("AUTH_USERS must be set when AUTH_PROVIDER=simple.");
  }
  return parseAuthUsers(raw);
}

/** Constant-time check that `email` is a configured account and `password` matches it. */
export function verifyCredentials(email: string, password: string): boolean {
  const expectedPassword = getAuthUsers().get(email.trim().toLowerCase());
  return expectedPassword !== undefined && timingSafeEqualString(password, expectedPassword);
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** RFC 4122 version 5 (SHA-1 namespaced) UUID, so the same email always yields
 * the same owner id without a users table to store the mapping in. */
async function uuidV5(name: string, namespace: string): Promise<string> {
  const namespaceBytes = hexToBytes(namespace.replace(/-/g, ""));
  const nameBytes = new TextEncoder().encode(name);
  const data = new Uint8Array(namespaceBytes.length + nameBytes.length);
  data.set(namespaceBytes, 0);
  data.set(nameBytes, namespaceBytes.length);

  const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", data)).slice(0, 16);
  hash[6] = (hash[6] & 0x0f) | 0x50; // version 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // RFC 4122 variant

  const hex = Array.from(hash)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Each configured email is its own Owner. Deterministic and case-insensitive,
 * so the id never needs to be stored anywhere. */
export async function deriveOwnerId(email: string): Promise<string> {
  return uuidV5(email.trim().toLowerCase(), OWNER_ID_NAMESPACE);
}

function base64UrlEncode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function signForEmail(email: string, password: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(email));
  return bufferToHex(signature);
}

/** The cookie carries the email in the open (it isn't a secret) plus an HMAC
 * over it keyed by that email's own configured password — only someone who
 * knows that specific password can produce a signature verifySessionToken
 * will accept for it. */
export async function createSessionToken(email: string, password: string): Promise<string> {
  const normalizedEmail = email.trim().toLowerCase();
  return `${base64UrlEncode(normalizedEmail)}.${await signForEmail(normalizedEmail, password)}`;
}

/** Re-derives the signature from the email's *currently* configured password —
 * so removing an email from AUTH_USERS (or changing its password) revokes any
 * session already signed for it. */
export async function verifySessionToken(token: string | undefined): Promise<{ email: string } | null> {
  if (!token) {
    return null;
  }

  const separatorIndex = token.lastIndexOf(".");
  if (separatorIndex === -1) {
    return null;
  }

  let email: string;
  try {
    email = base64UrlDecode(token.slice(0, separatorIndex));
  } catch {
    return null;
  }

  const password = getAuthUsers().get(email);
  if (password === undefined) {
    return null;
  }

  const signature = token.slice(separatorIndex + 1);
  const expectedSignature = await signForEmail(email, password);
  return timingSafeEqualString(signature, expectedSignature) ? { email } : null;
}

/** The owner-id-resolution half of session verification: null means "no
 * session", matching getCurrentOwnerId()'s Supabase contract so callers don't
 * need to branch. */
export async function resolveOwnerIdFromToken(token: string | undefined): Promise<string | null> {
  const identity = await verifySessionToken(token);
  return identity ? deriveOwnerId(identity.email) : null;
}
