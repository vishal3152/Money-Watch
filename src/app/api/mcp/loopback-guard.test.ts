import { describe, expect, it } from "vitest";

import { isAllowedOrigin, isLoopbackHost } from "@/app/api/mcp/loopback-guard";

describe("isLoopbackHost", () => {
  it("accepts localhost, 127.0.0.1, and [::1], with or without a port", () => {
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("localhost:4571")).toBe(true);
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("127.0.0.1:4571")).toBe(true);
    expect(isLoopbackHost("[::1]")).toBe(true);
    expect(isLoopbackHost("[::1]:4571")).toBe(true);
  });

  it("rejects any other host, including one that could be a DNS-rebinding attempt", () => {
    expect(isLoopbackHost("evil.example.com")).toBe(false);
    expect(isLoopbackHost("192.168.1.167:4571")).toBe(false);
    expect(isLoopbackHost(null)).toBe(false);
  });
});

describe("isAllowedOrigin", () => {
  it("accepts a missing Origin header — every non-browser MCP client never sends one", () => {
    expect(isAllowedOrigin(null)).toBe(true);
  });

  it("accepts an Origin naming localhost, 127.0.0.1, or [::1], with or without a port", () => {
    expect(isAllowedOrigin("http://localhost:3000")).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:3000")).toBe(true);
    expect(isAllowedOrigin("http://[::1]:3000")).toBe(true);
  });

  it("rejects an Origin naming any other site — a cross-origin browser POST", () => {
    expect(isAllowedOrigin("https://evil.example.com")).toBe(false);
    expect(isAllowedOrigin("http://192.168.1.167:4571")).toBe(false);
  });

  it("rejects an unparseable Origin (e.g. a sandboxed iframe's opaque \"null\")", () => {
    expect(isAllowedOrigin("null")).toBe(false);
  });
});
