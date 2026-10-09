import { describe, expect, it } from "vitest";

import { buildImapCandidateSearchQuery } from "@/email-sync/imap-candidate-search";

describe("buildImapCandidateSearchQuery", () => {
  const recentSince = new Date("2026-09-06T00:00:00.000Z");

  it("keeps unseen-or-recent search when Gmail raw search is unavailable", () => {
    expect(
      buildImapCandidateSearchQuery({
        recentSince,
        supportGmailRawSearch: false
      })
    ).toEqual({
      or: [{ seen: false }, { since: recentSince }]
    });
  });

  it("excludes Gmail Promotions and Social categories when raw search is available", () => {
    expect(
      buildImapCandidateSearchQuery({
        recentSince,
        supportGmailRawSearch: true
      })
    ).toEqual({
      or: [{ seen: false }, { since: recentSince }],
      gmraw: "-category:promotions -category:social"
    });
  });
});
