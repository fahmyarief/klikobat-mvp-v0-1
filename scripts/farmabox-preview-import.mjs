// One-time operator CLI; requires FARMABOX_API_KEY and preview DATABASE_URL in environment.
// No credential persistence; no product data written to stdout or local disk.
import postgres from "postgres";
import { createFarmaboxApi, fetchPilotProducts } from "../lib/farmabox-api.mjs";
import { prepareFarmaboxPreview, performPreviewImport } from "../lib/farmabox-preview-import.mjs";

const mode = process.argv[2];
if (!["--dry-run", "--commit"].includes(mode) || process.argv.length !== 3) {
  console.error("Usage: node scripts/farmabox-preview-import.mjs --dry-run|--commit");
  process.exitCode = 2;
} else if (!process.env.FARMABOX_API_KEY || !process.env.DATABASE_URL) {
  console.error("Import credentials not configured");
  process.exitCode = 2;
} else {
  const sql = postgres(process.env.DATABASE_URL, {
    max: 1, connect_timeout: 12, idle_timeout: 10, prepare: false,
  });
  try {
    const source = await fetchPilotProducts(createFarmaboxApi());
    const data = prepareFarmaboxPreview(source.products);
    if (data.rows.length !== source.total) throw new Error("SOURCE_COUNT_MISMATCH");
    const result = await performPreviewImport(sql, data, { commit: mode === "--commit" });
    console.log(JSON.stringify({
      sourceCount: source.total, branch: result.branch, dryRun: result.dryRun,
      planned: result.planned ?? null, inserted: result.inserted ?? null,
      pendingLegalReview: data.audit.pendingLegalReview,
      sourceWithStock: data.audit.stockPositive, published: 0,
    }));
  } catch (error) {
    console.error("Import failed:", error?.code || /^[A-Z][A-Z_]+$/.test(error?.message || "") ?
      (error?.code || error?.message) : "UNEXPECTED_ERROR");
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
