import Link from "next/link";
import { notFound } from "next/navigation";

import { BackLink } from "@/app/components/back-link";
import { CollapsibleSectionList } from "@/app/components/collapsible-section-list";
import { resolveSystemMessage } from "@/app/components/system-message";
import { SystemMessageBanner } from "@/app/components/system-message-banner";
import { formatCalendarDate } from "@/app/format-calendar-date";
import {
  formatFixedDepositSubtitle,
  formatTransferPurpose
} from "@/app/format-fixed-deposit";
import { formatMinorUnits } from "@/app/format-money";
import {
  getAccountRepository,
  getFixedDepositRepository,
  getInstitutionRepository,
  getTransferRepository
} from "@/db/repository-factory";
import { getTranslator } from "@/i18n/server";

export const dynamic = "force-dynamic";

type FixedDepositDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ message?: string }>;
};

function formatBasisPoints(basisPoints: number) {
  return `${Math.floor(basisPoints / 100)}.${String(basisPoints % 100).padStart(2, "0")}%`;
}

export default async function FixedDepositDetailPage({ params, searchParams }: FixedDepositDetailPageProps) {
  const { id } = await params;
  const { message } = await searchParams;
  const { t } = await getTranslator();
  const systemMessage = resolveSystemMessage(message, t);
  const fixedDeposit = await (await getFixedDepositRepository()).getById(id);

  if (!fixedDeposit) {
    notFound();
  }

  const [institution, linkedAccount, transfers] = await Promise.all([
    getInstitutionRepository().then((repo) => repo.getById(fixedDeposit.institutionId)),
    getAccountRepository().then((repo) => repo.getById(fixedDeposit.linkedAccountId)),
    getTransferRepository().then((repo) => repo.listByLeg(id))
  ]);
  const hasOpeningTransfer = transfers.some(
    (transfer) => transfer.purpose === "fixed-deposit-opening"
  );
  const withdrawalTransfers = transfers.filter(
    (transfer) => transfer.purpose === "fixed-deposit-withdrawal"
  );
  const closingTransfer =
    withdrawalTransfers.length > 0
      ? withdrawalTransfers.reduce((latest, transfer) =>
          transfer.occurredAt > latest.occurredAt ? transfer : latest
        )
      : null;
  const statusExplanation =
    fixedDeposit.status === "Matured"
      ? t("fixedDeposits.detail.maturedExplanation")
      : fixedDeposit.status === "PrematurelyClosed"
        ? t("fixedDeposits.detail.prematurelyClosedExplanation")
        : null;

  return (
    <main className="pw-main">
      <article className="pw-detail">
        <BackLink
          href={`/institutions/${fixedDeposit.institutionId}`}
          label={
            institution
              ? t("common.backTo", { name: institution.name })
              : t("accounts.detail.backToInstitution")
          }
        />
        <h1>{fixedDeposit.name}</h1>
        <p className="pw-detail-lede">
          {institution ? (
            <Link href={`/institutions/${institution.id}`}>{institution.name}</Link>
          ) : null}
          {" · "}
          {formatFixedDepositSubtitle(fixedDeposit, t)}
        </p>
        {systemMessage ? <SystemMessageBanner message={systemMessage} /> : null}
        <dl className="pw-facts">
          <div>
            <dt>{t("fixedDeposits.detail.status")}</dt>
            <dd>{t(`fixedDepositStatus.${fixedDeposit.status}`)}</dd>
          </div>
          {fixedDeposit.accountNumber ? (
            <div>
              <dt>{t("fixedDeposits.detail.accountNumber")}</dt>
              <dd>{fixedDeposit.accountNumber}</dd>
            </div>
          ) : null}
          <div>
            <dt>{t("fixedDeposits.detail.currentPrincipal")}</dt>
            <dd>{formatMinorUnits(fixedDeposit.principalMinor, fixedDeposit.currencyCode)}</dd>
          </div>
          <div>
            <dt>{t("fixedDeposits.detail.originalPrincipal")}</dt>
            <dd>
              {formatMinorUnits(
                fixedDeposit.originalPrincipalMinor,
                fixedDeposit.currencyCode
              )}
            </dd>
          </div>
          <div>
            <dt>{t("fixedDeposits.detail.interestRate")}</dt>
            <dd>{formatBasisPoints(fixedDeposit.interestRateBps)}</dd>
          </div>
          <div>
            <dt>{t("fixedDeposits.detail.openedDate")}</dt>
            <dd>{formatCalendarDate(fixedDeposit.openedDate)}</dd>
          </div>
          <div>
            <dt>{t("fixedDeposits.detail.maturityDate")}</dt>
            <dd>{formatCalendarDate(fixedDeposit.maturityDate)}</dd>
          </div>
          <div>
            <dt>{t("fixedDeposits.detail.linkedAccount")}</dt>
            <dd>
              {linkedAccount ? (
                <Link href={`/accounts/${linkedAccount.id}`}>{linkedAccount.name}</Link>
              ) : (
                t("fixedDeposits.detail.unavailable")
              )}
            </dd>
          </div>
        </dl>
        <section className="pw-section" aria-labelledby="fd-transfers-heading">
          {transfers.length === 0 ? (
            <>
              <h2 id="fd-transfers-heading">{t("fixedDeposits.detail.relatedTransfers")}</h2>
              <p className="pw-empty">{t("fixedDeposits.detail.noTransfers")}</p>
            </>
          ) : (
            <CollapsibleSectionList
              headingId="fd-transfers-heading"
              heading={t("fixedDeposits.detail.relatedTransfers")}
              toggleLabel={t("fixedDeposits.detail.relatedTransfers")}
            >
              {transfers.map((transfer) => {
                const isOutbound = transfer.sourceFixedDepositId === fixedDeposit.id;
                const amountMinor = isOutbound
                  ? transfer.sourceAmountMinor
                  : transfer.destinationAmountMinor;
                const currencyCode = isOutbound
                  ? transfer.sourceCurrencyCode
                  : transfer.destinationCurrencyCode;
                return (
                  <li key={transfer.id}>
                    <Link href={`/transfers/${transfer.id}`}>
                      <span className="pw-item-title">
                        {formatTransferPurpose(transfer.purpose, t)}
                        <span className="pw-item-sub">
                          {transfer.description}
                          {" · "}
                          {formatCalendarDate(transfer.occurredAt.slice(0, 10))}
                        </span>
                      </span>
                      <span className="pw-item-amount">
                        {isOutbound ? "−" : "+"}
                        {formatMinorUnits(amountMinor, currencyCode)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </CollapsibleSectionList>
          )}
        </section>

        {fixedDeposit.status === "Open" ? (
          <>
            <p className="pw-detail-lede pw-section-note">
              {t("fixedDeposits.detail.actionsNote")}
            </p>
            <div className="pw-actions pw-sticky-actions">
              {!hasOpeningTransfer ? (
                <Link
                  className="pw-action-primary"
                  href={`/transfers/new?destinationFixedDepositId=${fixedDeposit.id}&purpose=fixed-deposit-opening`}
                >
                  {t("fixedDeposits.detail.recordOpeningDebit")}
                </Link>
              ) : null}
              <Link
                className={hasOpeningTransfer ? "pw-action-primary" : undefined}
                href={`/transfers/new?destinationFixedDepositId=${fixedDeposit.id}&purpose=fixed-deposit-top-up`}
              >
                {t("fixedDeposits.detail.topUp")}
              </Link>
              <Link
                href={`/transfers/new?sourceFixedDepositId=${fixedDeposit.id}&purpose=fixed-deposit-withdrawal`}
              >
                {t("fixedDeposits.detail.withdraw")}
              </Link>
            </div>
          </>
        ) : (
          <p className="pw-detail-lede pw-section-note">
            {statusExplanation}
            {closingTransfer ? (
              <>
                {" "}
                <Link href={`/transfers/${closingTransfer.id}`}>
                  {t("fixedDeposits.detail.viewWithdrawalTransfer")}
                </Link>.
              </>
            ) : null}
          </p>
        )}
      </article>
    </main>
  );
}
