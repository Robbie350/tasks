import Link from "next/link";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/nav-link";
import { NotificationBell } from "@/components/notification-bell";
import { signOut } from "@/app/auth/actions";
import { ROLE_LABELS, type Profile } from "@/lib/types";

export function AppHeader({ profile }: { profile: Profile }) {
  return (
    <header className="flex items-center justify-between gap-4 border-b bg-background px-4 py-3 sm:px-6">
      <div className="flex items-center gap-6">
        <Link href="/" className="font-semibold">
          Team Task Board
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <NavLink href="/">Board</NavLink>
          {profile.role === "admin" && <NavLink href="/admin/users">Users</NavLink>}
        </nav>
      </div>
      <div className="flex items-center gap-3">
        {profile.role !== "admin" && <NotificationBell />}
        <Link
          href="/account"
          title="My account"
          className="hidden rounded-md px-2 py-1 text-right leading-tight hover:bg-muted sm:block"
        >
          <p className="text-sm font-medium">{profile.full_name}</p>
          <p className="text-xs text-muted-foreground">{ROLE_LABELS[profile.role]}</p>
        </Link>
        <form action={signOut}>
          <Button type="submit" variant="outline" size="sm">
            Sign out
          </Button>
        </form>
      </div>
    </header>
  );
}
