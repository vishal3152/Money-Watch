import { redirect } from "next/navigation";

import { ForgotPasswordForm } from "@/app/login/forgot-password/forgot-password-form";
import { getAuthProvider } from "@/config/auth-provider";
import { isCloudMode } from "@/config/deployment-mode";
import { getTranslator } from "@/i18n/server";

export default async function ForgotPasswordPage() {
  if (!isCloudMode() || getAuthProvider() !== "supabase") {
    redirect("/login");
  }

  const { t } = await getTranslator();

  return (
    <main className="pw-main">
      <section className="pw-card" aria-labelledby="forgot-password-heading">
        <h1 id="forgot-password-heading">{t("login.forgotPasswordHeading")}</h1>
        <p className="pw-detail-lede">{t("login.forgotPasswordLede")}</p>
        <ForgotPasswordForm />
      </section>
    </main>
  );
}
