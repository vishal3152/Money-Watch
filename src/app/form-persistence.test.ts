import { describe, expect, it } from "vitest";

import { persistFormValues, withPersistedFormState } from "@/app/form-persistence";

describe("form persistence", () => {
  it("captures string FormData fields for restoration after validation errors", () => {
    const formData = new FormData();
    formData.set("principal", "100000");
    formData.set("interestRate", "7.25");
    formData.set("debitNow", "on");

    expect(persistFormValues(formData)).toEqual({
      principal: "100000",
      interestRate: "7.25",
      debitNow: "on"
    });
  });

  it("attaches values and a formKey alongside field errors", () => {
    const formData = new FormData();
    formData.set("name", "HDFC");

    const state = withPersistedFormState(formData, {
      fieldErrors: { name: "Name is required." }
    });

    expect(state.fieldErrors).toEqual({ name: "Name is required." });
    expect(state.values).toEqual({ name: "HDFC" });
    expect(state.formKey.length).toBeGreaterThan(0);
  });

  it("omits secret fields when requested so they never round-trip through action state", () => {
    const formData = new FormData();
    formData.set("imapHost", "imap.example.com");
    formData.set("imapPassword", "secret-password");
    formData.set("openRouterApiKey", "sk-secret");

    expect(
      persistFormValues(formData, { omitKeys: ["imapPassword", "openRouterApiKey"] })
    ).toEqual({ imapHost: "imap.example.com" });
  });
});
