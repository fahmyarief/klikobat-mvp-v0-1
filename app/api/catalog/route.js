import { getDatabase } from "../../../lib/db.mjs";
import { normalizeCatalogFilters } from "../../../lib/catalog.mjs";
import { listCatalog } from "../../../lib/catalog-repository.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request) {
  let filters;
  try {
    const params = new URL(request.url).searchParams;
    filters = normalizeCatalogFilters({
      outletId: params.get("outletId"),
      q: params.get("q"),
      category: params.get("category"),
    });
  } catch {
    return Response.json({ error: "INVALID_FILTERS" }, { status: 400, headers });
  }
  const sql = getDatabase();
  if (!sql) return Response.json({ error: "DATABASE_NOT_CONFIGURED" }, { status: 503, headers });
  try {
    return Response.json({ products: await listCatalog(sql, filters), outletId: filters.outletId }, { headers });
  } catch (err) {
    console.error("catalog query failed", { code: err?.code, name: err?.name });
    return Response.json({ error: "CATALOG_UNAVAILABLE" }, { status: 503, headers });
  }
}
