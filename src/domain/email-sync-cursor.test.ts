import { describe, expect, it } from "vitest";

import {
  advanceEmailSyncCursor,
  isMessageAlreadySynced,
  parseEmailMessageUid,
  type EmailSyncCursor
} from "@/domain/email-sync-cursor";

const cursor: EmailSyncCursor = {
  mailbox: "owner@example.com",
  uidValidity: "1757000000",
  lastMessageUid: 120,
  updatedAt: "2026-09-09T15:02:13.000Z"
};

describe("parseEmailMessageUid", () => {
  it("splits the UIDVALIDITY-qualified uid the IMAP fetch produces", () => {
    expect(parseEmailMessageUid("1757000000:121")).toEqual({ uidValidity: "1757000000", uid: 121 });
  });

  it("accepts a bare uid from a server that reported no UIDVALIDITY", () => {
    expect(parseEmailMessageUid("121")).toEqual({ uidValidity: null, uid: 121 });
  });

  it("returns null for a uid that isn't numeric", () => {
    expect(parseEmailMessageUid("not-a-uid")).toBeNull();
  });
});

describe("isMessageAlreadySynced", () => {
  it("treats every message as new when no pointer has been recorded yet", () => {
    expect(isMessageAlreadySynced(null, "1757000000:1")).toBe(false);
  });

  it("skips a uid at or below the pointer", () => {
    expect(isMessageAlreadySynced(cursor, "1757000000:120")).toBe(true);
    expect(isMessageAlreadySynced(cursor, "1757000000:7")).toBe(true);
  });

  it("processes a uid above the pointer", () => {
    expect(isMessageAlreadySynced(cursor, "1757000000:121")).toBe(false);
  });

  it("processes everything again when the mailbox's UIDVALIDITY changed — uids restart from 1 and would otherwise be silently skipped as already-synced", () => {
    expect(isMessageAlreadySynced(cursor, "1757999999:3")).toBe(false);
  });

  it("processes a uid it cannot parse rather than skipping it", () => {
    expect(isMessageAlreadySynced(cursor, "not-a-uid")).toBe(false);
  });
});

describe("advanceEmailSyncCursor", () => {
  const now = "2026-09-10T09:00:00.000Z";

  it("records the first processed message", () => {
    expect(
      advanceEmailSyncCursor(null, { mailbox: "owner@example.com", messageUid: "1757000000:5", now })
    ).toEqual({
      mailbox: "owner@example.com",
      uidValidity: "1757000000",
      lastMessageUid: 5,
      updatedAt: now
    });
  });

  it("moves the pointer forward", () => {
    expect(advanceEmailSyncCursor(cursor, { mailbox: cursor.mailbox, messageUid: "1757000000:121", now }))
      .toEqual({ ...cursor, lastMessageUid: 121, updatedAt: now });
  });

  it("reports no write when the message is at or below the pointer", () => {
    expect(
      advanceEmailSyncCursor(cursor, { mailbox: cursor.mailbox, messageUid: "1757000000:119", now })
    ).toBeNull();
  });

  it("restarts the pointer when the mailbox's UIDVALIDITY changed", () => {
    expect(advanceEmailSyncCursor(cursor, { mailbox: cursor.mailbox, messageUid: "1757999999:3", now }))
      .toEqual({ ...cursor, uidValidity: "1757999999", lastMessageUid: 3, updatedAt: now });
  });

  it("reports no write for a uid it cannot parse — an unparseable uid must never move the pointer past real messages", () => {
    expect(
      advanceEmailSyncCursor(cursor, { mailbox: cursor.mailbox, messageUid: "not-a-uid", now })
    ).toBeNull();
  });
});
