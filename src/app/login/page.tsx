import { redirect } from "next/navigation";

import { resolveSystemMessage } from "@/app/components/system-message";
import { getAuthProvider } from "@/config/auth-provider";
import { isCloudMode } from "@/config/deployment-mode";
import { getTranslator } from "@/i18n/server";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; message?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  if (!isCloudMode()) {
    redirect("/");
  }

  const { error, message } = await searchParams;
  const { t } = await getTranslator();
  const simple = getAuthProvider() === "simple";
  const initialMessage = resolveSystemMessage(error ?? message, t);

  return (
    <main className="pw-main">
      <section className="pw-card" aria-labelledby="login-heading">
        <h1 id="login-heading">{t("login.heading")}</h1>
        <p className="pw-detail-lede">{simple ? t("login.simpleLede") : t("login.lede")}</p>
        {simple ? await renderSimpleForm(initialMessage) : await renderForm(initialMessage)}
      </section>
    </main>
  );
}

async function renderForm(initialMessage: ReturnType<typeof resolveSystemMessage>) {
  const { LoginForm } = await import("@/app/login/login-form");
  return <LoginForm initialMessage={initialMessage} />;
}

async function renderSimpleForm(initialMessage: ReturnType<typeof resolveSystemMessage>) {
  const { SimpleLoginForm } = await import("@/app/login/simple-login-form");
  return <SimpleLoginForm initialMessage={initialMessage} />;
}
