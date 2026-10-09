import { describe, expect, it } from "vitest";

import { resolveSettingsLede } from "@/app/settings/settings-copy";
import { getCatalog } from "@/i18n/translator";

describe("resolveSettingsLede", () => {
  it("returns keys that every locale catalog defines", () => {
    for (const key of ["settings.lede.cloud", "settings.lede.desktop", "settings.lede.selfHosted"] as const) {
      expect(getCatalog("ar")).toHaveProperty(key);
    }
  });

  it("shows the cloud copy in cloud mode", () => {
    expect(resolveSettingsLede(false, true)).toBe("settings.lede.cloud");
  });

  it("shows the desktop copy for the Electron shell", () => {
    expect(resolveSettingsLede(true, false)).toBe("settings.lede.desktop");
  });

  it("shows self-hosted copy for a plain browser against local SQLite", () => {
    expect(resolveSettingsLede(false, false)).toBe("settings.lede.selfHosted");
  });

  it("prefers cloud copy over desktop copy if both were somehow true", () => {
    expect(resolveSettingsLede(true, true)).toBe("settings.lede.cloud");
  });
});
