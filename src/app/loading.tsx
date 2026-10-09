import { getTranslator } from "@/i18n/server";

export default async function Loading() {
  const { t } = await getTranslator();

  return (
    <main className="pw-main">
      <div className="pw-loading" role="status" aria-label={t("loading.label")}>
        <span className="pw-spinner" />
      </div>
    </main>
  );
}
