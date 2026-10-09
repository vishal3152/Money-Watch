import { afterEach, describe, expect, it } from "vitest";

import { isCloudMode } from "@/config/deployment-mode";

const ORIGINAL_DEPLOYMENT_MODE = process.env.DEPLOYMENT_MODE;
const ORIGINAL_DESKTOP = process.env.PAISA_WATCH_DESKTOP;
const ORIGINAL_VERCEL = process.env.VERCEL;

afterEach(() => {
  if (ORIGINAL_DEPLOYMENT_MODE === undefined) {
    delete process.env.DEPLOYMENT_MODE;
  } else {
    process.env.DEPLOYMENT_MODE = ORIGINAL_DEPLOYMENT_MODE;
  }

  if (ORIGINAL_DESKTOP === undefined) {
    delete process.env.PAISA_WATCH_DESKTOP;
  } else {
    process.env.PAISA_WATCH_DESKTOP = ORIGINAL_DESKTOP;
  }

  if (ORIGINAL_VERCEL === undefined) {
    delete process.env.VERCEL;
  } else {
    process.env.VERCEL = ORIGINAL_VERCEL;
  }
});

describe("isCloudMode", () => {
  it("returns false when DEPLOYMENT_MODE is unset and not on Vercel", () => {
    delete process.env.DEPLOYMENT_MODE;
    delete process.env.PAISA_WATCH_DESKTOP;
    delete process.env.VERCEL;
    expect(isCloudMode()).toBe(false);
  });

  it("returns false when DEPLOYMENT_MODE is 'local'", () => {
    process.env.DEPLOYMENT_MODE = "local";
    delete process.env.PAISA_WATCH_DESKTOP;
    delete process.env.VERCEL;
    expect(isCloudMode()).toBe(false);
  });

  it("returns true when DEPLOYMENT_MODE is 'cloud' outside the desktop app", () => {
    process.env.DEPLOYMENT_MODE = "cloud";
    delete process.env.PAISA_WATCH_DESKTOP;
    delete process.env.VERCEL;
    expect(isCloudMode()).toBe(true);
  });

  it("returns true on Vercel even when DEPLOYMENT_MODE is unset (no SQLite on serverless)", () => {
    delete process.env.DEPLOYMENT_MODE;
    delete process.env.PAISA_WATCH_DESKTOP;
    process.env.VERCEL = "1";
    expect(isCloudMode()).toBe(true);
  });

  it("returns false on the desktop app even when DEPLOYMENT_MODE is 'cloud'", () => {
    process.env.DEPLOYMENT_MODE = "cloud";
    process.env.PAISA_WATCH_DESKTOP = "1";
    delete process.env.VERCEL;
    expect(isCloudMode()).toBe(false);
  });
});
