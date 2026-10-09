import { redirect } from "next/navigation";

import { ResetPasswordForm } from "@/app/login/reset-password/reset-password-form";
import { getAuthProvider } from "@/config/auth-provider";
import { isCloudMode } from "@/config/deployment-mode";
import { getTranslator } from "@/i18n/server";

export default async function ResetPasswordPage() {
  if (!isCloudMode() || getAuthProvider() !== "supabase") {
    redirect("/login");
  }

  const { t } = await getTranslator();

  return (
    <main className="pw-main">
      <section className="pw-card" aria-labelledby="reset-password-heading">
        <h1 id="reset-password-heading">{t("login.resetPasswordHeading")}</h1>
        <p className="pw-detail-lede">{t("login.resetPasswordLede")}</p>
        <ResetPasswordForm />
      </section>
    </main>
  );
}
