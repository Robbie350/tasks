import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/types";

export default async function Home() {
  const profile = await requireProfile();

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="space-y-2 rounded-xl border bg-card p-8 shadow-sm">
        <h1 className="text-xl font-semibold">Welcome, {profile.full_name.split(" ")[0]}</h1>
        <p className="text-sm text-muted-foreground">
          You&apos;re signed in as <strong>{ROLE_LABELS[profile.role]}</strong>. The board arrives in
          step 4.
        </p>
        {profile.role === "admin" && (
          <p className="text-sm">
            <Link href="/admin/users" className="font-medium underline underline-offset-4">
              Manage users →
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
