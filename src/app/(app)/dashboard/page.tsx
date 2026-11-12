import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { getDashboard, type DashboardData } from "@/lib/dashboard";
import { getI18n } from "@/i18n/server";
import { DashboardView } from "./dashboard-view";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: `${t("dashboard.title")} · ${t("common.appName")}` };
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requireProfile();
  const { t } = await getI18n();

  let data: DashboardData;
  try {
    data = await getDashboard(me);
  } catch (e) {
    // Show what went wrong instead of a blank "Application error" page.
    console.error("Dashboard failed to load", e);
    return (
      <main className="mx-auto max-w-2xl space-y-3 p-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t("dashboard.title")}</h1>
        <div className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-5 text-sm">
          <p className="font-medium">{t("dashboard.loadError")}</p>
          <p className="font-mono text-xs break-words text-muted-foreground">{e instanceof Error ? e.message : String(e)}</p>
        </div>
      </main>
    );
  }

  const tab = (await searchParams).tab;
  const isLead = me.role === "manager" || me.role === "admin";
  return (
    <DashboardView
      data={data}
      me={{ id: me.id, role: me.role, name: me.full_name }}
      // The admin has no tasks of their own, so they start on Team.
      initialTab={isLead && (tab === "team" || (tab !== "mine" && me.role === "admin")) ? "team" : "mine"}
    />
  );
}
