import { beforeEach, describe, expect, it, vi } from "vitest";

const lookupMock = vi.fn();
vi.mock("node:dns/promises", () => ({ lookup: (...args: unknown[]) => lookupMock(...args) }));

const { assertSafeImapHostResolved } = await import("@/email-sync/assert-safe-imap-host");
const { UnsafeImapHostError } = await import("@/domain/imap-host-safety");

describe("assertSafeImapHostResolved", () => {
  beforeEach(() => {
    lookupMock.mockReset();
  });

  it("returns the resolved address and the hostname as servername, for SNI/cert-identity pinning", async () => {
    lookupMock.mockResolvedValueOnce([{ address: "203.0.113.10" }]);

    await expect(assertSafeImapHostResolved("imap.example.com")).resolves.toEqual({
      address: "203.0.113.10",
      servername: "imap.example.com"
    });
  });

  it("returns the literal IP with no servername when the host is already an IP", async () => {
    await expect(assertSafeImapHostResolved("203.0.113.10")).resolves.toEqual({
      address: "203.0.113.10",
      servername: null
    });
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("rejects when any resolved address is private, even if another is public", async () => {
    lookupMock.mockResolvedValueOnce([{ address: "203.0.113.10" }, { address: "127.0.0.1" }]);

    await expect(assertSafeImapHostResolved("imap.example.com")).rejects.toThrow(UnsafeImapHostError);
  });
});
