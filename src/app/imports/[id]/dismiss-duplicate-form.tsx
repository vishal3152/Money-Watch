"use client";

import { useActionState } from "react";

import { dismissSuspectedDuplicate, type DismissDuplicateState } from "@/app/imports/[id]/dismiss-duplicate-actions";
import { useTranslator } from "@/i18n/client";

const initialState: DismissDuplicateState = {};

export function DismissDuplicateForm({ transactionId, batchId }: { transactionId: string; batchId: string }) {
  const { t, text } = useTranslator();
  const [state, formAction, pending] = useActionState(dismissSuspectedDuplicate, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="transactionId" value={transactionId} />
      <input type="hidden" name="batchId" value={batchId} />
      {state.formError ? (
        <p className="pw-banner-error" role="alert">
          {text(state.formError)}
        </p>
      ) : null}
      <button className="pw-action-chip" type="submit" disabled={pending}>
        {t("imports.dismissDuplicate")}
      </button>
    </form>
  );
}
