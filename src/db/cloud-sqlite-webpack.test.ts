import { describe, expect, it } from "vitest";

import {
  cloudSqliteTranspilePackages,
  shouldStubBetterSqlite3
} from "@/db/cloud-sqlite-webpack";

describe("shouldStubBetterSqlite3", () => {
  it("is true only for cloud Node server builds", () => {
    expect(
      shouldStubBetterSqlite3({
        cloudBuildWithoutSqlite: true,
        isServer: true,
        nextRuntime: "nodejs"
      })
    ).toBe(true);
  });

  it("skips edge so middleware keeps Next's default externals (buffer)", () => {
    expect(
      shouldStubBetterSqlite3({
        cloudBuildWithoutSqlite: true,
        isServer: true,
        nextRuntime: "edge"
      })
    ).toBe(false);
  });

  it("skips when not a cloud build or not the server compiler", () => {
    expect(
      shouldStubBetterSqlite3({
        cloudBuildWithoutSqlite: false,
        isServer: true,
        nextRuntime: "nodejs"
      })
    ).toBe(false);
    expect(
      shouldStubBetterSqlite3({
        cloudBuildWithoutSqlite: true,
        isServer: false,
        nextRuntime: "nodejs"
      })
    ).toBe(false);
  });
});

describe("cloudSqliteTranspilePackages", () => {
  it("lists better-sqlite3 only for cloud builds so Next does not externalize it", () => {
    expect(cloudSqliteTranspilePackages(true)).toEqual(["better-sqlite3"]);
    expect(cloudSqliteTranspilePackages(false)).toEqual([]);
  });
});
