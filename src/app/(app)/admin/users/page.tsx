import type { Metadata } from "next";
import { getI18n } from "@/i18n/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { AddUserForm } from "./add-user-form";
import { UserRow } from "./user-row";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: `${t("users.title")} · ${t("common.appName")}` };
}

export default async function UsersPage() {
  const me = await requireRole("admin");
  const { t } = await getI18n();

  const supabase = await createClient();
  const { data: users, error } = await supabase
    .from("profiles")
    .select("*")
    .order("is_active", { ascending: false })
    .order("full_name")
    .returns<Profile[]>();

  const activeCount = users?.filter((u) => u.is_active).length ?? 0;

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("users.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("users.summary", { active: activeCount, inactive: (users?.length ?? 0) - activeCount })}
          </p>
        </div>
        <AddUserForm />
      </div>

      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t("users.loadError", { error: error.message })}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">{t("users.colName")}</th>
                <th className="px-4 py-3 font-medium">{t("users.colEmail")}</th>
                <th className="px-4 py-3 font-medium">{t("users.colRole")}</th>
                <th className="px-4 py-3 font-medium">{t("users.colStatus")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("users.colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {users?.map((user) => (
                <UserRow key={user.id} user={user} isSelf={user.id === me.id} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
