import Link from "next/link";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/nav-link";
import { NotificationBell } from "@/components/notification-bell";
import { signOut } from "@/app/auth/actions";
import { getI18n } from "@/i18n/server";
import type { Profile } from "@/lib/types";

export async function AppHeader({ profile }: { profile: Profile }) {
  const { t } = await getI18n();
  return (
    <header className="flex items-center justify-between gap-4 border-b bg-background px-4 py-3 sm:px-6">
      <div className="flex items-center gap-6">
        <Link href="/" className="font-semibold">
          {t("common.appName")}
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <NavLink href="/">{t("nav.board")}</NavLink>
          <NavLink href="/me">{t("nav.myBoard")}</NavLink>
          {profile.role === "admin" && <NavLink href="/admin/users">{t("nav.users")}</NavLink>}
        </nav>
      </div>
      <div className="flex items-center gap-3">
        {profile.role !== "admin" && <NotificationBell />}
        <Link
          href="/account"
          title={t("nav.myAccount")}
          className="hidden rounded-md px-2 py-1 text-right leading-tight hover:bg-muted sm:block"
        >
          <p className="text-sm font-medium">{profile.full_name}</p>
          <p className="text-xs text-muted-foreground">{t(`roles.${profile.role}`)}</p>
        </Link>
        <form action={signOut}>
          <Button type="submit" variant="outline" size="sm">
            {t("common.signOut")}
          </Button>
        </form>
      </div>
    </header>
  );
}
