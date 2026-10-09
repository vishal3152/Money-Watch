import type { LocalizedText } from "@/i18n/translator";

/** Shared max length for free-text form fields (names, descriptions). */
export const TEXT_FIELD_MAX_LENGTH = 60;

export function textFieldLengthError(value: string): LocalizedText | undefined {
  if (value.length > TEXT_FIELD_MAX_LENGTH) {
    return { key: "errors.textTooLong", params: { max: TEXT_FIELD_MAX_LENGTH } };
  }
  return undefined;
}
