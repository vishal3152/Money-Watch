"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { buildMcpClientConfigJson } from "@/app/settings/mcp-connection";
import {
  generateMcpAccessToken,
  revokeMcpAccessToken,
  type McpAccessTokenActionState,
  type McpAccessTokenSummary
} from "@/app/settings/mcp-token-actions";
import { useTranslator } from "@/i18n/client";
import { renderMessage } from "@/i18n/rich-text";

const initialState: McpAccessTokenActionState = {};

function CopyButton({ label, value }: { label: string; value: string }) {
  const { t } = useTranslator();
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="pw-button pw-button-secondary pw-copy-button"
      aria-label={label}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? t("mcp.copied") : t("mcp.copy")}
    </button>
  );
}

function McpCodeBlock({
  label,
  value,
  help
}: {
  label: string;
  value: string;
  help?: string;
}) {
  const { t } = useTranslator();

  return (
    <div className="pw-mcp-code">
      <div className="pw-mcp-code-toolbar">
        <p className="pw-field-help">{label}</p>
        <CopyButton label={t("mcp.copyLabel", { label })} value={value} />
      </div>
      <pre className="pw-mcp-code-pre">
        <code>{value}</code>
      </pre>
      {help ? <p className="pw-field-help">{help}</p> : null}
    </div>
  );
}

/** Full MCP connection guide body for the Settings page's collapsible MCP section (URL, token, mcp.json, header help). */
export function McpSetupGuide({
  endpointUrl,
  cloud,
  initialSummary
}: {
  endpointUrl: string;
  cloud: boolean;
  initialSummary: McpAccessTokenSummary | null;
}) {
  const { t, text } = useTranslator();
  const [generateState, generateAction, generatePending] = useActionState(
    generateMcpAccessToken,
    initialState
  );
  const [revokeState, revokeAction, revokePending] = useActionState(
    revokeMcpAccessToken,
    initialState
  );

  // generateState and revokeState are two independent useActionState hooks, so neither knows
  // about the other's updates. Without this, revoking a token right after generating it left the
  // plaintext token from generateState still displayed (and "Revoke" still offered) even though
  // the DB row backing it was already deleted. Track render-over-render which one last changed
  // (React's "adjusting state during render" pattern — https://react.dev/learn/you-might-not-need-an-effect)
  // so a revoke always wins over an earlier generate.
  const [seenGenerateState, setSeenGenerateState] = useState(generateState);
  const [seenRevokeState, setSeenRevokeState] = useState(revokeState);
  const [tokenRevokedMostRecently, setTokenRevokedMostRecently] = useState(false);

  if (generateState !== seenGenerateState) {
    setSeenGenerateState(generateState);
    setTokenRevokedMostRecently(false);
  }
  if (revokeState !== seenRevokeState) {
    setSeenRevokeState(revokeState);
    if (revokeState.revoked) {
      setTokenRevokedMostRecently(true);
    }
  }

  const justGeneratedToken = tokenRevokedMostRecently ? undefined : generateState.token;
  const tokenExists =
    justGeneratedToken !== undefined || (initialSummary !== null && !revokeState.revoked);

  const configJson = buildMcpClientConfigJson({
    url: endpointUrl,
    ...(cloud ? { accessToken: justGeneratedToken ?? "YOUR_TOKEN_HERE" } : {})
  });

  return (
    <ol className="pw-mcp-steps">
      <li className="pw-mcp-step">
        <h2 className="pw-mcp-step-title">{t("mcp.step1Title")}</h2>
        <p className="pw-detail-lede">
          {t("mcp.step1Lede", {
            https: endpointUrl.startsWith("https://") ? t("mcp.httpsNote") : ""
          })}
        </p>
        <McpCodeBlock label={t("mcp.serverUrlLabel")} value={endpointUrl} />
      </li>

      {cloud ? (
        <li className="pw-mcp-step">
          <h2 className="pw-mcp-step-title">{t("mcp.step2Title")}</h2>
          {justGeneratedToken ? (
            <>
              <p className="pw-detail-lede">{t("mcp.tokenJustGenerated")}</p>
              <McpCodeBlock label={t("mcp.accessTokenLabel")} value={justGeneratedToken} />
            </>
          ) : tokenExists ? (
            <p className="pw-detail-lede">{t("mcp.tokenExists")}</p>
          ) : (
            <p className="pw-detail-lede">{t("mcp.noToken")}</p>
          )}

          {generateState.error ? (
            <p className="pw-banner-error" role="alert">
              {text(generateState.error)}
            </p>
          ) : null}
          {revokeState.error ? (
            <p className="pw-banner-error" role="alert">
              {text(revokeState.error)}
            </p>
          ) : null}

          <div className="pw-mcp-token-actions">
            <form action={generateAction}>
              <button className="pw-button" type="submit" disabled={generatePending}>
                {generatePending
                  ? t("mcp.generating")
                  : tokenExists
                    ? t("mcp.regenerateToken")
                    : t("mcp.generateToken")}
              </button>
            </form>
            {tokenExists ? (
              <form action={revokeAction}>
                <button
                  className="pw-button pw-button-danger"
                  type="submit"
                  disabled={revokePending}
                >
                  {revokePending ? t("mcp.revoking") : t("mcp.revokeToken")}
                </button>
              </form>
            ) : null}
          </div>
        </li>
      ) : null}

      <li className="pw-mcp-step">
        <h2 className="pw-mcp-step-title">
          {cloud ? t("mcp.step3ClientConfig") : t("mcp.step2ClientConfig")}
        </h2>
        <p className="pw-detail-lede">
          {renderMessage(t("mcp.clientConfigLede"), {
            cursorFile: <code>mcp.json</code>,
            claudeFile: <code>.mcp.json</code>
          })}
        </p>
        <McpCodeBlock
          label={t("mcp.configLabel")}
          value={configJson}
          help={
            cloud && justGeneratedToken === undefined
              ? tokenExists
                ? t("mcp.configHelpReplaceToken")
                : t("mcp.configHelpGenerateFirst")
              : cloud
                ? t("mcp.configHelpTokenIncluded")
                : t("mcp.configHelpLocal")
          }
        />
      </li>

      {cloud ? null : (
        <li className="pw-mcp-step">
          <h2 className="pw-mcp-step-title">{t("mcp.step3ClaudeDesktop")}</h2>
          <p className="pw-detail-lede">{t("mcp.claudeDesktopLede")}</p>
        </li>
      )}

      <li className="pw-mcp-step">
        <h2 className="pw-mcp-step-title">{t("mcp.step4Title")}</h2>
        <p className="pw-detail-lede">
          {renderMessage(t("mcp.verifyLede"), {
            toolName: <code>list_accounts</code>,
            importsLink: <Link href="/imports">{t("mcp.statementImports")}</Link>,
            stockImportsLink: (
              <Link href="/stock-imports">{t("mcp.stockTradeImports")}</Link>
            )
          })}
        </p>
      </li>
    </ol>
  );
}
