import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getConfiguredDatabasePath,
  previewDatabasePath,
  saveDatabasePath,
  type SettingsFormState
} from "@/app/settings/actions";
import { DatabaseError } from "@/db/errors";
import type { DatabasePathInspection } from "@/db/inspect-database-path";

const tempHomes: string[] = [];

vi.mock("node:os", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:os")>();

  return {
    ...original,
    homedir: () => tempHomes.at(-1) ?? original.homedir()
  };
});

function formDataWithPath(databasePath: string): FormData {
  const formData = new FormData();
  formData.set("databasePath", databasePath);
  return formData;
}

describe("saveDatabasePath", () => {
  beforeEach(() => {
    tempHomes.push(mkdtempSync(join(tmpdir(), "paisa-watch-settings-action-")));
  });

  afterEach(() => {
    const home = tempHomes.pop();
    if (home) {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("rejects an empty database path", async () => {
    const redirectTo = vi.fn();

    const result = await saveDatabasePath({} as SettingsFormState, formDataWithPath("   "), {
      redirectTo
    });

    expect(result).toMatchObject({
      fieldErrors: {
        databasePath: { key: "errors.databasePathRequired" }
      },
      values: { databasePath: "   " }
    });
    expect(result.formKey).toBeTruthy();
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("persists a valid database path and redirects home", async () => {
    const root = mkdtempSync(join(tmpdir(), "paisa-watch-settings-db-"));
    const databasePath = join(root, "custom.db");
    const redirectTo = vi.fn();
    const writtenPaths: string[] = [];

    try {
      const result = await saveDatabasePath({} as SettingsFormState, formDataWithPath(databasePath), {
        redirectTo,
        writeSettings: (path) => {
          writtenPaths.push(path);
        }
      });

      expect(result).toEqual({});
      expect(writtenPaths).toEqual([databasePath]);
      expect(redirectTo).toHaveBeenCalledWith("/?message=database_path_saved");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("treats an existing directory as a database location and appends paisa-watch.db", async () => {
    const directory = mkdtempSync(join(tmpdir(), "paisa-watch-settings-dir-"));
    const redirectTo = vi.fn();
    const writtenPaths: string[] = [];
    const openedPaths: string[] = [];

    try {
      const result = await saveDatabasePath({} as SettingsFormState, formDataWithPath(directory), {
        redirectTo,
        writeSettings: (path) => {
          writtenPaths.push(path);
        },
        createDb: (path) => {
          openedPaths.push(path ?? "");
          return {} as ReturnType<typeof import("@/db/client").createDb>;
        }
      });

      const expectedPath = join(directory, "paisa-watch.db");
      expect(result).toEqual({});
      expect(openedPaths).toEqual([expectedPath]);
      expect(writtenPaths).toEqual([expectedPath]);
      expect(redirectTo).toHaveBeenCalledWith("/?message=database_path_saved");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("refuses to run in cloud mode without touching the database path", async () => {
    const redirectTo = vi.fn();
    const writtenPaths: string[] = [];
    const openedPaths: string[] = [];
    const originalDeploymentMode = process.env.DEPLOYMENT_MODE;
    const originalEnvPath = process.env.DATABASE_PATH;
    process.env.DEPLOYMENT_MODE = "cloud";
    delete process.env.DATABASE_PATH;

    try {
      const result = await saveDatabasePath({} as SettingsFormState, formDataWithPath("/tmp/whatever.db"), {
        redirectTo,
        writeSettings: (path) => {
          writtenPaths.push(path);
        },
        createDb: (path) => {
          openedPaths.push(path ?? "");
          return {} as ReturnType<typeof import("@/db/client").createDb>;
        }
      });

      expect(result.formError).toBeTruthy();
      expect(openedPaths).toEqual([]);
      expect(writtenPaths).toEqual([]);
      expect(process.env.DATABASE_PATH).toBeUndefined();
      expect(redirectTo).not.toHaveBeenCalled();
    } finally {
      if (originalDeploymentMode === undefined) {
        delete process.env.DEPLOYMENT_MODE;
      } else {
        process.env.DEPLOYMENT_MODE = originalDeploymentMode;
      }
      if (originalEnvPath === undefined) {
        delete process.env.DATABASE_PATH;
      } else {
        process.env.DATABASE_PATH = originalEnvPath;
      }
    }
  });

  it("does not persist settings or mutate DATABASE_PATH when the new path cannot be opened", async () => {
    const redirectTo = vi.fn();
    const writtenPaths: string[] = [];
    const originalEnvPath = process.env.DATABASE_PATH;
    process.env.DATABASE_PATH = "/original/path/paisa-watch.db";

    try {
      const result = await saveDatabasePath(
        {} as SettingsFormState,
        formDataWithPath("/does/not/exist/paisa-watch.db"),
        {
          redirectTo,
          writeSettings: (path) => {
            writtenPaths.push(path);
          },
          createDb: () => {
            throw new DatabaseError("Failed to open the database.");
          }
        }
      );

      expect(result).toMatchObject({
        fieldErrors: {
          databasePath: { key: "errors.databasePathUnopenable" }
        }
      });
      expect(result.values?.databasePath).toBe("/does/not/exist/paisa-watch.db");
      expect(result.formKey).toBeTruthy();
      expect(writtenPaths).toEqual([]);
      expect(process.env.DATABASE_PATH).toBe("/original/path/paisa-watch.db");
      expect(redirectTo).not.toHaveBeenCalled();
    } finally {
      process.env.DATABASE_PATH = originalEnvPath;
    }
  });
});

describe("previewDatabasePath", () => {
  beforeEach(() => {
    tempHomes.push(mkdtempSync(join(tmpdir(), "paisa-watch-settings-preview-")));
  });

  afterEach(() => {
    const home = tempHomes.pop();
    if (home) {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("rejects an empty path without inspecting anything", async () => {
    const inspect = vi.fn();

    const result = await previewDatabasePath("   ", { inspect });

    expect(result).toEqual({ formError: "errors.databasePathRequired" });
    expect(inspect).not.toHaveBeenCalled();
  });

  it("normalizes the input and reports the inspection result", async () => {
    const inspection: DatabasePathInspection = { kind: "new" };
    const inspect = vi.fn().mockReturnValue(inspection);

    const result = await previewDatabasePath("/some/custom.db", { inspect });

    expect(result).toEqual({ normalizedPath: "/some/custom.db", inspection });
    expect(inspect).toHaveBeenCalledWith("/some/custom.db");
  });

  it("refuses to run in cloud mode", async () => {
    const originalDeploymentMode = process.env.DEPLOYMENT_MODE;
    process.env.DEPLOYMENT_MODE = "cloud";
    const inspect = vi.fn();

    try {
      const result = await previewDatabasePath("/some/custom.db", { inspect });

      expect(result).toEqual({
        formError: "errors.databasePathCloudMode"
      });
      expect(inspect).not.toHaveBeenCalled();
    } finally {
      if (originalDeploymentMode === undefined) {
        delete process.env.DEPLOYMENT_MODE;
      } else {
        process.env.DEPLOYMENT_MODE = originalDeploymentMode;
      }
    }
  });
});

describe("getConfiguredDatabasePath", () => {
  it("returns an empty path in cloud mode instead of the server's local path", async () => {
    const originalDeploymentMode = process.env.DEPLOYMENT_MODE;
    process.env.DEPLOYMENT_MODE = "cloud";

    try {
      await expect(getConfiguredDatabasePath()).resolves.toBe("");
    } finally {
      if (originalDeploymentMode === undefined) {
        delete process.env.DEPLOYMENT_MODE;
      } else {
        process.env.DEPLOYMENT_MODE = originalDeploymentMode;
      }
    }
  });
});
