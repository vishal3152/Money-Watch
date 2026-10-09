import { describe, expect, it } from "vitest";

import { resolveAppUrl } from "@/desktop/app-url";

describe("resolveAppUrl", () => {
  it("returns a loopback URL for the given port", () => {
    expect(resolveAppUrl({ port: 3456 })).toBe("http://127.0.0.1:3456");
  });
});
