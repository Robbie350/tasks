import { AppHeader } from "@/components/app-header";
import { PrefsSync } from "@/components/prefs-sync";
import { RealtimeRefresher } from "@/components/realtime-refresher";
import { requireProfile } from "@/lib/auth";

// Every page in (app) requires an active, signed-in user.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  return (
    <div className="min-h-screen bg-muted/40">
      <AppHeader profile={profile} />
      <RealtimeRefresher userId={profile.id} />
      <PrefsSync theme={profile.theme} accent={profile.accent} />
      {children}
    </div>
  );
}
