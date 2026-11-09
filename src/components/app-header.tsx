import Link from "next/link";
import { LayoutGrid, LogOut, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/nav-link";
import { NotificationBell } from "@/components/notification-bell";
import { Avatar } from "@/components/board/avatar";
import { signOut } from "@/app/auth/actions";
import { getI18n } from "@/i18n/server";
import type { Profile } from "@/lib/types";

export async function AppHeader({ profile }: { profile: Profile }) {
  const { t } = await getI18n();
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b bg-background/95 px-3 py-2.5 backdrop-blur sm:gap-4 sm:px-6 sm:py-3">
      <div className="flex min-w-0 items-center gap-2 sm:gap-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold" aria-label={t("common.appName")}>
          <LayoutGrid className="size-5 text-primary md:hidden" aria-hidden />
          <span className="hidden md:inline">{t("common.appName")}</span>
        </Link>
        {/* Scrolls sideways on narrow phones instead of wrapping. */}
        <nav className="flex min-w-0 items-center gap-1 overflow-x-auto text-sm whitespace-nowrap">
          <NavLink href="/">{t("nav.board")}</NavLink>
          <NavLink href="/me">{t("nav.myBoard")}</NavLink>
          {profile.role !== "specialist" && <NavLink href="/reports">{t("nav.reports")}</NavLink>}
          {profile.role === "admin" && <NavLink href="/admin/users">{t("nav.users")}</NavLink>}
        </nav>
      </div>
      <div className="flex shrink-0 items-center gap-1 sm:gap-3">
        {profile.role !== "admin" && <NotificationBell />}
        <Link
          href="/account"
          title={t("nav.myAccount")}
          className="hidden items-center gap-2.5 rounded-md px-2 py-1 text-right leading-tight hover:bg-muted sm:flex"
        >
          <span>
            <span className="block text-sm font-medium">{profile.full_name}</span>
            <span className="block text-xs text-muted-foreground">{t(`roles.${profile.role}`)}</span>
          </span>
          <Avatar id={profile.id} name={profile.full_name} url={profile.avatar_url} className="size-8 ring-0" />
        </Link>
        <Button asChild variant="ghost" size="icon" className="sm:hidden">
          <Link href="/account" aria-label={t("nav.myAccount")}>
            {profile.avatar_url ? (
              <Avatar id={profile.id} name={profile.full_name} url={profile.avatar_url} className="size-7 ring-0" />
            ) : (
              <UserRound />
            )}
          </Link>
        </Button>
        <form action={signOut}>
          <Button type="submit" variant="outline" size="sm" className="hidden sm:inline-flex">
            {t("common.signOut")}
          </Button>
          <Button type="submit" variant="ghost" size="icon" className="sm:hidden" aria-label={t("common.signOut")}>
            <LogOut />
          </Button>
        </form>
      </div>
    </header>
  );
}
