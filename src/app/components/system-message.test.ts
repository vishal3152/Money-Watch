import { describe, expect, it } from "vitest";

import { resolveSystemMessage } from "@/app/components/system-message";
import { createTranslator, getCatalog } from "@/i18n/translator";

const { t } = createTranslator("en", getCatalog("en"));
const arabic = createTranslator("ar", getCatalog("ar"));

describe("resolveSystemMessage", () => {
  it("resolves account_created to a success message", () => {
    expect(resolveSystemMessage("account_created", t)).toEqual({
      type: "success",
      text: "Account created. Check your email to confirm your account."
    });
  });

  it("resolves link_expired to an error message", () => {
    expect(resolveSystemMessage("link_expired", t)).toEqual({
      type: "error",
      text: "That sign-in link is invalid or has expired. Please try again."
    });
  });

  it("resolves sign_in_cancelled to an error message", () => {
    expect(resolveSystemMessage("sign_in_cancelled", t)).toEqual({
      type: "error",
      text: "Sign-in was cancelled. Please try again."
    });
  });

  it("resolves database_path_saved to a success message", () => {
    expect(resolveSystemMessage("database_path_saved", t)).toEqual({
      type: "success",
      text: "Database path saved. This app is now using the database at the new location."
    });
  });

  it("resolves entity mutation codes to success messages", () => {
    expect(resolveSystemMessage("institution_created", t)).toEqual({
      type: "success",
      text: "Institution created."
    });
    expect(resolveSystemMessage("bank_account_deleted", t)).toEqual({
      type: "success",
      text: "Account deleted."
    });
    expect(resolveSystemMessage("bank_account_hard_deleted", t)).toEqual({
      type: "success",
      text: "Account and all its history permanently deleted."
    });
    expect(resolveSystemMessage("transfer_updated", t)).toEqual({
      type: "success",
      text: "Transfer updated."
    });
  });

  it("returns undefined for an unknown code, so arbitrary query text never renders", () => {
    expect(resolveSystemMessage("<script>alert(1)</script>", t)).toBeUndefined();
  });

  it("returns undefined when there is no code", () => {
    expect(resolveSystemMessage(undefined, t)).toBeUndefined();
  });

  it("returns undefined for an inherited Object.prototype key, so ?message=constructor can't render one", () => {
    expect(resolveSystemMessage("constructor", t)).toBeUndefined();
    expect(resolveSystemMessage("toString", t)).toBeUndefined();
    expect(resolveSystemMessage("hasOwnProperty", t)).toBeUndefined();
  });

  it("renders the message in the active language", () => {
    expect(resolveSystemMessage("institution_created", arabic.t)).toEqual({
      type: "success",
      text: "تم إنشاء المؤسسة."
    });
  });
});
