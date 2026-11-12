"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Profile } from "@/lib/types";
import { useT } from "@/i18n/client";
import { useConfirm } from "@/components/confirm-dialog";
import { setUserActive, updateUser, type ActionResult } from "./actions";

export function UserRow({ user, isSelf }: { user: Profile; isSelf: boolean }) {
  const { t, tr } = useT();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(user.full_name);
  const [role, setRole] = useState<string>(user.role);
  const [newPassword, setNewPassword] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await updateUser(user.id, { fullName, role, newPassword });
      setResult(res);
      if (res.ok) {
        setEditing(false);
        setNewPassword("");
      }
    });
  }

  async function toggleActive() {
    const question = user.is_active
      ? t("users.confirmDeactivate", { name: user.full_name })
      : t("users.confirmReactivate", { name: user.full_name });
    const ok = await confirm({
      message: question,
      confirmLabel: user.is_active ? t("users.deactivate") : t("users.reactivate"),
      danger: user.is_active,
    });
    if (!ok) return;
    startTransition(async () => setResult(await setUserActive(user.id, !user.is_active)));
  }

  const message = result && (
    <p className={result.ok ? "mt-1 text-xs text-green-700 dark:text-green-400" : "mt-1 text-xs text-destructive"}>
      {result.ok ? tr(result.message ?? "") : tr(result.error)}
    </p>
  );

  if (editing) {
    return (
      <tr className="border-b bg-muted/30 last:border-0">
        <td className="px-4 py-3 align-top">
          <Input
            aria-label={t("users.fullName")}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            maxLength={100}
          />
        </td>
        <td className="px-4 py-3 align-top">
          <p className="py-2 text-muted-foreground">{user.email}</p>
          <Input
            aria-label={t("users.newPasswordOptional")}
            placeholder={t("users.newPasswordOptional")}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="font-mono"
            autoComplete="new-password"
          />
        </td>
        <td className="px-4 py-3 align-top">
          <Select
            aria-label={t("users.role")}
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={isSelf}
            title={isSelf ? t("users.cantChangeOwnRole") : undefined}
          >
            <option value="specialist">{t("roles.specialist")}</option>
            <option value="manager">{t("roles.manager")}</option>
            <option value="admin">{t("roles.admin")}</option>
          </Select>
        </td>
        <td className="px-4 py-3 align-top" />
        <td className="px-4 py-3 text-right align-top">
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={save} disabled={pending}>
              {pending ? t("common.saving") : t("common.save")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setEditing(false);
                setFullName(user.full_name);
                setRole(user.role);
                setNewPassword("");
                setResult(null);
              }}
            >
              {t("common.cancel")}
            </Button>
          </div>
          {message}
        </td>
      </tr>
    );
  }

  return (
    <tr className={"border-b last:border-0 " + (user.is_active ? "" : "text-muted-foreground")}>
      <td className="px-4 py-3 font-medium">
        {user.full_name}
        {isSelf && <span className="ml-2 text-xs font-normal text-muted-foreground">({t("common.you")})</span>}
      </td>
      <td className="px-4 py-3">{user.email}</td>
      <td className="px-4 py-3">
        <Badge variant={user.role}>{t(`roles.${user.role}`)}</Badge>
      </td>
      <td className="px-4 py-3">
        <Badge variant={user.is_active ? "active" : "inactive"}>
          {user.is_active ? t("users.active") : t("users.inactive")}
        </Badge>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => {
              setResult(null);
              setEditing(true);
            }}
          >
            {t("common.edit")}
          </Button>
          {!isSelf && (
            <Button
              size="sm"
              variant={user.is_active ? "ghost" : "outline"}
              className={user.is_active ? "text-destructive hover:text-destructive" : ""}
              disabled={pending}
              onClick={toggleActive}
            >
              {user.is_active ? t("users.deactivate") : t("users.reactivate")}
            </Button>
          )}
        </div>
        {message}
      </td>
    </tr>
  );
}
