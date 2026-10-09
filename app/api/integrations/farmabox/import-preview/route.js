import { timingSafeEqual } from "node:crypto";
import { createFarmaboxApi, fetchPilotProducts } from "../../../../../lib/farmabox-api.mjs";
import { getDatabase } from "../../../../../lib/db.mjs";
import { prepareFarmaboxPreview, performPreviewImport } from "../../../../../lib/farmabox-preview-import.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" };

function authorized(header, secret) {
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const received = Buffer.from(header.slice(7), "utf8");
  const expected = Buffer.from(secret, "utf8");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function POST(request) {
  if (process.env.VERCEL_ENV !== "preview") return Response.json({ error: "NOT_FOUND" }, { status: 404, headers });
  if (!authorized(request.headers.get("authorization"), process.env.FARMABOX_IMPORT_TOKEN)) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401, headers });
  }
  if (!process.env.FARMABOX_API_KEY || !process.env.DATABASE_URL) {
    return Response.json({ error: "NOT_CONFIGURED" }, { status: 503, headers });
  }
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 512) return Response.json({ error: "BODY_TOO_LARGE" }, { status: 413, headers });

  let data;
  try { data = await request.json(); } catch { return Response.json({ error: "BAD_REQUEST" }, { status: 400, headers }); }
  if (!data || !["dry-run", "commit"].includes(data.mode)) {
    return Response.json({ error: "INVALID_MODE" }, { status: 400, headers });
  }

  try {
    const batch = await fetchPilotProducts(createFarmaboxApi());
    const prepared = prepareFarmaboxPreview(batch.products);
    if (prepared.rows.length !== batch.total) throw new Error("SOURCE_COUNT_MISMATCH");
    const result = await performPreviewImport(getDatabase(), prepared, { commit: data.mode === "commit" });
    return Response.json({ success: true, sourceCount: batch.total, audit: prepared.audit,
      ...result, publicProductsActivated: 0 }, { headers });
  } catch (error) {
    // Never output the source API key, data, SQL connection string or product list.
    const code = /^[A-Z][A-Z_]+$/.test(error?.message || "") ? error.message :
      error?.code || "IMPORT_UNAVAILABLE";
    console.error("FarmaBox Preview import failed", { code });
    return Response.json({ success: false, error: code }, { status: code === "CATALOG_ALREADY_POPULATED" ? 409 : 503, headers });
  }
}
