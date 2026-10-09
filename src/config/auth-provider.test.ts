import { afterEach, describe, expect, it } from "vitest";

import { getAuthProvider } from "@/config/auth-provider";

const ORIGINAL_AUTH_PROVIDER = process.env.AUTH_PROVIDER;

afterEach(() => {
  if (ORIGINAL_AUTH_PROVIDER === undefined) {
    delete process.env.AUTH_PROVIDER;
  } else {
    process.env.AUTH_PROVIDER = ORIGINAL_AUTH_PROVIDER;
  }
});

describe("getAuthProvider", () => {
  it("defaults to supabase when AUTH_PROVIDER is unset", () => {
    delete process.env.AUTH_PROVIDER;
    expect(getAuthProvider()).toBe("supabase");
  });

  it("returns simple when AUTH_PROVIDER=simple", () => {
    process.env.AUTH_PROVIDER = "simple";
    expect(getAuthProvider()).toBe("simple");
  });

  it("falls back to supabase for any other value, so a typo never silently locks cloud mode out", () => {
    process.env.AUTH_PROVIDER = "oauth2";
    expect(getAuthProvider()).toBe("supabase");
  });
});
