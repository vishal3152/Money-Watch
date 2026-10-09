import { describe, expect, it } from "vitest";

import { resolveLoopbackPort } from "@/desktop/resolve-loopback-port";

describe("resolveLoopbackPort", () => {
  it("returns the preferred port when it is free", async () => {
    const port = await resolveLoopbackPort({
      preferredPort: 4571,
      isPortFree: async (candidate) => candidate === 4571
    });

    expect(port).toBe(4571);
  });

  it("falls back to the next port when the preferred one is occupied", async () => {
    const checked: number[] = [];

    const port = await resolveLoopbackPort({
      preferredPort: 4571,
      isPortFree: async (candidate) => {
        checked.push(candidate);
        return candidate === 4573;
      }
    });

    expect(port).toBe(4573);
    expect(checked).toEqual([4571, 4572, 4573]);
  });

  it("throws when no port is free within the attempt limit", async () => {
    await expect(
      resolveLoopbackPort({
        preferredPort: 4571,
        isPortFree: async () => false,
        maxAttempts: 3
      })
    ).rejects.toThrow("No free loopback port found starting at 4571.");
  });
});
