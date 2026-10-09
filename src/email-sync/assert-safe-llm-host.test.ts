import { beforeEach, describe, expect, it, vi } from "vitest";

const lookupMock = vi.fn();
vi.mock("node:dns/promises", () => ({ lookup: (...args: unknown[]) => lookupMock(...args) }));

const { assertSafeLlmBaseUrlResolved } = await import("@/email-sync/assert-safe-llm-host");
const { UnsafeLlmHostError } = await import("@/domain/llm-host-safety");

describe("assertSafeLlmBaseUrlResolved", () => {
  beforeEach(() => {
    lookupMock.mockReset();
  });

  it("resolves without throwing when every address is public", async () => {
    lookupMock.mockResolvedValueOnce([{ address: "203.0.113.10" }]);

    await expect(assertSafeLlmBaseUrlResolved("https://openrouter.ai/api/v1")).resolves.toBeUndefined();
  });

  it("does not resolve DNS when the hostname is already a literal public IP", async () => {
    await expect(assertSafeLlmBaseUrlResolved("http://203.0.113.10:11434/v1")).resolves.toBeUndefined();
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("rejects when any resolved address is private, even if another is public", async () => {
    lookupMock.mockResolvedValueOnce([{ address: "203.0.113.10" }, { address: "127.0.0.1" }]);

    await expect(assertSafeLlmBaseUrlResolved("https://sneaky.example.com/v1")).rejects.toThrow(
      UnsafeLlmHostError
    );
  });

  it("rejects a URL that fails the sync shape check before ever resolving DNS", async () => {
    await expect(assertSafeLlmBaseUrlResolved("http://localhost:11434/v1")).rejects.toThrow(UnsafeLlmHostError);
    expect(lookupMock).not.toHaveBeenCalled();
  });
});
