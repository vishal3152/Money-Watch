import { describe, expect, it } from "vitest";

import {
  assertSafeImapHostname,
  isBlockedIpAddress,
  UnsafeImapHostError
} from "@/domain/imap-host-safety";

describe("isBlockedIpAddress", () => {
  it("blocks loopback, RFC1918, link-local, and CGNAT IPv4", () => {
    expect(isBlockedIpAddress("127.0.0.1")).toBe(true);
    expect(isBlockedIpAddress("10.0.0.5")).toBe(true);
    expect(isBlockedIpAddress("172.16.1.1")).toBe(true);
    expect(isBlockedIpAddress("192.168.1.1")).toBe(true);
    expect(isBlockedIpAddress("169.254.169.254")).toBe(true);
    expect(isBlockedIpAddress("100.64.1.1")).toBe(true);
    expect(isBlockedIpAddress("0.0.0.0")).toBe(true);
  });

  it("allows public IPv4", () => {
    expect(isBlockedIpAddress("8.8.8.8")).toBe(false);
    expect(isBlockedIpAddress("1.1.1.1")).toBe(false);
  });

  it("blocks IPv6 loopback and link-local", () => {
    expect(isBlockedIpAddress("::1")).toBe(true);
    expect(isBlockedIpAddress("fe80::1")).toBe(true);
  });

  it("blocks every IPv4-mapped IPv6 spelling of a blocked address", () => {
    expect(isBlockedIpAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedIpAddress("::ffff:7f00:1")).toBe(true);
    expect(isBlockedIpAddress("0:0:0:0:0:ffff:127.0.0.1")).toBe(true);
    expect(isBlockedIpAddress("::ffff:169.254.169.254")).toBe(true);
  });

  it("allows an IPv4-mapped IPv6 spelling of a public address", () => {
    expect(isBlockedIpAddress("::ffff:8.8.8.8")).toBe(false);
  });
});

describe("assertSafeImapHostname", () => {
  it("accepts a normal public IMAP hostname", () => {
    expect(() => assertSafeImapHostname("imap.gmail.com")).not.toThrow();
  });

  it("rejects localhost and literal private IPs", () => {
    expect(() => assertSafeImapHostname("localhost")).toThrow(UnsafeImapHostError);
    expect(() => assertSafeImapHostname("127.0.0.1")).toThrow(UnsafeImapHostError);
    expect(() => assertSafeImapHostname("169.254.169.254")).toThrow(UnsafeImapHostError);
    expect(() => assertSafeImapHostname("[::ffff:127.0.0.1]")).toThrow(UnsafeImapHostError);
  });

  it("rejects URLs and credentials-shaped input", () => {
    expect(() => assertSafeImapHostname("https://imap.example.com")).toThrow(UnsafeImapHostError);
    expect(() => assertSafeImapHostname("user@imap.example.com")).toThrow(UnsafeImapHostError);
  });
});
