import { getDatabase } from "../../../lib/db.mjs";
import { listActiveOutlets } from "../../../lib/catalog-repository.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  const sql = getDatabase();
  if (!sql) return Response.json({ error: "DATABASE_NOT_CONFIGURED" }, { status: 503, headers });
  try {
    return Response.json({ outlets: await listActiveOutlets(sql) }, { headers });
  } catch (err) {
    console.error("outlets query failed", { code: err?.code, name: err?.name });
    return Response.json({ error: "OUTLETS_UNAVAILABLE" }, { status: 503, headers });
  }
}
