import type { Metadata } from "next";
import { getI18n } from "@/i18n/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: `${t("login.submit")} · ${t("common.appName")}` };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { t } = await getI18n();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-muted/40 p-6">
      <div className="w-full max-w-sm space-y-6 rounded-xl border bg-card p-8 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("login.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("login.subtitle")}</p>
        </div>
        <LoginForm initialError={error === "inactive" ? t("login.inactive") : null} />
      </div>
      <LanguageSwitcher />
    </main>
  );
}
