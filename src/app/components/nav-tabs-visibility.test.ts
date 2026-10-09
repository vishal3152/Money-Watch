import { describe, expect, it } from "vitest";

import { shouldShowNavTabs } from "@/app/components/nav-tabs-visibility";

describe("shouldShowNavTabs", () => {
  it("always shows the primary nav in local mode, which has no login screen", () => {
    expect(shouldShowNavTabs({ isCloudMode: false, hasSession: false })).toBe(true);
    expect(shouldShowNavTabs({ isCloudMode: false, hasSession: true })).toBe(true);
  });

  it("hides the primary nav in cloud mode before sign-in", () => {
    expect(shouldShowNavTabs({ isCloudMode: true, hasSession: false })).toBe(false);
  });

  it("shows the primary nav in cloud mode once signed in", () => {
    expect(shouldShowNavTabs({ isCloudMode: true, hasSession: true })).toBe(true);
  });
});
