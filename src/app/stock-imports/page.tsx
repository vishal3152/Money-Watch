import Link from "next/link";

import { BackLink } from "@/app/components/back-link";
import { CollapsibleSectionList } from "@/app/components/collapsible-section-list";
import { DISPLAY_LOCALE } from "@/app/format-money";
import { getShareTradingAccountRepository, getStockImportBatchRepository } from "@/db/repository-factory";
import { getTranslator } from "@/i18n/server";

export const dynamic = "force-dynamic";

function formatBatchDate(iso: string) {
  return new Date(iso).toLocaleString(DISPLAY_LOCALE, { dateStyle: "medium", timeStyle: "short" });
}

export default async function StockImportsPage() {
  const { t } = await getTranslator();
  const [batches, shareTradingAccounts] = await Promise.all([
    (await getStockImportBatchRepository()).listAll(),
    (await getShareTradingAccountRepository()).listAll()
  ]);
  const shareTradingAccountsById = new Map(
    shareTradingAccounts.map((shareTradingAccount) => [shareTradingAccount.id, shareTradingAccount])
  );

  return (
    <main className="pw-main">
      <section className="pw-card" aria-labelledby="stock-imports-heading">
        <BackLink href="/" label={t("common.backToDashboard")} />
        <h1 id="stock-imports-heading">{t("stockImports.heading")}</h1>
        <p className="pw-detail-lede">{t("stockImports.lede")}</p>

        {batches.length === 0 ? (
          <p className="pw-empty">{t("stockImports.empty")}</p>
        ) : (
          <CollapsibleSectionList
            headingId="stock-imports-heading"
            heading={
              <>
                {t("stockImports.heading")}
                <span className="pw-section-count">{batches.length}</span>
              </>
            }
            toggleLabel={t("stockImports.heading")}
          >
            {batches.map((batch) => {
              const shareTradingAccount = shareTradingAccountsById.get(batch.shareTradingAccountId);
              return (
                <li key={batch.id}>
                  <Link href={`/stock-imports/${batch.id}`}>
                    <span className="pw-item-title">
                      {shareTradingAccount
                        ? shareTradingAccount.name
                        : t("stockImports.unknownAccount")}
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
        )}
      </section>
    </main>
  );
}
