// Liveness only. Database, Redis, billing, and filing qualification have separate gates.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
