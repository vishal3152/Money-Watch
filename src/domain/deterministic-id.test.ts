import { describe, expect, it } from "vitest";

import { uuidFromHash } from "@/domain/deterministic-id";

describe("uuidFromHash", () => {
  it("returns a stable, UUID-shaped id for the same material", () => {
    expect(uuidFromHash("a:b:1")).toBe(uuidFromHash("a:b:1"));
    expect(uuidFromHash("a:b:1")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("differs for different material", () => {
    expect(uuidFromHash("a:b:1")).not.toBe(uuidFromHash("a:b:2"));
  });
});
