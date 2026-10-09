export type ReleaseStep = "test" | "typecheck" | "electron" | "github" | "vercel";

export type ReleasePlanOptions = {
  skipTests?: boolean;
  skipTypecheck?: boolean;
  skipElectron?: boolean;
  skipGithub?: boolean;
  skipVercel?: boolean;
};

/** Ordered release pipeline. Tests always precede packaging/deploy when enabled. */
export function planReleaseSteps(options: ReleasePlanOptions = {}): ReleaseStep[] {
  const steps: ReleaseStep[] = [];

  if (!options.skipTests) {
    steps.push("test");
  }

  if (!options.skipTypecheck) {
    steps.push("typecheck");
  }

  if (!options.skipElectron) {
    steps.push("electron");
  }

  if (!options.skipGithub) {
    steps.push("github");
  }

  if (!options.skipVercel) {
    steps.push("vercel");
  }

  if (steps.length === 0) {
    throw new Error("Nothing to run: every release step was skipped.");
  }

  const electronIndex = steps.indexOf("electron");
  const testIndex = steps.indexOf("test");
  if (electronIndex !== -1 && testIndex !== -1 && testIndex > electronIndex) {
    throw new Error("Tests must run before the Electron package step.");
  }

  const githubIndex = steps.indexOf("github");
  if (githubIndex !== -1 && electronIndex !== -1 && electronIndex > githubIndex) {
    throw new Error("Electron package must be built before the GitHub release upload.");
  }

  return steps;
}
