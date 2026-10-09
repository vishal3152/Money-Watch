import Link from "next/link";

import { BackLink } from "@/app/components/back-link";
import { CollapsibleSectionList } from "@/app/components/collapsible-section-list";
import { ResolveUnresolvedEmailAlertForm } from "@/app/imports/resolve-unresolved-email-alert-form";
import { DISPLAY_LOCALE } from "@/app/format-money";
import { getAccountRepository, getImportBatchRepository, getUnresolvedEmailAlertRepository } from "@/db/repository-factory";
import type { ImportBatch } from "@/domain/import-batch";
import { getTranslator } from "@/i18n/server";
import type { Translator } from "@/i18n/translator";

export const dynamic = "force-dynamic";

function formatBatchDate(iso: string) {
  return new Date(iso).toLocaleString(DISPLAY_LOCALE, { dateStyle: "medium", timeStyle: "short" });
}

/** Human-readable label for a stored `UnresolvedEmailAlert.failureReason` code. */
function formatFailureReason(reason: string, t: Translator["t"]): string {
  if (reason === "invalid-fields") {
    return t("imports.failureInvalidFields");
  }
  if (reason === "implausible-occurredAt") {
    return t("imports.failureImplausibleDate");
  }
  if (reason === "minorUnits") {
    return t("imports.failureMinorUnits");
  }
  if (reason.startsWith("no-match ")) {
    return t("imports.failureNoMatch", { detail: reason.slice("no-match ".length) });
  }
  if (reason.startsWith("multiple-matches ")) {
    return t("imports.failureMultipleMatches", {
      detail: reason.slice("multiple-matches ".length)
    });
  }
  return t("imports.failureOther", { reason });
}

function ImportBatchList({
  headingId,
  toggleLabel,
  batches,
  accountsById,
  t
}: {
  headingId: string;
  toggleLabel: string;
  batches: ImportBatch[];
  accountsById: Map<string, { name: string }>;
  t: Translator["t"];
}) {
  return (
    <CollapsibleSectionList
      headingId={headingId}
      heading={
        <>
          {toggleLabel}
          <span className="pw-section-count">{batches.length}</span>
        </>
      }
      toggleLabel={toggleLabel}
    >
      {batches.map((batch) => {
        const account = accountsById.get(batch.accountId);
        return (
          <li key={batch.id}>
            <Link href={`/imports/${batch.id}`}>
              <span className="pw-item-title">
                {account ? account.name : t("imports.unknownAccount")}
                <span className="pw-item-sub">
                  {t("imports.batchSubtitle", {
                    source: batch.source,
                    when: formatBatchDate(batch.createdAt)
                  })}
                </span>
              </span>
              <span
                className={`pw-trust-status pw-trust-status--${batch.confirmedAt ? "confirmed" : "imported"}`}
              >
                {batch.confirmedAt ? t("imports.confirmed") : t("imports.unconfirmed")}
              </span>
            </Link>
          </li>
        );
      })}
    </CollapsibleSectionList>
  );
}

export default async function ImportsPage() {
  const { t } = await getTranslator();
  const [batches, accounts, unresolvedAlerts] = await Promise.all([
    (await getImportBatchRepository()).listAll(),
    (await getAccountRepository()).listAll(),
    (await getUnresolvedEmailAlertRepository()).listAll()
  ]);
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const accountOptions = accounts.map((account) => ({
    value: account.id,
    label: account.accountNumber
      ? `${account.name} · …${account.accountNumber.replace(/\D/g, "").slice(-4)} (${account.currencyCode})`
      : `${account.name} (${account.currencyCode})`
  }));
  const emailBatches = batches.filter((batch) => batch.source === "email");
  const mcpBatches = batches.filter((batch) => batch.source !== "email");

  return (
    <main className="pw-main">
      <section className="pw-card" aria-labelledby="imports-heading">
        <BackLink href="/" label={t("common.backToDashboard")} />
        <h1 id="imports-heading">{t("imports.heading")}</h1>
        <p className="pw-detail-lede">{t("imports.lede")}</p>

        <section className="pw-section" aria-labelledby="email-sync-heading">
          <h2 id="email-sync-heading">{t("imports.emailSync")}</h2>
          {emailBatches.length === 0 ? (
            <p className="pw-empty">{t("imports.emailSyncEmpty")}</p>
          ) : (
            <ImportBatchList
              headingId="email-sync-batches-heading"
              toggleLabel={t("imports.emailSyncBatches")}
              batches={emailBatches}
              accountsById={accountsById}
              t={t}
            />
          )}

          {unresolvedAlerts.length > 0 ? (
            <div className="pw-section" aria-labelledby="unresolved-alerts-heading">
              <h3 id="unresolved-alerts-heading">
                {t("imports.unresolvedAlerts")}
                <span className="pw-section-count">{unresolvedAlerts.length}</span>
              </h3>
              <p className="pw-detail-lede">{t("imports.unresolvedAlertsLede")}</p>
              <ul className="pw-list">
                {unresolvedAlerts.map((alert) => (
                  <li key={alert.id}>
                    <span>
                      <span className="pw-item-title pw-unresolved-alert-title">
                        {alert.draft.description ?? alert.mailbox}
                        <span className="pw-item-sub">{formatBatchDate(alert.detectedAt)}</span>
                        {alert.failureReason ? (
                          <span className="pw-item-sub">
                            {formatFailureReason(alert.failureReason, t)}
                          </span>
                        ) : null}
                      </span>
                      <span className="pw-badge">{t("imports.needsYou")}</span>
                    </span>
                    <details className="pw-unresolved-alert-review">
                      <summary className="pw-unresolved-alert-toggle">{t("imports.reviewAndImport")}</summary>
                      {accountOptions.length > 0 ? (
                        <ResolveUnresolvedEmailAlertForm
                          alertId={alert.id}
                          draft={alert.draft}
                          invalidFields={alert.invalidFields}
                          accountOptions={accountOptions}
                        />
                      ) : (
                        <p className="pw-unresolved-alert-resolve pw-item-sub">
                          {t("imports.needsAccountFirst")}
                        </p>
                      )}
                    </details>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section className="pw-section" aria-labelledby="mcp-import-heading">
          <h2 id="mcp-import-heading">{t("imports.mcpImport")}</h2>
          {mcpBatches.length === 0 ? (
            <p className="pw-empty">{t("imports.mcpEmpty")}</p>
          ) : (
            <ImportBatchList
              headingId="mcp-import-batches-heading"
              toggleLabel={t("imports.mcpBatches")}
              batches={mcpBatches}
              accountsById={accountsById}
              t={t}
            />
          )}
        </section>
      </section>
    </main>
  );
}
