import { describe, expect, it } from "vitest";

import { generateMcpAccessToken, hashMcpAccessToken } from "@/domain/mcp-access-token";

describe("hashMcpAccessToken", () => {
  it("hashes a token to its SHA-256 hex digest", () => {
    // Known SHA-256("test") vector, independent of this module's own implementation.
    expect(hashMcpAccessToken("test")).toBe(
      "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
    );
  });
});

describe("generateMcpAccessToken", () => {
  it("returns the injected token plaintext and its SHA-256 hash", () => {
    const result = generateMcpAccessToken({ randomToken: () => "fixed-token-value" });

    expect(result.token).toBe("fixed-token-value");
    // Known SHA-256("fixed-token-value") vector.
    expect(result.tokenHash).toBe("b4633916dafe45a51cff0bb66bfe9e3068314aa845b7dd13702a90412ad3c071");
  });

  it("generates a high-entropy token by default (64 hex characters, i.e. 32 random bytes)", () => {
    const result = generateMcpAccessToken();

    expect(result.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generates a different token on every call by default", () => {
    expect(generateMcpAccessToken().token).not.toBe(generateMcpAccessToken().token);
  });
});
