import { createFarmaboxApi, fetchPilotProducts } from "../../../../../lib/farmabox-api.mjs";
import { auditFarmaboxProducts } from "../../../../../lib/farmabox-audit.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" };

// Diagnostic endpoint only for Vercel's protected Preview deployments.
// Production must not call FarmaBox or disclose internal catalog metadata.
export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return Response.json({ error: "NOT_FOUND" }, { status: 404, headers });
  }
  if (!process.env.FARMABOX_API_KEY) {
    return Response.json({ error: "SOURCE_NOT_CONFIGURED" }, { status: 503, headers });
  }

  try {
    const api = createFarmaboxApi();
    const ping = await api.ping();
    const batch = await fetchPilotProducts(api);
    return Response.json({
      sourceConnected: true,
      service: ping.data?.service === "KlikObat-FarmaBox API" ? ping.data.service : "UNEXPECTED_SERVICE",
      branchId: batch.branchId,
      audit: auditFarmaboxProducts(batch.products),
      importedToNeon: false,
      productsPublished: false,
    }, { headers });
  } catch (error) {
    console.error("FarmaBox preview diagnostic failed", { code: error?.code || "UNEXPECTED_ERROR" });
    return Response.json({ sourceConnected: false, error: error?.code || "SOURCE_UNAVAILABLE" }, {
      status: 502, headers,
    });
  }
}