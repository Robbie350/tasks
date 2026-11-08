import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { getPersonalBoard } from "@/lib/personal";
import { getI18n } from "@/i18n/server";
import { PersonalBoard } from "@/components/personal/personal-board";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: `${t("personal.title")} · ${t("common.appName")}` };
}

export default async function MyBoardPage() {
  await requireProfile();
  const { t } = await getI18n();
  const data = await getPersonalBoard(t("personal.defaultColumns").split(","));
  return <PersonalBoard initial={data} />;
}
