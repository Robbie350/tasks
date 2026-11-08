// Used by the Coolify health check. No auth, no database call.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true });
}
