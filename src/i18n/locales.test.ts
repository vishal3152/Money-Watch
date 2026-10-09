import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  LOCALE_SHORT_LABELS,
  SUPPORTED_LOCALES,
  isLocale,
  localeDirection,
  resolveLocale
} from "@/i18n/locales";

describe("locales", () => {
  it("supports exactly English, Chinese and Arabic", () => {
    expect([...SUPPORTED_LOCALES]).toEqual(["en", "zh", "ar"]);
  });

  it("defaults to English", () => {
    expect(DEFAULT_LOCALE).toBe("en");
  });

  it("names the cookie the locale is persisted in", () => {
    expect(LOCALE_COOKIE_NAME).toBe("pw-locale");
  });

  it("recognises supported locale codes", () => {
    expect(isLocale("zh")).toBe(true);
    expect(isLocale("ar")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it("resolves a stored cookie value to its locale", () => {
    expect(resolveLocale("ar")).toBe("ar");
  });

  it("falls back to the default for a missing or tampered cookie value", () => {
    expect(resolveLocale(undefined)).toBe("en");
    expect(resolveLocale(null)).toBe("en");
    expect(resolveLocale("")).toBe("en");
    expect(resolveLocale("ZH")).toBe("en");
    expect(resolveLocale("../../etc/passwd")).toBe("en");
  });

  it("reports Arabic as right-to-left and the rest as left-to-right", () => {
    expect(localeDirection("ar")).toBe("rtl");
    expect(localeDirection("en")).toBe("ltr");
    expect(localeDirection("zh")).toBe("ltr");
  });

  it("defines a compact header label for every supported locale", () => {
    expect(LOCALE_SHORT_LABELS.en).toBe("En");
    expect(Object.keys(LOCALE_SHORT_LABELS)).toEqual([...SUPPORTED_LOCALES]);
  });
});
