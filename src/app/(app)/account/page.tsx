import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/types";
import { AppearanceForm, NameForm, PasswordForm } from "./forms";

export const metadata: Metadata = { title: "My account · Team Task Board" };

export default async function AccountPage() {
  const me = await requireProfile();

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My account</h1>
        <p className="text-sm text-muted-foreground">
          {me.email} · {ROLE_LABELS[me.role]}
        </p>
      </div>

      <Section title="Name" description="Shown on cards, notes and the activity log.">
        <NameForm fullName={me.full_name} />
      </Section>

      <Section title="Appearance" description="Only affects you. Saved to your account.">
        <AppearanceForm theme={me.theme} accent={me.accent} />
      </Section>

      <Section title="Password" description="At least 8 characters.">
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
