import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("electron:start", () => {
  it("builds with DEPLOYMENT_MODE=local so a cloud .env.local cannot stub SQLite", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: { "electron:start": string };
    };
    const [buildCommand = ""] = pkg.scripts["electron:start"].split("&&");

    expect(buildCommand).toContain("DEPLOYMENT_MODE=local");
    expect(buildCommand).toContain("pnpm build");
  });
});
