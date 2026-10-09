"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";

import {
  previewDatabasePath,
  saveDatabasePath,
  type PreviewDatabasePathResult,
  type SettingsFormState
} from "@/app/settings/actions";
import { RequiredMark } from "@/app/components/required-mark";
import { useTranslator } from "@/i18n/client";
import type { Translator } from "@/i18n/translator";

type SettingsFormProps = {
  currentDatabasePath: string;
};

const initialState: SettingsFormState = {};

function describePreview(
  result: PreviewDatabasePathResult,
  translator: Translator
): {
  text: string;
  canConfirm: boolean;
  isError: boolean;
} {
  const { t, plural } = translator;

  if ("formError" in result) {
    return { text: t(result.formError), canConfirm: false, isError: true };
  }

  const { inspection } = result;
  if (inspection.kind === "new") {
    return {
      text: t("settings.database.newPath"),
      canConfirm: true,
      isError: false
    };
  }
  if (inspection.kind === "unreadable") {
    return {
      text: t("settings.database.unreadable"),
      canConfirm: false,
      isError: true
    };
  }

  const { institutions, accounts, fixedDeposits, transactions } = inspection.counts;
  if (institutions + accounts + fixedDeposits + transactions === 0) {
    return {
      text: t("settings.database.emptyPath"),
      canConfirm: true,
      isError: false
    };
  }

  return {
    text: t("settings.database.existingData", {
      institutions: plural("count.institutions", institutions),
      accounts: plural("count.accounts", accounts),
      fixedDeposits: plural("count.fixedDeposits", fixedDeposits),
      transactions: plural("count.transactions", transactions)
    }),
    canConfirm: true,
    isError: false
  };
}

export function SettingsForm({ currentDatabasePath }: SettingsFormProps) {
  const translator = useTranslator();
  const { t, text } = translator;
  const [state, formAction, pending] = useActionState(saveDatabasePath, initialState);
  const databasePathInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [canPickDatabaseFile, setCanPickDatabaseFile] = useState(false);
  const [canPickDatabaseDirectory, setCanPickDatabaseDirectory] = useState(false);
  const [preview, setPreview] = useState<PreviewDatabasePathResult | null>(null);
  const [isPreviewing, startPreviewTransition] = useTransition();
  const databasePathError = state.fieldErrors?.databasePath;

  useEffect(() => {
    setCanPickDatabaseFile(typeof window.paisaWatch?.pickDatabaseFile === "function");
    setCanPickDatabaseDirectory(typeof window.paisaWatch?.pickDatabaseDirectory === "function");
  }, []);

  useEffect(() => {
    if (databasePathInputRef.current && databasePathInputRef.current.value.length === 0) {
      databasePathInputRef.current.value = currentDatabasePath;
    }
  }, [currentDatabasePath]);

  function setSelectedPath(selectedPath: string | null) {
    if (!selectedPath || !databasePathInputRef.current) {
      return;
    }

    databasePathInputRef.current.value = selectedPath;
    setPreview(null);
  }

  async function handlePickFileClick() {
    if (!window.paisaWatch?.pickDatabaseFile || !databasePathInputRef.current) {
      return;
    }

    setSelectedPath(await window.paisaWatch.pickDatabaseFile());
  }

  async function handlePickDirectoryClick() {
    if (!window.paisaWatch?.pickDatabaseDirectory || !databasePathInputRef.current) {
      return;
    }

    setSelectedPath(await window.paisaWatch.pickDatabaseDirectory());
  }

  function handleCheckClick() {
    const inputValue = databasePathInputRef.current?.value ?? "";

    if (inputValue.trim() === currentDatabasePath.trim()) {
      formRef.current?.requestSubmit();
      return;
    }

    startPreviewTransition(async () => {
      setPreview(await previewDatabasePath(inputValue));
    });
  }

  const previewDescription = preview ? describePreview(preview, translator) : null;

  return (
    <form key={state.formKey ?? "new"} ref={formRef} action={formAction} noValidate>
      <div className="pw-field">
        <label htmlFor="database-path">
          {t("settings.database.fileLabel")}
          <RequiredMark />
        </label>
        <div className="pw-field-row">
          <input
            id="database-path"
            name="databasePath"
            type="text"
            ref={databasePathInputRef}
            defaultValue={state.values?.databasePath ?? currentDatabasePath}
            autoComplete="off"
            spellCheck={false}
            required
            onChange={() => setPreview(null)}
            aria-invalid={databasePathError ? true : undefined}
            aria-describedby={databasePathError ? "database-path-error" : "database-path-help"}
          />
          {canPickDatabaseFile ? (
            <button
              className="pw-button pw-button-secondary"
              type="button"
              onClick={() => void handlePickFileClick()}
            >
              {t("settings.database.pickFile")}
            </button>
          ) : null}
          {canPickDatabaseDirectory ? (
            <button
              className="pw-button pw-button-secondary"
              type="button"
              onClick={() => void handlePickDirectoryClick()}
            >
              {t("settings.database.pickFolder")}
            </button>
          ) : null}
        </div>
        <p className="pw-field-help" id="database-path-help">
          {t("settings.database.help")}
        </p>
        {databasePathError ? (
          <p className="pw-field-error" id="database-path-error" role="alert">
            {text(databasePathError)}
          </p>
        ) : null}
      </div>
      {state.formError ? (
        <p className="pw-banner-error" role="alert">
          {text(state.formError)}
        </p>
      ) : null}
      {previewDescription ? (
        <div className="pw-confirm-panel" role="status">
          <p className={previewDescription.isError ? "pw-banner-error" : "pw-banner-success"}>
            {previewDescription.text}
          </p>
          <div className="pw-actions">
            <button
              className="pw-button pw-button-secondary"
              type="button"
              onClick={() => setPreview(null)}
            >
              {t("common.cancel")}
            </button>
            {previewDescription.canConfirm ? (
              <button className="pw-button" type="submit" disabled={pending}>
                {pending ? t("common.saving") : t("settings.database.confirmAndSave")}
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <button
          className="pw-button"
          type="button"
          onClick={handleCheckClick}
          disabled={isPreviewing}
        >
          {isPreviewing ? t("settings.database.checking") : t("settings.database.save")}
        </button>
      )}
    </form>
  );
}
