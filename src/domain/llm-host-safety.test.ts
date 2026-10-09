import { describe, expect, it } from "vitest";

import { assertSafeLlmBaseUrl, assertValidLlmBaseUrl, UnsafeLlmHostError } from "@/domain/llm-host-safety";

describe("assertValidLlmBaseUrl", () => {
  it("accepts a normal public https base URL", () => {
    expect(() => assertValidLlmBaseUrl("https://openrouter.ai/api/v1")).not.toThrow();
  });

  it("accepts a localhost URL — no host-safety check here, only shape", () => {
    expect(() => assertValidLlmBaseUrl("http://localhost:11434/v1")).not.toThrow();
  });

  it("rejects an empty URL", () => {
    expect(() => assertValidLlmBaseUrl("")).toThrow(UnsafeLlmHostError);
  });

  it("rejects a malformed URL", () => {
    expect(() => assertValidLlmBaseUrl("not a url")).toThrow(UnsafeLlmHostError);
  });

  it("rejects a non-http(s) scheme", () => {
    expect(() => assertValidLlmBaseUrl("ftp://example.com")).toThrow(UnsafeLlmHostError);
  });
});

describe("assertSafeLlmBaseUrl", () => {
  it("accepts a normal public https base URL", () => {
    expect(() => assertSafeLlmBaseUrl("https://openrouter.ai/api/v1")).not.toThrow();
  });

  it("rejects an empty URL", () => {
    expect(() => assertSafeLlmBaseUrl("")).toThrow(UnsafeLlmHostError);
  });

  it("rejects a malformed URL", () => {
    expect(() => assertSafeLlmBaseUrl("not a url")).toThrow(UnsafeLlmHostError);
  });

  it("rejects a non-http(s) scheme", () => {
    expect(() => assertSafeLlmBaseUrl("ftp://example.com")).toThrow(UnsafeLlmHostError);
  });

  it("rejects localhost and literal private IPs", () => {
    expect(() => assertSafeLlmBaseUrl("http://localhost:11434/v1")).toThrow(UnsafeLlmHostError);
    expect(() => assertSafeLlmBaseUrl("http://127.0.0.1:11434/v1")).toThrow(UnsafeLlmHostError);
    expect(() => assertSafeLlmBaseUrl("http://169.254.169.254/v1")).toThrow(UnsafeLlmHostError);
    expect(() => assertSafeLlmBaseUrl("http://[::ffff:127.0.0.1]/v1")).toThrow(UnsafeLlmHostError);
  });
});
