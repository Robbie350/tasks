import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · Team Task Board" };

const ERRORS: Record<string, string> = {
  inactive: "This account is not active. Contact your admin.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <div className="w-full max-w-sm space-y-6 rounded-xl border bg-card p-8 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Team Task Board</h1>
          <p className="text-sm text-muted-foreground">Sign in with the account your admin gave you.</p>
        </div>
        <LoginForm initialError={error ? (ERRORS[error] ?? null) : null} />
      </div>
    </main>
  );
}
