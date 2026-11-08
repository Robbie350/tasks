import { AppHeader } from "@/components/app-header";
import { requireProfile } from "@/lib/auth";

// Every page in (app) requires an active, signed-in user.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  return (
    <div className="min-h-screen bg-muted/40">
      <AppHeader profile={profile} />
      {children}
    </div>
  );
}
