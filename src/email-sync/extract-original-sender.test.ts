import { describe, expect, it } from "vitest";

import { extractOriginalSender } from "@/email-sync/extract-original-sender";

describe("extractOriginalSender", () => {
  it("extracts the display name from a Gmail-style forwarded block", () => {
    const body = [
      "Hey, please add this to Paisa Watch.",
      "",
      "---------- Forwarded message ---------",
      "From: RBL Bank <alerts@rblbank.com>",
      "Date: Wed, Sep 9, 2026 at 3:02 PM",
      "Subject: Credit Alert",
      "To: John Doe <john@example.com>",
      "",
      "Greetings from RBL Bank! Your account is credited with INR 1282.05."
    ].join("\n");

    expect(extractOriginalSender(body)).toBe("RBL Bank");
  });

  it("returns null when the body has no forwarded-message marker", () => {
    const body = "Greetings from RBL Bank! Your account is credited with INR 1282.05.";

    expect(extractOriginalSender(body)).toBeNull();
  });

  it("returns null when the forwarded From line has no display name, only a bare address", () => {
    const body = ["---------- Forwarded message ---------", "From: alerts@rblbank.com", "Subject: Credit Alert"].join(
      "\n"
    );

    expect(extractOriginalSender(body)).toBeNull();
  });
});
