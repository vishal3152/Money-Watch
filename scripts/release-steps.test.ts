import { describe, expect, it } from "vitest";

import { planReleaseSteps } from "./release-steps";

describe("planReleaseSteps", () => {
  it("runs tests before electron, github release, and vercel by default", () => {
    expect(planReleaseSteps()).toEqual([
      "test",
      "typecheck",
      "electron",
      "github",
      "vercel"
    ]);
  });

  it("can skip individual steps", () => {
    expect(
      planReleaseSteps({ skipTypecheck: true, skipGithub: true, skipVercel: true })
    ).toEqual(["test", "electron"]);
  });

  it("rejects an empty plan", () => {
    expect(() =>
      planReleaseSteps({
        skipTests: true,
        skipTypecheck: true,
        skipElectron: true,
        skipGithub: true,
        skipVercel: true
      })
    ).toThrow(/Nothing to run/);
  });

  it("keeps github after electron when both run", () => {
    const steps = planReleaseSteps({
      skipTests: true,
      skipTypecheck: true,
      skipVercel: true
    });
    expect(steps.indexOf("electron")).toBeLessThan(steps.indexOf("github"));
  });
});
