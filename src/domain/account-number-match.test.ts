import { describe, expect, it } from "vitest";

import { resolveAccountByNumberSuffix } from "@/domain/account-number-match";

const rblClaim = { accountNumberSuffix: "1602", institutionName: "RBL Bank" };

const rblAccount = { accountId: "acc-rbl", accountNumber: "XXXX1602", institutionName: "RBL Bank" };
const hdfcAccount = { accountId: "acc-hdfc", accountNumber: "XXXX9001", institutionName: "HDFC Bank" };

describe("resolveAccountByNumberSuffix", () => {
  it("resolves to the one candidate matching both the account-number suffix and institution name", () => {
    expect(resolveAccountByNumberSuffix(rblClaim, [rblAccount, hdfcAccount])).toEqual({
      status: "resolved",
      accountId: "acc-rbl"
    });
  });

  it("leaves the alert unresolved when no candidate matches", () => {
    expect(resolveAccountByNumberSuffix(rblClaim, [hdfcAccount])).toEqual({
      status: "unresolved",
      reason: "no-match"
    });
  });

  it("leaves the alert unresolved when more than one candidate matches", () => {
    const secondRblAccount = { accountId: "acc-rbl-2", accountNumber: "YYYY1602", institutionName: "RBL Bank" };
    expect(resolveAccountByNumberSuffix(rblClaim, [rblAccount, secondRblAccount])).toEqual({
      status: "unresolved",
      reason: "multiple-matches"
    });
  });

  it("excludes a candidate with no account number set", () => {
    const noNumberAccount = { accountId: "acc-no-number", accountNumber: null, institutionName: "RBL Bank" };
    expect(resolveAccountByNumberSuffix(rblClaim, [noNumberAccount])).toEqual({
      status: "unresolved",
      reason: "no-match"
    });
  });

  it("matches the institution name case-insensitively", () => {
    const lowercaseRblAccount = { ...rblAccount, institutionName: "rbl bank" };
    expect(resolveAccountByNumberSuffix(rblClaim, [lowercaseRblAccount])).toEqual({
      status: "resolved",
      accountId: "acc-rbl"
    });
  });

  it("leaves the alert unresolved when the claimed suffix is shorter than 4 characters", () => {
    expect(resolveAccountByNumberSuffix({ ...rblClaim, accountNumberSuffix: "2" }, [rblAccount])).toEqual({
      status: "unresolved",
      reason: "no-match"
    });
  });

  it("resolves when the claim carries the full account number rather than a masked suffix — only the last 4 digits are compared, not a raw endsWith of the whole claim", () => {
    const fullNumberClaim = { accountNumberSuffix: "50100123451602", institutionName: "RBL Bank" };
    expect(resolveAccountByNumberSuffix(fullNumberClaim, [rblAccount])).toEqual({
      status: "resolved",
      accountId: "acc-rbl"
    });
  });

  it("resolves when the stored account number has non-digit characters (spaces) the claimed suffix does not", () => {
    const spacedAccount = { accountId: "acc-rbl", accountNumber: "5010 0123 45 1602 ", institutionName: "RBL Bank" };
    expect(resolveAccountByNumberSuffix(rblClaim, [spacedAccount])).toEqual({
      status: "resolved",
      accountId: "acc-rbl"
    });
  });

  it("leaves the alert unresolved when the claimed suffix has fewer than 4 actual digits, even if the raw string is 4+ characters (e.g. more mask characters)", () => {
    expect(resolveAccountByNumberSuffix({ ...rblClaim, accountNumberSuffix: "X602" }, [rblAccount])).toEqual({
      status: "unresolved",
      reason: "no-match"
    });
  });
});
