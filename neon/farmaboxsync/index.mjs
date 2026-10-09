// A Neon Function is an HTTP app; only scheduled trigger POSTs may start sync.
// Deploy to Neon branch s1-preview, not to the default/production branch.
import postgres from "postgres";
import { createFarmaboxApi, fetchPilotProducts } from "../../lib/farmabox-api.mjs";
import { preparePreviewSync, syncPreviewSnapshot } from "../../lib/farmabox-preview-sync.mjs";

const headers = { "Cache-Control": "no-store", "Content-Type": "application/json" };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });

export const handler = async request => {
  if (request.method !== "POST" || new URL(request.url).pathname !== "/") {
    return json({ error: "NOT_FOUND" }, 404);
  }
  const invocationId = request.headers.get("x-neon-trigger-invocation-id");
  if (!invocationId || invocationId.length > 160 || !/^[a-zA-Z0-9_-]+$/.test(invocationId)) {
    return json({ error: "TRIGGER_REQUIRED" }, 403);
  }
  if (Number(request.headers.get("content-length") || 0) > 2048) {
    return json({ error: "REQUEST_TOO_LARGE" }, 413);
  }
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ error: "INVALID_REQUEST" }, 400);
  }
  if (data?.trigger?.type !== "schedule" ||
      data?.trigger?.name !== "farmabox-tamandhika-every15m" ||
      data?.trigger?.id !== "trigger-d7f55be3-903c-44e0-a779-0f1851e11d6f" ||
      typeof data?.data?.scheduled_at !== "string") {
    return json({ error: "TRIGGER_INVALID" }, 403);
  }
  const scheduled = new Date(data.data.scheduled_at);
  if (!Number.isFinite(scheduled.getTime()) ||
      scheduled.getTime() > Date.now() + 120_000 ||
      scheduled.getTime() < Date.now() - 3_600_000) {
    return json({ error: "SCHEDULE_OUT_OF_RANGE" }, 400);
  }
  if (!process.env.FARMABOX_API_KEY || !process.env.DATABASE_URL) {
    return json({ error: "NOT_CONFIGURED" }, 503);
  }

  const db = postgres(process.env.DATABASE_URL, {
    max: 1, prepare: false, connect_timeout: 12, idle_timeout: 8,
  });
  try {
    // Fail fast if invoked on a different Neon branch, even before contacting FarmaBox.
    const [identity] = await db`SELECT current_database() AS db,
      current_setting('neon.project_id', true) AS project,
      current_setting('neon.branch_id', true) AS branch`;
    if (identity.project !== "late-union-10460085" ||
        identity.branch !== "br-small-boat-b335j2hx" || identity.db !== "neondb") {
      return json({ error: "WRONG_DATABASE_BRANCH" }, 403);
    }
    const snapshot = await fetchPilotProducts(createFarmaboxApi());
    const prepared = preparePreviewSync(snapshot.products);
    const result = await syncPreviewSnapshot(db, prepared, { scheduledAt: data.data.scheduled_at, dryRun: false });
    return json({ ok: true, branch: result.branch, status: result.status,
      updated: result.updated, sourceCount: snapshot.total, productsPublished: 0 });
  } catch (error) {
    const code = /^[A-Z][A-Z_]+$/.test(error?.message || "")
      ? error.message : "SYNC_UNAVAILABLE";
    console.error("FarmaBox preview sync", { error: code });
    return json({ ok: false, error: code }, 503);
  } finally {
    await db.end({ timeout: 5 });
  }
};

export default { fetch: handler };