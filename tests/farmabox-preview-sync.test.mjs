import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSchedule, preparePreviewSync, syncPreviewSnapshot } from "../lib/farmabox-preview-sync.mjs";

const sample = { id: 24806, kode: "8997232790095", nama: "MADU SARI 250ML",
  kategori: "OTC", satuan: "PCS", is_active: true, stok: 2,
  harga_normal: 50000, harga_display: 49000, expiry_status: "safe",
  tanggal_kadaluarsa: "2027-12-01" };

test("snapshot mapper preserves identity, price and stock, never grants online eligibility", () => {
  const s = preparePreviewSync([sample,{...sample,id:24807,nama:"MADU SARI 120ML",stok:4}]);
  assert.equal(s.rows[0].id, "fbx-c1-24806");
  assert.equal(s.rows[1].id, "fbx-c1-24807");
  assert.equal(s.rows[0].stock, 2);
  assert.equal(s.rows[0].displayPrice, 49000);
  assert.equal(s.audit.eligibleForOnlineSale,0);
  assert.equal(s.audit.duplicateCodes,1);
});

test("rejects invalid schedules and invalid or duplicate source IDs", () => {
  assert.throws(() => normalizeSchedule("invalid"), /SCHEDULE_INVALID/);
  assert.throws(() => normalizeSchedule("2026-10-09"), /SCHEDULE_INVALID/);
  assert.throws(() => preparePreviewSync([{...sample,id:0}]), /INVALID_SOURCE_PRODUCT/);
  assert.throws(() => preparePreviewSync([sample,sample]), /DUPLICATE_SOURCE_ID/);
});

test("requires validated snapshot before touching database", async () => {
  await assert.rejects(syncPreviewSnapshot({begin:()=>{throw Error("should not call");}},
    {rows:[]}), /SYNC_INPUT_INVALID/);
});

test("rejects production branch before any data mutation", async () => {
  const sql={begin:async fn=>fn((strings,...args)=>{
    if (String(strings[0]).includes("current_database()")) return [{db:"neondb",project:"late-union-10460085",branch:"br-tiny-cloud-b3bc0fun"}];
    throw Error("UNEXPECTED_SQL");
  })};
  await assert.rejects(syncPreviewSnapshot(sql,preparePreviewSync([sample])), /WRONG_DATABASE_BRANCH/);
});
