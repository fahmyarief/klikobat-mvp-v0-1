import test from "node:test";
import assert from "node:assert/strict";
import { handler } from "../neon/farmaboxsync/index.mjs";

test("scheduled sync endpoint is not accessible by ordinary web browsing", async () => {
  const r = await handler(new Request("https://functions.example/", { method: "GET" }));
  assert.equal(r.status, 404);
});

test("scheduled sync requires a Neon trigger invocation marker", async () => {
  const r = await handler(new Request("https://functions.example/", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ trigger: { type: "schedule", name: "farmabox-tamandhika-every15m" },
      data: { scheduled_at: "2026-10-09T09:00:00.000Z" } }),
  }));
  assert.equal(r.status, 403);
});

test("scheduled sync rejects unrelated trigger metadata", async () => {
  const r = await handler(new Request("https://functions.example/", {
    method: "POST", headers: {
      "x-neon-trigger-invocation-id": "test-invocation",
      "content-type": "application/json",
    },
    body: JSON.stringify({ trigger: { type: "schedule", name: "unknown-trigger" },
      data: { scheduled_at: "2026-10-09T09:00:00.000Z" } }),
  }));
  assert.equal(r.status, 403);
});

test("scheduled sync refuses future-dated trigger payload", async () => {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const r = await handler(new Request("https://functions.example/", {
    method: "POST", headers: {
      "x-neon-trigger-invocation-id": "test-trigger-invocation",
      "content-type": "application/json",
    },
    body: JSON.stringify({ trigger: { type: "schedule",
      id: "trigger-d7f55be3-903c-44e0-a779-0f1851e11d6f",
      name: "farmabox-tamandhika-every15m" },
      data: { scheduled_at: future } }),
  }));
  assert.equal(r.status, 400);
});
