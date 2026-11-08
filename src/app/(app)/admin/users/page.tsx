import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { AddUserForm } from "./add-user-form";
import { UserRow } from "./user-row";

export const metadata: Metadata = { title: "Users · Team Task Board" };

export default async function UsersPage() {
  const me = await requireRole("admin");

  const supabase = await createClient();
  const { data: users, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, is_active, avatar_url, created_at")
    .order("is_active", { ascending: false })
    .order("full_name")
    .returns<Profile[]>();

  const activeCount = users?.filter((u) => u.is_active).length ?? 0;

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">
            {activeCount} active · {(users?.length ?? 0) - activeCount} inactive. There is no
            sign-up: everyone gets their account here.
          </p>
        </div>
        <AddUserForm />
      </div>

      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Couldn&apos;t load users: {error.message}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
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
