import { afterEach, describe, expect, it } from "vitest";

import {
  SIMPLE_SESSION_COOKIE,
  createSessionToken,
  deriveOwnerId,
  getAuthUsers,
  resolveOwnerIdFromToken,
  verifyCredentials,
  verifySessionToken
} from "@/lib/simple-auth/session";

const ORIGINAL_AUTH_USERS = process.env.AUTH_USERS;

afterEach(() => {
  if (ORIGINAL_AUTH_USERS === undefined) {
    delete process.env.AUTH_USERS;
  } else {
    process.env.AUTH_USERS = ORIGINAL_AUTH_USERS;
  }
});

describe("getAuthUsers", () => {
  it("throws when AUTH_USERS is unset, since simple mode has no other credential source", () => {
    delete process.env.AUTH_USERS;
    expect(() => getAuthUsers()).toThrow();
  });

  it("parses a comma-separated list of email:password pairs", () => {
    process.env.AUTH_USERS = "alice@example.com:hunter2,bob@example.com:correct horse battery staple";

    const users = getAuthUsers();

    expect(users.get("alice@example.com")).toBe("hunter2");
    expect(users.get("bob@example.com")).toBe("correct horse battery staple");
  });

  it("lowercases and trims email keys so lookups are case-insensitive", () => {
    process.env.AUTH_USERS = " Alice@Example.com :hunter2";

    expect(getAuthUsers().get("alice@example.com")).toBe("hunter2");
  });

  it("throws on an entry with no ':' separator", () => {
    process.env.AUTH_USERS = "not-a-valid-entry";
    expect(() => getAuthUsers()).toThrow();
  });

  it("throws on an entry missing an email or a password", () => {
    process.env.AUTH_USERS = ":hunter2";
    expect(() => getAuthUsers()).toThrow();
  });
});

describe("verifyCredentials", () => {
  const ORIGINAL = process.env.AUTH_USERS;

  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env.AUTH_USERS;
    } else {
      process.env.AUTH_USERS = ORIGINAL;
    }
  });

  it("accepts a matching email and password", () => {
    process.env.AUTH_USERS = "alice@example.com:hunter2,bob@example.com:hunter3";
    expect(verifyCredentials("alice@example.com", "hunter2")).toBe(true);
  });

  it("is case-insensitive on email", () => {
    process.env.AUTH_USERS = "alice@example.com:hunter2";
    expect(verifyCredentials("Alice@Example.com", "hunter2")).toBe(true);
  });

  it("rejects a wrong password for a known email", () => {
    process.env.AUTH_USERS = "alice@example.com:hunter2";
    expect(verifyCredentials("alice@example.com", "wrong")).toBe(false);
  });

  it("rejects an email that isn't configured", () => {
    process.env.AUTH_USERS = "alice@example.com:hunter2";
    expect(verifyCredentials("mallory@example.com", "hunter2")).toBe(false);
  });

  it("one user's password never authenticates a different user's email", () => {
    process.env.AUTH_USERS = "alice@example.com:hunter2,bob@example.com:hunter3";
    expect(verifyCredentials("bob@example.com", "hunter2")).toBe(false);
  });
});

describe("deriveOwnerId", () => {
  it("is deterministic for the same email", async () => {
    const first = await deriveOwnerId("alice@example.com");
    const second = await deriveOwnerId("alice@example.com");
    expect(first).toBe(second);
  });

  it("is case-insensitive", async () => {
    const lower = await deriveOwnerId("alice@example.com");
    const upper = await deriveOwnerId("Alice@Example.com");
    expect(lower).toBe(upper);
  });

  it("differs between two different emails", async () => {
    const alice = await deriveOwnerId("alice@example.com");
    const bob = await deriveOwnerId("bob@example.com");
    expect(alice).not.toBe(bob);
  });

  it("returns a well-formed UUID, since owner_id columns are typed uuid", async () => {
    const ownerId = await deriveOwnerId("alice@example.com");
    expect(ownerId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("createSessionToken / verifySessionToken", () => {
  afterEach(() => {
    if (ORIGINAL_AUTH_USERS === undefined) {
      delete process.env.AUTH_USERS;
    } else {
      process.env.AUTH_USERS = ORIGINAL_AUTH_USERS;
    }
  });

  it("verifies a token created for a configured email and password", async () => {
    process.env.AUTH_USERS = "alice@example.com:hunter2";
    const token = await createSessionToken("alice@example.com", "hunter2");
    expect(await verifySessionToken(token)).toEqual({ email: "alice@example.com" });
  });

  it("rejects a token whose email's password has since changed", async () => {
    process.env.AUTH_USERS = "alice@example.com:hunter2";
    const token = await createSessionToken("alice@example.com", "hunter2");

    process.env.AUTH_USERS = "alice@example.com:a new password";
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("rejects a token for an email removed from AUTH_USERS", async () => {
    process.env.AUTH_USERS = "alice@example.com:hunter2";
    const token = await createSessionToken("alice@example.com", "hunter2");

    process.env.AUTH_USERS = "bob@example.com:hunter3";
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("rejects an undefined token", async () => {
    process.env.AUTH_USERS = "alice@example.com:hunter2";
    expect(await verifySessionToken(undefined)).toBeNull();
  });

  it("rejects a tampered/garbage token of arbitrary shape", async () => {
    process.env.AUTH_USERS = "alice@example.com:hunter2";
    expect(await verifySessionToken("not-a-real-token")).toBeNull();
  });

  it("rejects alice's signature spliced onto bob's email", async () => {
    process.env.AUTH_USERS = "alice@example.com:hunter2,bob@example.com:hunter3";
    const [, aliceSignature] = (await createSessionToken("alice@example.com", "hunter2")).split(".");
    const bobEmailPart = btoa("bob@example.com").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

    expect(await verifySessionToken(`${bobEmailPart}.${aliceSignature}`)).toBeNull();
  });
});

describe("resolveOwnerIdFromToken", () => {
  afterEach(() => {
    if (ORIGINAL_AUTH_USERS === undefined) {
      delete process.env.AUTH_USERS;
    } else {
      process.env.AUTH_USERS = ORIGINAL_AUTH_USERS;
    }
  });

  it("returns that email's derived owner id for a valid token", async () => {
    process.env.AUTH_USERS = "alice@example.com:hunter2";
    const token = await createSessionToken("alice@example.com", "hunter2");

    expect(await resolveOwnerIdFromToken(token)).toBe(await deriveOwnerId("alice@example.com"));
  });

  it("returns a different owner id for a different email", async () => {
    process.env.AUTH_USERS = "alice@example.com:hunter2,bob@example.com:hunter3";
    const aliceId = await resolveOwnerIdFromToken(await createSessionToken("alice@example.com", "hunter2"));
    const bobId = await resolveOwnerIdFromToken(await createSessionToken("bob@example.com", "hunter3"));

    expect(aliceId).not.toBe(bobId);
  });

  it("returns null for a missing token", async () => {
    process.env.AUTH_USERS = "alice@example.com:hunter2";
    expect(await resolveOwnerIdFromToken(undefined)).toBeNull();
  });
});

describe("constants", () => {
  it("uses a dedicated cookie name distinct from Supabase's own cookies", () => {
    expect(SIMPLE_SESSION_COOKIE).toBe("pw_simple_session");
  });
});
