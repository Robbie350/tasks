import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/types";
import { signOut } from "@/app/auth/actions";

export default async function Home() {
  const profile = await requireProfile();

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="flex items-center justify-between border-b bg-background px-6 py-3">
        <span className="font-semibold">Team Task Board</span>
        <div className="flex items-center gap-3">
          <div className="text-right leading-tight">
            <p className="text-sm font-medium">{profile.full_name}</p>
            <p className="text-xs text-muted-foreground">{ROLE_LABELS[profile.role]}</p>
          </div>
          <form action={signOut}>
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-2xl p-6">
        <div className="space-y-2 rounded-xl border bg-card p-8 shadow-sm">
          <h1 className="text-xl font-semibold">Welcome, {profile.full_name.split(" ")[0]}</h1>
          <p className="text-sm text-muted-foreground">
            You&apos;re signed in as <strong>{ROLE_LABELS[profile.role]}</strong>. The board arrives
            in step 4.
            {profile.role === "admin" && " User management comes next, in step 3."}
          </p>
        </div>
      </main>
    </div>
  );
}
