import { describe, expect, it } from "vitest";

import { emailAlertImportBatchId, emailAlertTransactionId } from "@/email-sync/email-alert-import-ids";

describe("emailAlertImportBatchId / emailAlertTransactionId", () => {
  it("returns stable UUID-shaped ids for the same owner, mailbox, and UID", () => {
    expect(emailAlertImportBatchId("owner-1", "a@b.com", "1")).toBe(emailAlertImportBatchId("owner-1", "a@b.com", "1"));
    expect(emailAlertTransactionId("owner-1", "a@b.com", "1")).toBe(emailAlertTransactionId("owner-1", "a@b.com", "1"));
    expect(emailAlertImportBatchId("owner-1", "a@b.com", "1")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it("differs across owner, mailbox, UID, and batch vs transaction", () => {
    expect(emailAlertImportBatchId("owner-1", "a@b.com", "1")).not.toBe(
      emailAlertImportBatchId("owner-1", "a@b.com", "2")
    );
    expect(emailAlertImportBatchId("owner-1", "a@b.com", "1")).not.toBe(
      emailAlertImportBatchId("owner-1", "c@d.com", "1")
    );
    expect(emailAlertImportBatchId("owner-1", "a@b.com", "1")).not.toBe(
      emailAlertTransactionId("owner-1", "a@b.com", "1")
    );
    // Two Owners could plausibly share an imapUser/mailbox with no uniqueness constraint against it;
    // ownerId in the hash material is what keeps their ids from colliding on the same UID.
    expect(emailAlertImportBatchId("owner-1", "a@b.com", "1")).not.toBe(
      emailAlertImportBatchId("owner-2", "a@b.com", "1")
    );
  });

  it("is stable in local mode, where ownerId is always null", () => {
    expect(emailAlertImportBatchId(null, "a@b.com", "1")).toBe(emailAlertImportBatchId(null, "a@b.com", "1"));
  });
});
