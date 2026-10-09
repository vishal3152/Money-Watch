import { beforeEach, describe, expect, it } from "vitest";

import { claimIdempotencyKey, resetIdempotencyKeysForTests } from "@/app/duplicate-submission-guard";

describe("claimIdempotencyKey", () => {
  beforeEach(() => {
    resetIdempotencyKeysForTests();
  });

  it("succeeds the first time a key is claimed", () => {
    expect(claimIdempotencyKey("key-1")).toBe(true);
  });

  it("fails a second claim of the same key within the TTL", () => {
    expect(claimIdempotencyKey("key-1")).toBe(true);
    expect(claimIdempotencyKey("key-1")).toBe(false);
  });

  it("succeeds again once the TTL has elapsed", () => {
    const start = 1_000_000;
    expect(claimIdempotencyKey("key-1", start)).toBe(true);
    expect(claimIdempotencyKey("key-1", start + 60_000)).toBe(false);
    expect(claimIdempotencyKey("key-1", start + 3 * 60_000)).toBe(true);
  });

  it("treats a missing or empty key as always allowed", () => {
    expect(claimIdempotencyKey(undefined)).toBe(true);
    expect(claimIdempotencyKey(null)).toBe(true);
    expect(claimIdempotencyKey("")).toBe(true);
    expect(claimIdempotencyKey("")).toBe(true);
  });

  it("tracks distinct keys independently", () => {
    expect(claimIdempotencyKey("key-1")).toBe(true);
    expect(claimIdempotencyKey("key-2")).toBe(true);
    expect(claimIdempotencyKey("key-1")).toBe(false);
    expect(claimIdempotencyKey("key-2")).toBe(false);
  });
});
