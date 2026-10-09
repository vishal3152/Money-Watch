import { describe, expect, it } from "vitest";

import { resolveOwnerIdFromAuthHeader } from "@/app/api/mcp/cloud-auth";
import { hashMcpAccessToken } from "@/domain/mcp-access-token";

describe("resolveOwnerIdFromAuthHeader", () => {
  it("returns null for a missing Authorization header, without looking anything up", async () => {
    let lookupCalled = false;

    const ownerId = await resolveOwnerIdFromAuthHeader(null, {
      resolveOwnerIdByTokenHash: async () => {
        lookupCalled = true;
        return "owner-1";
      }
    });

    expect(ownerId).toBeNull();
    expect(lookupCalled).toBe(false);
  });

  it("returns null for a header without a Bearer prefix, without looking anything up", async () => {
    let lookupCalled = false;

    const ownerId = await resolveOwnerIdFromAuthHeader("Basic abc123", {
      resolveOwnerIdByTokenHash: async () => {
        lookupCalled = true;
        return "owner-1";
      }
    });

    expect(ownerId).toBeNull();
    expect(lookupCalled).toBe(false);
  });

  it("returns null for an empty Bearer token, without looking anything up", async () => {
    let lookupCalled = false;

    const ownerId = await resolveOwnerIdFromAuthHeader("Bearer ", {
      resolveOwnerIdByTokenHash: async () => {
        lookupCalled = true;
        return "owner-1";
      }
    });

    expect(ownerId).toBeNull();
    expect(lookupCalled).toBe(false);
  });

  it("accepts a lower- or mixed-case Bearer scheme, since RFC 7235 makes the auth-scheme " +
    "token case-insensitive and some HTTP clients/proxies normalize it", async () => {
    let hashLookedUp: string | null = null;

    const ownerId = await resolveOwnerIdFromAuthHeader("bearer my-plaintext-token", {
      resolveOwnerIdByTokenHash: async (tokenHash) => {
        hashLookedUp = tokenHash;
        return "owner-42";
      }
    });

    expect(hashLookedUp).toBe(hashMcpAccessToken("my-plaintext-token"));
    expect(ownerId).toBe("owner-42");
  });

  it("hashes the presented token and resolves the Owner the lookup returns", async () => {
    let hashLookedUp: string | null = null;

    const ownerId = await resolveOwnerIdFromAuthHeader("Bearer my-plaintext-token", {
      resolveOwnerIdByTokenHash: async (tokenHash) => {
        hashLookedUp = tokenHash;
        return "owner-42";
      }
    });

    expect(hashLookedUp).toBe(hashMcpAccessToken("my-plaintext-token"));
    expect(ownerId).toBe("owner-42");
  });

  it("returns null when the presented token matches no Owner", async () => {
    const ownerId = await resolveOwnerIdFromAuthHeader("Bearer unknown-token", {
      resolveOwnerIdByTokenHash: async () => null
    });

    expect(ownerId).toBeNull();
  });
});
