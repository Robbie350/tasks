"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createUser, type ActionResult } from "./actions";

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(14));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export function AddUserForm() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    createUser,
    null
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setPassword("");
    }
  }, [state]);

  if (!open) {
    return <Button onClick={() => setOpen(true)}>+ Add user</Button>;
  }

  return (
    <div className="w-full rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">Add user</h2>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>

      <form ref={formRef} action={formAction} className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="new-name">Full name</Label>
          <Input id="new-name" name="full_name" required maxLength={100} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-email">Email</Label>
          <Input id="new-email" name="email" type="email" required autoComplete="off" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-role">Role</Label>
          <Select id="new-role" name="role" defaultValue="specialist">
            <option value="specialist">Specialist</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-password">Starting password</Label>
          <div className="flex gap-2">
            <Input
              id="new-password"
              name="password"
              type="text"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="font-mono"
            />
            <Button type="button" variant="outline" onClick={() => setPassword(generatePassword())}>
              Generate
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            At least 8 characters. Give it to the person privately.
          </p>
        </div>

        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create user"}
          </Button>
          {state && (
            <p
              role="status"
              className={state.ok ? "text-sm text-green-700" : "text-sm text-destructive"}
            >
              {state.ok ? state.message : state.error}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
