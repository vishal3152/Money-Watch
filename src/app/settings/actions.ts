"use server";

import { redirect } from "next/navigation";

import { writeDatabasePathToSettings } from "@/config/database-settings";
import { isCloudMode } from "@/config/deployment-mode";
import { resolveDatabasePath } from "@/config/resolve-database-path";
import { withPersistedFormState } from "@/app/form-persistence";
import { normalizeDatabasePath } from "@/app/settings/normalize-database-path";
import { DatabaseError } from "@/db/errors";
import { inspectDatabasePath, type DatabasePathInspection } from "@/db/inspect-database-path";
import type { LocalizedText, MessageKey } from "@/i18n/translator";

export type SettingsFormState = {
  fieldErrors?: {
    databasePath?: LocalizedText;
  };
  formError?: LocalizedText;
  values?: Record<string, string>;
  formKey?: string;
};

export type SaveDatabasePathDeps = {
  redirectTo?: (path: string) => void;
  writeSettings?: (databasePath: string) => void;
  createDb?: (databasePath?: string) => unknown;
};

export async function saveDatabasePath(
  _prevState: SettingsFormState,
  formData: FormData,
  deps: SaveDatabasePathDeps = {}
): Promise<SettingsFormState> {
  // The form that submits here is only rendered outside cloud mode (see
  // settings/page.tsx), but a Server Action is independently callable — this
  // check is the actual enforcement, not the page's conditional rendering.
  if (isCloudMode()) {
    return withPersistedFormState(formData, {
      formError: { key: "errors.databasePathCloudMode" }
    });
  }

  const databasePathInput = String(formData.get("databasePath") ?? "").trim();

  if (databasePathInput.length === 0) {
    return withPersistedFormState(formData, {
      fieldErrors: {
        databasePath: { key: "errors.databasePathRequired" }
      }
    });
  }

  const databasePath = normalizeDatabasePath(databasePathInput);
  const writeSettings = deps.writeSettings ?? writeDatabasePathToSettings;
  const openDb =
    deps.createDb ?? (await import("@/db/client")).createDb;

  try {
    openDb(databasePath);
    writeSettings(databasePath);
    process.env.DATABASE_PATH = databasePath;
  } catch (error) {
    if (error instanceof DatabaseError) {
      return withPersistedFormState(formData, {
        fieldErrors: {
          databasePath: { key: "errors.databasePathUnopenable" }
        }
      });
    }

    throw error;
  }

  const redirectTo = deps.redirectTo ?? redirect;
  redirectTo("/?message=database_path_saved");

  return {};
}

export type PreviewDatabasePathResult =
  | { formError: MessageKey }
  | { normalizedPath: string; inspection: DatabasePathInspection };

export type PreviewDatabasePathDeps = {
  inspect?: (databasePath: string) => DatabasePathInspection;
};

export async function previewDatabasePath(
  databasePathInput: string,
  deps: PreviewDatabasePathDeps = {}
): Promise<PreviewDatabasePathResult> {
  if (isCloudMode()) {
    return { formError: "errors.databasePathCloudMode" };
  }

  const trimmed = databasePathInput.trim();
  if (trimmed.length === 0) {
    return { formError: "errors.databasePathRequired" };
  }

  const normalizedPath = normalizeDatabasePath(trimmed);
  const inspect = deps.inspect ?? inspectDatabasePath;

  return { normalizedPath, inspection: inspect(normalizedPath) };
}

export async function getConfiguredDatabasePath(): Promise<string> {
  if (isCloudMode()) {
    return "";
  }

  return resolveDatabasePath();
}
