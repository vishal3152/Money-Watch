"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";

import {
  saveEmailSyncSettings,
  type EmailSyncSettingsFormState,
  type EmailSyncSettingsSummary
} from "@/app/settings/email-sync-actions";
import { RequiredMark } from "@/app/components/required-mark";
import { DISPLAY_LOCALE } from "@/app/format-money";
import { useTranslator } from "@/i18n/client";
import { renderMessage } from "@/i18n/rich-text";
import type { MessageKey, Translator } from "@/i18n/translator";

type EmailSyncSettingsFormProps = {
  currentSettings: EmailSyncSettingsSummary;
  /** Cloud mode runs on a fixed Vercel Cron schedule (docs/specs/email-alert-sync.md), not this
   * setting — the field is hidden there rather than shown as if it does something. */
  isCloudMode?: boolean;
  /** When true, show the "public host only" LLM help — cloud mode on a non-loopback Host. */
  enforceLlmHostSafety?: boolean;
};

const initialState: EmailSyncSettingsFormState = {};

/** Prefill for first-time setup — most users wire a Gmail mailbox. */
const DEFAULT_IMAP_HOST = "imap.gmail.com";
const DEFAULT_IMAP_PORT = "993";

type CheckNowResult =
  | { ok: true; result: { matched: number; unresolved: number; ignored: number; skipped: number } }
  /** `errorKey` is set when the route authored the message itself; operational failures
   * (IMAP, the LLM provider) arrive only as `error`, in whatever language they came back in. */
  | { ok: false; error: string; errorKey?: MessageKey };

function formatLastChecked(lastCheckedAt: string | null, t: Translator["t"]): string {
  if (!lastCheckedAt) {
    return t("settings.emailSync.neverChecked");
  }
  return t("settings.emailSync.lastChecked", {
    when: new Date(lastCheckedAt).toLocaleString(DISPLAY_LOCALE, {
      dateStyle: "medium",
      timeStyle: "short"
    })
  });
}

function EmailSyncStatusPanel({ currentSettings }: { currentSettings: EmailSyncSettingsSummary }) {
  const { t } = useTranslator();
  const router = useRouter();
  const [checkResult, setCheckResult] = useState<CheckNowResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const isConfigured =
    currentSettings.imapHost.length > 0 &&
    currentSettings.hasImapPassword &&
    currentSettings.llmBaseUrl.length > 0 &&
    currentSettings.llmModel.length > 0;

  if (!isConfigured) {
    return null;
  }

  async function handleCheckNow() {
    setIsChecking(true);
    try {
      const response = await fetch("/api/email-sync/check-now", { method: "POST" });
      const data = (await response.json()) as CheckNowResult;
      setCheckResult(data);
      router.refresh();
    } catch {
      setCheckResult({ ok: false, error: t("settings.emailSync.unreachable") });
    } finally {
      setIsChecking(false);
    }
  }

  const { status } = currentSettings;

  return (
    <div className="pw-field">
      <span className="pw-field-legend">{t("settings.emailSync.statusLabel")}</span>
      <p className={status.lastResult === "error" ? "pw-banner-error" : "pw-field-help"} role="status">
        {formatLastChecked(status.lastCheckedAt, t)}
        {status.lastResult === "success" ? ` ${t("settings.emailSync.lastSucceeded")}` : null}
        {status.lastResult === "error"
          ? ` ${t("settings.emailSync.lastFailed", { error: status.lastErrorMessage ?? "" })}`
          : null}
      </p>
      <button
        className="pw-button pw-button-secondary"
        type="button"
        onClick={() => void handleCheckNow()}
        disabled={isChecking}
      >
        {isChecking ? t("settings.emailSync.checking") : t("settings.emailSync.checkNow")}
      </button>
      {checkResult ? (
        <p className={checkResult.ok ? "pw-banner-success" : "pw-banner-error"} role="status">
          {checkResult.ok
            ? t("settings.emailSync.checkResult", {
                matched: checkResult.result.matched,
                unresolved: checkResult.result.unresolved,
                ignored: checkResult.result.ignored,
                skipped: checkResult.result.skipped
              })
            : checkResult.errorKey
              ? t(checkResult.errorKey)
              : checkResult.error}
        </p>
      ) : null}
    </div>
  );
}

export function EmailSyncSettingsForm({
  currentSettings,
  isCloudMode = false,
  enforceLlmHostSafety = false
}: EmailSyncSettingsFormProps) {
  const { t, text } = useTranslator();
  const [state, formAction, pending] = useActionState(saveEmailSyncSettings, initialState);
  const values = state.values;
  const errors = state.fieldErrors;

  return (
    <form key={state.formKey ?? "new"} action={formAction} noValidate>
      <EmailSyncStatusPanel currentSettings={currentSettings} />
      <fieldset className="pw-fieldset">
        <legend>{t("settings.emailSync.mailbox")}</legend>
        <div className="pw-field">
          <label htmlFor="imap-host">
            {t("settings.emailSync.imapHost")}
            <RequiredMark />
          </label>
          <input
            id="imap-host"
            name="imapHost"
            type="text"
            inputMode="url"
            autoComplete="off"
            defaultValue={(values?.imapHost ?? currentSettings.imapHost) || DEFAULT_IMAP_HOST}
            aria-invalid={errors?.imapHost ? true : undefined}
            aria-describedby={
              errors?.imapHost ? "imap-host-error" : "imap-mailbox-defaults-help"
            }
          />
          {errors?.imapHost ? (
            <p className="pw-field-error" id="imap-host-error" role="alert">
              {text(errors.imapHost)}
            </p>
          ) : null}
        </div>

        <div className="pw-field">
          <label htmlFor="imap-port">
            {t("settings.emailSync.imapPort")}
            <RequiredMark />
          </label>
          <input
            id="imap-port"
            name="imapPort"
            type="number"
            inputMode="numeric"
            autoComplete="off"
            defaultValue={(values?.imapPort ?? currentSettings.imapPort) || DEFAULT_IMAP_PORT}
            aria-invalid={errors?.imapPort ? true : undefined}
            aria-describedby={
              errors?.imapPort ? "imap-port-error" : "imap-mailbox-defaults-help"
            }
          />
          <p className="pw-field-help" id="imap-mailbox-defaults-help">
            {t("settings.emailSync.imapDefaultsHelp", {
              host: DEFAULT_IMAP_HOST,
              port: DEFAULT_IMAP_PORT
            })}
          </p>
          {errors?.imapPort ? (
            <p className="pw-field-error" id="imap-port-error" role="alert">
              {text(errors.imapPort)}
            </p>
          ) : null}
        </div>

        <div className="pw-field">
          <label htmlFor="imap-user">
            {t("settings.emailSync.imapUser")}
            <RequiredMark />
          </label>
          <input
            id="imap-user"
            name="imapUser"
            type="email"
            inputMode="email"
            autoComplete="off"
            defaultValue={values?.imapUser ?? currentSettings.imapUser}
            aria-invalid={errors?.imapUser ? true : undefined}
            aria-describedby={errors?.imapUser ? "imap-user-error" : undefined}
          />
          {errors?.imapUser ? (
            <p className="pw-field-error" id="imap-user-error" role="alert">
              {text(errors.imapUser)}
            </p>
          ) : null}
        </div>

        <div className="pw-field">
          <label htmlFor="imap-password">
            {t("settings.emailSync.imapPassword")}
            {currentSettings.hasImapPassword ? null : <RequiredMark />}
          </label>
          <input
            id="imap-password"
            name="imapPassword"
            type="password"
            autoComplete="off"
            defaultValue={values?.imapPassword ?? ""}
            aria-invalid={errors?.imapPassword ? true : undefined}
            aria-describedby={errors?.imapPassword ? "imap-password-error" : "imap-password-help"}
          />
          <p className="pw-field-help" id="imap-password-help">
            {renderMessage(
              t("settings.emailSync.passwordHelp", {
                saved: currentSettings.hasImapPassword
                  ? t("settings.emailSync.passwordSaved")
                  : t("settings.emailSync.passwordNotSaved")
              }),
              {
                appPasswordLink: (
                  <a
                    href="https://support.google.com/accounts/answer/185833?hl=en"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("settings.emailSync.appPasswordLinkText")}
                  </a>
                )
              }
            )}
          </p>
          {errors?.imapPassword ? (
            <p className="pw-field-error" id="imap-password-error" role="alert">
              {text(errors.imapPassword)}
            </p>
          ) : null}
        </div>
      </fieldset>

      <fieldset className="pw-fieldset">
        <legend>{t("settings.emailSync.processing")}</legend>
        <p className="pw-field-help">
          {renderMessage(t("settings.emailSync.processingHelp"), {
            ollamaLink: (
              <a href="https://ollama.com" target="_blank" rel="noreferrer">
                Ollama
              </a>
            )
          })}
        </p>
        <div className="pw-field">
          <label htmlFor="llm-base-url">
            {t("settings.emailSync.llmBaseUrl")}
            <RequiredMark />
          </label>
          <input
            id="llm-base-url"
            name="llmBaseUrl"
            type="text"
            inputMode="url"
            autoComplete="off"
            placeholder="https://openrouter.ai/api/v1/chat/completions"
            defaultValue={values?.llmBaseUrl ?? currentSettings.llmBaseUrl}
            aria-invalid={errors?.llmBaseUrl ? true : undefined}
            aria-describedby={errors?.llmBaseUrl ? "llm-base-url-error" : "llm-base-url-help"}
          />
          <p className="pw-field-help" id="llm-base-url-help">
            {renderMessage(t("settings.emailSync.llmBaseUrlHelp"), {
              https: <code>https://</code>,
              http: <code>http://</code>,
              exampleUrl: <code>https://openrouter.ai/api/v1/chat/completions</code>,
              bareHost: <code>openrouter.ai</code>,
              openAiUrl: <code>https://api.openai.com/v1/chat/completions</code>,
              ollamaUrl: <code>http://localhost:11434/v1/chat/completions</code>
            })}
            {enforceLlmHostSafety ? ` ${t("settings.emailSync.publicHostOnly")}` : null}
          </p>
          {errors?.llmBaseUrl ? (
            <p className="pw-field-error" id="llm-base-url-error" role="alert">
              {text(errors.llmBaseUrl)}
            </p>
          ) : null}
        </div>

        <div className="pw-field">
          <label htmlFor="llm-model">
            {t("settings.emailSync.llmModel")}
            <RequiredMark />
          </label>
          <input
            id="llm-model"
            name="llmModel"
            type="text"
            autoComplete="off"
            placeholder="openai/gpt-4o-mini"
            defaultValue={values?.llmModel ?? currentSettings.llmModel}
            aria-invalid={errors?.llmModel ? true : undefined}
            aria-describedby={errors?.llmModel ? "llm-model-error" : "llm-model-help"}
          />
          <p className="pw-field-help" id="llm-model-help">
            {renderMessage(t("settings.emailSync.llmModelHelp"), {
              openRouterModel: <code>openai/gpt-4o-mini</code>,
              ollamaModel: <code>llama3.1</code>
            })}
          </p>
          {errors?.llmModel ? (
            <p className="pw-field-error" id="llm-model-error" role="alert">
              {text(errors.llmModel)}
            </p>
          ) : null}
        </div>

        <div className="pw-field">
          <label htmlFor="llm-api-key">{t("settings.emailSync.llmApiKey")}</label>
          <input
            id="llm-api-key"
            name="llmApiKey"
            type="password"
            autoComplete="off"
            defaultValue={values?.llmApiKey ?? ""}
            aria-describedby="llm-api-key-help"
          />
          <p className="pw-field-help" id="llm-api-key-help">
            {t("settings.emailSync.apiKeyHelp", {
              saved: currentSettings.hasLlmApiKey
                ? `${t("settings.emailSync.apiKeySaved")} `
                : ""
            })}
          </p>
        </div>

        {isCloudMode ? (
          <p className="pw-field-help">{t("settings.emailSync.cloudSchedule")}</p>
        ) : (
          <div className="pw-field">
            <label htmlFor="poll-interval-minutes">{t("settings.emailSync.pollInterval")}</label>
            <input
              id="poll-interval-minutes"
              name="pollIntervalMinutes"
              type="number"
              inputMode="numeric"
              autoComplete="off"
              defaultValue={values?.pollIntervalMinutes ?? currentSettings.pollIntervalMinutes ?? "5"}
              aria-invalid={errors?.pollIntervalMinutes ? true : undefined}
              aria-describedby={errors?.pollIntervalMinutes ? "poll-interval-minutes-error" : undefined}
            />
            {errors?.pollIntervalMinutes ? (
              <p className="pw-field-error" id="poll-interval-minutes-error" role="alert">
                {text(errors.pollIntervalMinutes)}
              </p>
            ) : null}
          </div>
        )}
      </fieldset>

      {state.formError ? (
        <p className="pw-banner-error" role="alert">
          {text(state.formError)}
        </p>
      ) : null}
      {state.formSuccess ? (
        <p className="pw-banner-success" role="status">
          {t(state.formSuccess)}
        </p>
      ) : null}
      <button className="pw-button" type="submit" disabled={pending}>
        {pending ? t("common.saving") : t("settings.emailSync.submit")}
      </button>
    </form>
  );
}
