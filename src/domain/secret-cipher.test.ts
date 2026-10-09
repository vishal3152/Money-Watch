import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret } from "@/domain/secret-cipher";

const KEY = randomBytes(32);
const OTHER_KEY = randomBytes(32);

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a secret with the same key", () => {
    const encrypted = encryptSecret("app-password", KEY);

    expect(decryptSecret(encrypted, KEY)).toBe("app-password");
  });

  it("produces a different envelope for the same plaintext on each call (random IV)", () => {
    expect(encryptSecret("app-password", KEY)).not.toBe(encryptSecret("app-password", KEY));
  });

  it("decrypting with a different key throws", () => {
    const encrypted = encryptSecret("app-password", KEY);

    expect(() => decryptSecret(encrypted, OTHER_KEY)).toThrow();
  });

  it("decrypting a tampered envelope throws", () => {
    const encrypted = encryptSecret("app-password", KEY);
    const raw = Buffer.from(encrypted.slice("v1:".length), "base64");
    raw[raw.length - 1] ^= 0xff; // flip the last ciphertext byte
    const tampered = "v1:" + raw.toString("base64");

    expect(() => decryptSecret(tampered, KEY)).toThrow();
  });

  it("passes through a value that isn't in the v1 envelope format unchanged (legacy plaintext)", () => {
    expect(decryptSecret("app-password", KEY)).toBe("app-password");
  });
});
