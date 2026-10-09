import test from "node:test";
import assert from "node:assert/strict";
import { assertPreviewIdentity, prepareFarmaboxPreview } from "../lib/farmabox-preview-import.mjs";

const base = {
  id: 24806, kode: "8997232790095", barcode: "8997232790095", nama: "MADU SARI KELENGKENG 250ML",
  kategori: "OTC", jenis: "Obat Herbal", satuan: "PCS", is_active: true,
  stok: 1, harga_normal: 48000, harga_display: 45000, diskon_per_item: 3000,
  expiry_status: "safe", tanggal_kadaluarsa: "2028-01-01",
  updated_at: "2026-10-09 11:30:00",
};

test("staging import preserves FarmaBox identity even when barcode duplicates", () => {
  const result = prepareFarmaboxPreview([base, { ...base, id: 24807, nama: "MADU SARI KELENGKENG 120ML" }]);
  assert.equal(result.rows[0].id, "fbx-c1-24806");
  assert.equal(result.rows[1].id, "fbx-c1-24807");
  assert.equal(result.rows[0].barcode, result.rows[1].barcode);
  assert.equal(result.audit.duplicateCodes, 1);
  assert.equal(result.rows[0].sourceUpdatedAt.toISOString(), "2026-10-09T04:30:00.000Z");
});

test("price and stock are staged without classifying products as safe to sell", () => {
  const { rows, audit } = prepareFarmaboxPreview([base, { ...base, id: 1, stok: -1,
    harga_normal: 0, satuan: "", expiry_status: "expired", tanggal_kadaluarsa: null }]);
  assert.equal(rows[0].normalPrice, 48000);
  assert.equal(rows[0].displayPrice, 45000);
  assert.equal(rows[1].stock, null);
  assert.equal(rows[1].normalPrice, null);
  assert.equal(rows[1].unit, "UNKNOWN");
  assert.equal(rows[1].expiryDate, null);
  assert.equal(audit.eligibleForOnlineSale, 0);
});

test("invalid and repeated FarmaBox master IDs fail before any SQL", () => {
  assert.throws(() => prepareFarmaboxPreview([]), /SOURCE_EMPTY/);
  assert.throws(() => prepareFarmaboxPreview([{ ...base, id: 0 }]), /INVALID_SOURCE_PRODUCT/);
  assert.throws(() => prepareFarmaboxPreview([base, { ...base }]), /DUPLICATE_SOURCE_ID/);
});

test("runtime database must match exact Neon Preview branch", () => {
  assert.doesNotThrow(() => assertPreviewIdentity({ project: "late-union-10460085",
    branch: "br-small-boat-b335j2hx", db: "neondb" }));
  assert.throws(() => assertPreviewIdentity({ project: "late-union-10460085",
    branch: "br-tiny-cloud-b3bc0fun", db: "neondb" }), /WRONG_DATABASE_BRANCH/);
});
