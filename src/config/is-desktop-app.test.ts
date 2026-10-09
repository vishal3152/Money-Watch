import { afterEach, describe, expect, it } from "vitest";

import { isDesktopApp } from "@/config/is-desktop-app";

const ORIGINAL_ENV = process.env.PAISA_WATCH_DESKTOP;

afterEach(() => {
  if (ORIGINAL_ENV === undefined) {
    delete process.env.PAISA_WATCH_DESKTOP;
  } else {
    process.env.PAISA_WATCH_DESKTOP = ORIGINAL_ENV;
  }
});

describe("isDesktopApp", () => {
  it("returns false when PAISA_WATCH_DESKTOP is unset", () => {
    delete process.env.PAISA_WATCH_DESKTOP;
    expect(isDesktopApp()).toBe(false);
  });

  it("returns true when PAISA_WATCH_DESKTOP is '1'", () => {
    process.env.PAISA_WATCH_DESKTOP = "1";
    expect(isDesktopApp()).toBe(true);
  });
});
