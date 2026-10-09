import { describe, expect, it } from "vitest";

import {
  TEXT_FIELD_MAX_LENGTH,
  textFieldLengthError
} from "@/app/form-limits";

describe("textFieldLengthError", () => {
  it("allows strings up to the shared max length", () => {
    expect(textFieldLengthError("a".repeat(TEXT_FIELD_MAX_LENGTH))).toBeUndefined();
  });

  it("rejects strings longer than the shared max length", () => {
    expect(textFieldLengthError("a".repeat(TEXT_FIELD_MAX_LENGTH + 1))).toEqual({
      key: "errors.textTooLong",
      params: { max: TEXT_FIELD_MAX_LENGTH }
    });
  });
});
