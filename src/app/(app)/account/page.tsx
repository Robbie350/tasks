import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { getI18n } from "@/i18n/server";
import { AppearanceForm, LanguageForm, NameForm, PasswordForm, PhotoForm } from "./forms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: `${t("account.title")} · ${t("common.appName")}` };
}

export default async function AccountPage() {
  const me = await requireProfile();
  const { t } = await getI18n();

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("account.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {me.email} · {t(`roles.${me.role}`)}
        </p>
      </div>

      <Section title={t("account.photoTitle")} description={t("account.photoDesc")}>
        <PhotoForm id={me.id} name={me.full_name} url={me.avatar_url} />
      </Section>

      <Section title={t("account.nameTitle")} description={t("account.nameDesc")}>
        <NameForm fullName={me.full_name} />
      </Section>

      <Section title={t("account.languageTitle")} description={t("account.languageDesc")}>
        <LanguageForm locale={me.locale} />
      </Section>

      <Section title={t("account.appearanceTitle")} description={t("account.appearanceDesc")}>
        <AppearanceForm theme={me.theme} accent={me.accent} />
      </Section>

      <Section title={t("account.passwordTitle")} description={t("account.passwordDesc")}>
        <PasswordForm />
      </Section>
    </main>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}
