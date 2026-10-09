import { describe, expect, it, vi } from "vitest";

import { parseAlertEmail } from "@/email-sync/parse-alert-email";

const rblAlertEmail = {
  subject: "Credit Alert",
  senderName: "RBL Bank <alerts@rblbank.com>",
  body: "Greetings from RBL Bank! This is to inform you that your account XXXX1602 is credited with INR 1282.05 on 09-09-2026 15:02:13 ref NEFT/IN22625213464969/CENTRAL DEPOSITORY SERVICES. Your available balance is INR 468531.58. Regards, RBL Bank Ltd."
};

const validRblAlert = {
  direction: "credit",
  amount: "1282.05",
  currencyCode: "INR",
  occurredAt: "2026-09-09",
  accountNumberSuffix: "1602",
  institutionName: "RBL Bank",
  description: "NEFT/IN22625213464969/CENTRAL DEPOSITORY SERVICES",
  reference: "NEFT/IN22625213464969",
  balance: "468531.58"
};

describe("parseAlertEmail", () => {
  it("passes the email to the injected LLM call and returns its validated result once the classifier says it's a transaction update", async () => {
    const callLlm = vi.fn().mockResolvedValue(validRblAlert);
    const classifyIsTransactionUpdate = vi.fn().mockResolvedValue(true);

    const result = await parseAlertEmail(rblAlertEmail, { callLlm, classifyIsTransactionUpdate });

    expect(classifyIsTransactionUpdate).toHaveBeenCalledWith({
      senderName: rblAlertEmail.senderName,
      originalSenderName: undefined,
      subject: rblAlertEmail.subject
    });
    expect(callLlm).toHaveBeenCalledWith(rblAlertEmail);
    expect(result).toEqual({ status: "valid", alert: validRblAlert });
  });

  it("reports every invalid field of an LLM response that doesn't validate, keeping its values as a draft the owner can correct", async () => {
    const callLlm = vi.fn().mockResolvedValue({ ...validRblAlert, direction: "sideways", amount: "INR 1282.05" });
    const classifyIsTransactionUpdate = vi.fn().mockResolvedValue(true);

    const result = await parseAlertEmail(rblAlertEmail, { callLlm, classifyIsTransactionUpdate });

    expect(result.status).toBe("invalid");
    expect(result.status === "invalid" && result.invalidFields).toEqual(["direction", "amount"]);
    expect(result.status === "invalid" && result.draft.amount).toBe("INR 1282.05");
  });

  it("ignores an email the sender/subject classifier says isn't a transaction update, without calling the full-parse LLM", async () => {
    const callLlm = vi.fn();
    const classifyIsTransactionUpdate = vi.fn().mockResolvedValue(false);

    const result = await parseAlertEmail(rblAlertEmail, { callLlm, classifyIsTransactionUpdate });

    expect(result).toEqual({ status: "ignored" });
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("forwards the originalSenderName to the classifier when the email was manually forwarded", async () => {
    const callLlm = vi.fn().mockResolvedValue(validRblAlert);
    const classifyIsTransactionUpdate = vi.fn().mockResolvedValue(true);
    const forwardedEmail = { ...rblAlertEmail, senderName: "John Doe <john@example.com>", originalSenderName: "RBL Bank" };

    await parseAlertEmail(forwardedEmail, { callLlm, classifyIsTransactionUpdate });

    expect(classifyIsTransactionUpdate).toHaveBeenCalledWith({
      senderName: "John Doe <john@example.com>",
      originalSenderName: "RBL Bank",
      subject: rblAlertEmail.subject
    });
  });
});
