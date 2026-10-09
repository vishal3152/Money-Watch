"use client";

import { useActionState } from "react";

import { confirmStockImportBatch, type ConfirmStockImportBatchState } from "@/app/stock-imports/[id]/confirm-actions";
import { useTranslator } from "@/i18n/client";

const initialState: ConfirmStockImportBatchState = {};

export function ConfirmStockImportBatchForm({
  batchId,
  unresolvedDuplicateCount
}: {
  batchId: string;
  unresolvedDuplicateCount: number;
}) {
  const { t, text, plural } = useTranslator();
  const [state, formAction, pending] = useActionState(confirmStockImportBatch, initialState);
  const blocked = unresolvedDuplicateCount > 0;

  return (
    <form action={formAction}>
      <input type="hidden" name="batchId" value={batchId} />
      {state.formError ? (
        <p className="pw-banner-error" role="alert">
          {text(state.formError)}
        </p>
      ) : null}
      {blocked ? (
        <p className="pw-banner-error" role="status">
          {t("imports.confirmBlockedByDuplicates", {
            count: plural("count.suspectedDuplicates", unresolvedDuplicateCount)
          })}
        </p>
      ) : null}
      <button className="pw-button" type="submit" disabled={pending || blocked}>
        {pending ? t("imports.confirming") : t("imports.confirmAll")}
      </button>
    </form>
  );
}
