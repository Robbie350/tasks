import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { getDashboard } from "@/lib/dashboard";
import { getI18n } from "@/i18n/server";
import { DashboardView } from "./dashboard-view";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: `${t("dashboard.title")} · ${t("common.appName")}` };
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requireProfile();
  const data = await getDashboard(me);
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
