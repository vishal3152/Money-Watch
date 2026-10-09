import { describe, expect, it } from "vitest";

import {
  generateMcpAccessToken,
  getMcpAccessTokenSummary,
  revokeMcpAccessToken
} from "@/app/settings/mcp-token-actions";

describe("getMcpAccessTokenSummary", () => {
  it("returns null when signed out", async () => {
    const summary = await getMcpAccessTokenSummary({ getCurrentOwnerId: async () => null });

    expect(summary).toBeNull();
  });

  it("returns null when signed in but no token has been generated", async () => {
    const summary = await getMcpAccessTokenSummary({
      getCurrentOwnerId: async () => "owner-1",
      readToken: async () => null
    });

    expect(summary).toBeNull();
  });

  it("returns the token's createdAt when one exists, and nothing else", async () => {
    const summary = await getMcpAccessTokenSummary({
      getCurrentOwnerId: async () => "owner-1",
      readToken: async () => ({ createdAt: "2026-09-11T00:00:00.000Z" })
    });

    expect(summary).toEqual({ createdAt: "2026-09-11T00:00:00.000Z" });
  });
});

describe("generateMcpAccessToken", () => {
  it("refuses when signed out, without generating or saving anything", async () => {
    let saved = false;

    const result = await generateMcpAccessToken({}, new FormData(), {
      getCurrentOwnerId: async () => null,
      saveToken: async () => {
        saved = true;
      }
    });

    expect(result).toEqual({ error: { key: "errors.mcpSignInGenerate" } });
    expect(saved).toBe(false);
  });

  it("generates a token, saves only its hash against the signed-in Owner, and returns the plaintext", async () => {
    const saveCalls: Array<{ ownerId: string; tokenHash: string; createdAt: string }> = [];

    const result = await generateMcpAccessToken({}, new FormData(), {
      getCurrentOwnerId: async () => "owner-1",
      generateToken: () => ({ token: "plaintext-token", tokenHash: "the-hash" }),
      now: () => new Date("2026-09-11T00:00:00.000Z"),
      saveToken: async (ownerId, tokenHash, createdAt) => {
        saveCalls.push({ ownerId, tokenHash, createdAt });
      }
    });

    expect(result).toEqual({ token: "plaintext-token" });
    expect(saveCalls).toEqual([
      { ownerId: "owner-1", tokenHash: "the-hash", createdAt: "2026-09-11T00:00:00.000Z" }
    ]);
  });
});

describe("revokeMcpAccessToken", () => {
  it("refuses when signed out, without revoking anything", async () => {
    let revoked = false;

    const result = await revokeMcpAccessToken({}, new FormData(), {
      getCurrentOwnerId: async () => null,
      revokeToken: async () => {
        revoked = true;
      }
    });

    expect(result).toEqual({ error: { key: "errors.mcpSignInRevoke" } });
    expect(revoked).toBe(false);
  });

  it("revokes the signed-in Owner's token", async () => {
    const revokedOwnerIds: string[] = [];

    const result = await revokeMcpAccessToken({}, new FormData(), {
      getCurrentOwnerId: async () => "owner-1",
      revokeToken: async (ownerId) => {
        revokedOwnerIds.push(ownerId);
      }
    });

    expect(result).toEqual({ revoked: true });
    expect(revokedOwnerIds).toEqual(["owner-1"]);
  });
});
