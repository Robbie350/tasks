"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ROLE_LABELS, type Profile } from "@/lib/types";
import { setUserActive, updateUser, type ActionResult } from "./actions";

export function UserRow({ user, isSelf }: { user: Profile; isSelf: boolean }) {
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

  function toggleActive() {
    const verb = user.is_active ? "Deactivate" : "Reactivate";
    const detail = user.is_active
      ? " They will be signed out and can't sign in until reactivated. Their history stays."
      : "";
    if (!confirm(`${verb} ${user.full_name}?${detail}`)) return;
    startTransition(async () => setResult(await setUserActive(user.id, !user.is_active)));
  }

  const message = result && (
    <p className={result.ok ? "mt-1 text-xs text-green-700" : "mt-1 text-xs text-destructive"}>
      {result.ok ? result.message : result.error}
    </p>
  );

  if (editing) {
    return (
      <tr className="border-b bg-muted/30 last:border-0">
        <td className="px-4 py-3 align-top">
          <Input
            aria-label="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            maxLength={100}
          />
        </td>
        <td className="px-4 py-3 align-top">
          <p className="py-2 text-muted-foreground">{user.email}</p>
          <Input
            aria-label="New password"
            placeholder="New password (optional)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="font-mono"
            autoComplete="new-password"
          />
        </td>
        <td className="px-4 py-3 align-top">
          <Select
            aria-label="Role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={isSelf}
            title={isSelf ? "You can't change your own role" : undefined}
          >
            <option value="specialist">Specialist</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </Select>
        </td>
        <td className="px-4 py-3 align-top" />
        <td className="px-4 py-3 text-right align-top">
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save"}
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
              Cancel
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
        {isSelf && <span className="ml-2 text-xs font-normal text-muted-foreground">(you)</span>}
      </td>
      <td className="px-4 py-3">{user.email}</td>
      <td className="px-4 py-3">
        <Badge variant={user.role}>{ROLE_LABELS[user.role]}</Badge>
      </td>
      <td className="px-4 py-3">
        <Badge variant={user.is_active ? "active" : "inactive"}>
          {user.is_active ? "Active" : "Inactive"}
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
            Edit
          </Button>
          {!isSelf && (
            <Button
              size="sm"
              variant={user.is_active ? "ghost" : "outline"}
              className={user.is_active ? "text-destructive hover:text-destructive" : ""}
              disabled={pending}
              onClick={toggleActive}
            >
              {user.is_active ? "Deactivate" : "Reactivate"}
            </Button>
          )}
        </div>
        {message}
      </td>
    </tr>
  );
}
