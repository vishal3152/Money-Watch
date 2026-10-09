import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getCurrentOwnerEmail,
  getCurrentOwnerId,
  getOwnerEmailFromSession,
  getOwnerIdFromSession
} from "@/lib/cloud-auth/current-owner";
import { createSessionToken, deriveOwnerId } from "@/lib/simple-auth/session";

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.TEST_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

const ORIGINAL_DEPLOYMENT_MODE = process.env.DEPLOYMENT_MODE;
const ORIGINAL_AUTH_PROVIDER = process.env.AUTH_PROVIDER;
const ORIGINAL_AUTH_USERS = process.env.AUTH_USERS;

let mockSimpleCookieValue: string | undefined;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "pw_simple_session" && mockSimpleCookieValue !== undefined
        ? { value: mockSimpleCookieValue }
        : undefined
  })
}));

afterEach(() => {
  if (ORIGINAL_DEPLOYMENT_MODE === undefined) {
    delete process.env.DEPLOYMENT_MODE;
  } else {
    process.env.DEPLOYMENT_MODE = ORIGINAL_DEPLOYMENT_MODE;
  }
  if (ORIGINAL_AUTH_PROVIDER === undefined) {
    delete process.env.AUTH_PROVIDER;
  } else {
    process.env.AUTH_PROVIDER = ORIGINAL_AUTH_PROVIDER;
  }
  if (ORIGINAL_AUTH_USERS === undefined) {
    delete process.env.AUTH_USERS;
  } else {
    process.env.AUTH_USERS = ORIGINAL_AUTH_USERS;
  }
  mockSimpleCookieValue = undefined;
});

describe("getOwnerIdFromSession", () => {
  it("returns null when claims.sub is missing", async () => {
    const supabase = {
      auth: {
        getClaims: async () => ({ data: { claims: {} }, error: null })
      }
    };

    await expect(getOwnerIdFromSession(supabase as never)).resolves.toBeNull();
  });

  it("returns the signed-in user's id", async () => {
    const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    const email = `${randomUUID()}@example.com`;

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password: "correct horse battery staple 1!"
    });

    expect(signUpError).toBeNull();
    expect(signUpData.user).not.toBeNull();

    const ownerId = await getOwnerIdFromSession(supabase);

    expect(ownerId).toBe(signUpData.user!.id);
  });

  it("returns null when there is no signed-in session", async () => {
    const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

    const ownerId = await getOwnerIdFromSession(supabase);

    expect(ownerId).toBeNull();
  });
});

describe("getCurrentOwnerId", () => {
  it("returns null in local mode without touching Supabase config", async () => {
    delete process.env.DEPLOYMENT_MODE;

    const ownerId = await getCurrentOwnerId();

    expect(ownerId).toBeNull();
  });
});

describe("getOwnerEmailFromSession", () => {
  it("returns null when claims.email is missing", async () => {
    const supabase = {
      auth: {
        getClaims: async () => ({ data: { claims: {} }, error: null })
      }
    };

    await expect(getOwnerEmailFromSession(supabase as never)).resolves.toBeNull();
  });

  it("returns the signed-in user's email", async () => {
    const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    const email = `${randomUUID()}@example.com`;

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password: "correct horse battery staple 1!"
    });

    expect(signUpError).toBeNull();

    const ownerEmail = await getOwnerEmailFromSession(supabase);

    expect(ownerEmail).toBe(email);
  });

  it("returns null when there is no signed-in session", async () => {
    const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

    const ownerEmail = await getOwnerEmailFromSession(supabase);

    expect(ownerEmail).toBeNull();
  });
});

describe("getCurrentOwnerEmail", () => {
  it("returns null in local mode without touching Supabase config", async () => {
    delete process.env.DEPLOYMENT_MODE;

    const ownerEmail = await getCurrentOwnerEmail();

    expect(ownerEmail).toBeNull();
  });
});

describe("getCurrentOwnerId with AUTH_PROVIDER=simple", () => {
  beforeEach(() => {
    process.env.DEPLOYMENT_MODE = "cloud";
    process.env.AUTH_PROVIDER = "simple";
    process.env.AUTH_USERS = "alice@example.com:hunter2,bob@example.com:hunter3";
  });

  it("returns null when there is no session cookie", async () => {
    mockSimpleCookieValue = undefined;

    expect(await getCurrentOwnerId()).toBeNull();
  });

  it("returns that email's derived owner id for a valid session cookie", async () => {
    mockSimpleCookieValue = await createSessionToken("alice@example.com", "hunter2");

    expect(await getCurrentOwnerId()).toBe(await deriveOwnerId("alice@example.com"));
  });

  it("returns a different owner id for a different signed-in email", async () => {
    mockSimpleCookieValue = await createSessionToken("bob@example.com", "hunter3");

    expect(await getCurrentOwnerId()).toBe(await deriveOwnerId("bob@example.com"));
    expect(await getCurrentOwnerId()).not.toBe(await deriveOwnerId("alice@example.com"));
  });

  it("returns null for a session cookie signed with a stale password", async () => {
    mockSimpleCookieValue = await createSessionToken("alice@example.com", "a different password");

    expect(await getCurrentOwnerId()).toBeNull();
  });
});

describe("getCurrentOwnerEmail with AUTH_PROVIDER=simple", () => {
  beforeEach(() => {
    process.env.DEPLOYMENT_MODE = "cloud";
    process.env.AUTH_PROVIDER = "simple";
    process.env.AUTH_USERS = "alice@example.com:hunter2,bob@example.com:hunter3";
  });

  it("returns the signed-in email for a valid session cookie", async () => {
    mockSimpleCookieValue = await createSessionToken("alice@example.com", "hunter2");

    expect(await getCurrentOwnerEmail()).toBe("alice@example.com");
  });

  it("returns null when there is no session cookie", async () => {
    mockSimpleCookieValue = undefined;

    expect(await getCurrentOwnerEmail()).toBeNull();
  });
});
