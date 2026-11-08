import { Button } from "@/components/ui/button";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

// Always render on request so the Supabase check reflects the live connection.
export const dynamic = "force-dynamic";

type Status = { ok: boolean; label: string; detail: string };

async function checkSupabase(): Promise<Status> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      label: "Not configured",
      detail: "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    };
  }
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/health`, {
      headers: { apikey: supabaseAnonKey! },
      cache: "no-store",
    });
    if (res.ok) {
      return { ok: true, label: "Connected", detail: new URL(supabaseUrl!).host };
    }
    return { ok: false, label: "Error", detail: `Supabase responded with HTTP ${res.status}.` };
  } catch (err) {
    return {
      ok: false,
      label: "Unreachable",
      detail: err instanceof Error ? err.message : "Could not reach Supabase.",
    };
  }
}

export default async function Home() {
  const supabase = await checkSupabase();

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6 rounded-xl border bg-card p-8 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Team Task Board</h1>
          <p className="text-sm text-muted-foreground">
            Step 1 of 7: project setup. The board comes later.
          </p>
        </div>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">Supabase</p>
            <p className="text-xs text-muted-foreground">{supabase.detail}</p>
          </div>
          <span
            className={
              "rounded-full px-2.5 py-1 text-xs font-medium " +
              (supabase.ok
                ? "bg-green-100 text-green-800"
                : "bg-amber-100 text-amber-800")
            }
          >
            {supabase.label}
          </span>
        </div>

        <Button className="w-full" disabled>
          Log in (step 2)
        </Button>
      </div>
    </main>
  );
}
