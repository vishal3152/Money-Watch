import { describe, expect, it } from "vitest";

import { createTranslator, getCatalog } from "@/i18n/translator";
import { SUPPORTED_LOCALES } from "@/i18n/locales";
import { en } from "@/i18n/messages/en";

describe("createTranslator", () => {
  it("returns the message for the active locale", () => {
    expect(createTranslator("en", getCatalog("en")).t("nav.dashboard")).toBe("Dashboard");
    expect(createTranslator("zh", getCatalog("zh")).t("nav.dashboard")).toBe("仪表板");
  });

  it("interpolates named parameters", () => {
    const t = createTranslator("en", { "test.greeting": "Hello {name}, you have {n} messages" });
    expect(t.t("test.greeting" as never, { name: "Sam", n: 3 })).toBe(
      "Hello Sam, you have 3 messages"
    );
  });

  it("replaces every occurrence of a repeated parameter", () => {
    const t = createTranslator("en", { "test.repeat": "{a} then {a}" });
    expect(t.t("test.repeat" as never, { a: "x" })).toBe("x then x");
  });

  it("leaves an unsupplied placeholder untouched rather than printing undefined", () => {
    const t = createTranslator("en", { "test.gap": "Hi {name}" });
    expect(t.t("test.gap" as never)).toBe("Hi {name}");
  });

  it("selects the plural form for the count", () => {
    const t = createTranslator("en", getCatalog("en"));
    expect(t.plural("count.accounts", 1)).toBe("1 account");
    expect(t.plural("count.accounts", 4)).toBe("4 accounts");
  });

  it("uses the 'other' form for Chinese, which has no plural distinction", () => {
    const t = createTranslator("zh", { "x.one": "ONE", "x.other": "OTHER" });
    expect(t.plural("x" as never, 1)).toBe("OTHER");
    expect(t.plural("x" as never, 4)).toBe("OTHER");
  });

  it("falls back to the 'other' form for a plural category the catalog does not author", () => {
    // Arabic's CLDR categories include zero/two/few/many; the catalogs author one/other only.
    const t = createTranslator("ar", { "x.one": "ONE {count}", "x.other": "OTHER {count}" });
    expect(t.plural("x" as never, 1)).toBe("ONE 1");
    expect(t.plural("x" as never, 0)).toBe("OTHER 0");
    expect(t.plural("x" as never, 11)).toBe("OTHER 11");
  });

  it("exposes the active locale", () => {
    expect(createTranslator("ar", getCatalog("ar")).locale).toBe("ar");
  });
});

const placeholders = (value: string) => (value.match(/\{[a-zA-Z]+\}/g) ?? []).sort();

describe("catalogs", () => {
  it("has identical key sets across every supported locale", () => {
    const englishKeys = Object.keys(en).sort();
    for (const locale of SUPPORTED_LOCALES) {
      expect(Object.keys(getCatalog(locale)).sort(), `catalog ${locale}`).toEqual(englishKeys);
    }
  });

  it("leaves no message empty in any locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const [key, value] of Object.entries(getCatalog(locale))) {
        expect(value.trim(), `${locale}:${key}`).not.toBe("");
      }
    }
  });

  it("never introduces a {placeholder} the English source does not supply", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const catalog = getCatalog(locale);
      for (const [key, source] of Object.entries(en)) {
        for (const placeholder of placeholders(catalog[key as keyof typeof en])) {
          expect(placeholders(source), `${locale}:${key}`).toContain(placeholder);
        }
      }
    }
  });

  it("carries every English {placeholder} through to each translation", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const catalog = getCatalog(locale);
      for (const [key, source] of Object.entries(en)) {
        for (const placeholder of placeholders(source)) {
          // A singular form may omit the numeral — Arabic says "حساب واحد", not "1 حساب".
          if (placeholder === "{count}" && key.endsWith(".one")) {
            continue;
          }
          expect(catalog[key as keyof typeof en], `${locale}:${key}`).toContain(placeholder);
        }
      }
    }
  });

  it("pairs every plural '.one' key with a '.other' key", () => {
    for (const key of Object.keys(en)) {
      if (key.endsWith(".one")) {
        expect(en).toHaveProperty(`${key.slice(0, -".one".length)}.other`);
      }
    }
  });
});

describe("localized text", () => {
  it("renders a bare key", () => {
    const t = createTranslator("en", { "x": "plain" });
    expect(t.text({ key: "x" as never })).toBe("plain");
  });

  it("renders a key with its parameters", () => {
    const t = createTranslator("en", { "x": "at most {max}" });
    expect(t.text({ key: "x" as never, params: { max: 60 } })).toBe("at most 60");
  });
});

