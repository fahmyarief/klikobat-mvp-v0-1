import test from "node:test";
import assert from "node:assert/strict";
import { createFarmaboxApi, fetchPilotProducts } from "../lib/farmabox-api.mjs";
import { auditFarmaboxProducts } from "../lib/farmabox-audit.mjs";

function mockClient({ authorized = true, branch = 1, mismatch = false } = {}) {
  const urls = [];
  const key = "test-only-api-key-that-is-not-real";
  const fetchImpl = async (url, options) => {
    urls.push(String(url));
    assert.equal(options.method, "GET");
    assert.equal(options.headers["X-API-KEY"], key);
    assert.equal(options.cache, "no-store");
    assert.equal(options.redirect, "error");
    if (!authorized) return { status: 401, ok: false };
    const u = new URL(url);
    const page = Number(u.searchParams.get("page"));
    let json;
    if (u.pathname.endsWith("/cabang")) json = { success: true, data: [{ id: branch }] };
    else if (u.pathname.endsWith("/ping")) json = { success: true, data: { service: "KlikObat-FarmaBox API" } };
    else {
      assert.equal(u.searchParams.get("cabang_id"), "1");
      json = {
        success: true,
        meta: { cabang_id: mismatch ? 2 : 1 },
        pagination: { total: 3, last_page: 2, current_page: page },
        data: page === 1 ? [
          { id: 42, kode: "AB", kategori: "OTC", jenis: "Antibiotik", is_active: true, stok: 2, satuan: "STRIP", harga_normal: 1000, expiry_status: "safe" },
          { id: 43, kode: "BC", kategori: "Ethical", jenis: "Antihistamin", is_active: false, stok: 0, satuan: "TABLET", harga_normal: 0, expiry_status: "expired" },
        ] : [{ id: 44, kode: "AB", kategori: "OTC", jenis: "Vitamin", is_active: true, stok: 1, satuan: "", harga_normal: 5500, expiry_status: "no_date" }],
      };
    }
    return { status: 200, ok: true, json: async () => json };
  };
  return { api: createFarmaboxApi({ apiKey: key, fetchImpl }), urls };
}

test("server-only client fetches paginated branch 1 without leaking secret", async () => {
  const { api, urls } = mockClient();
  const { products, total, branchId } = await fetchPilotProducts(api);
  assert.equal(products.length, 3);
  assert.equal(total, 3);
  assert.equal(branchId, 1);
  assert.equal(urls.length, 3);
  assert(!urls.some(u => u.includes("test-only-api-key")));
});

test("audit flags stock, expiry, and OTC-antibiotic conflicts without approving items", async () => {
  const { api } = mockClient();
  const { products } = await fetchPilotProducts(api);
  const s = auditFarmaboxProducts(products);
  assert.equal(s.total, 3);
  assert.equal(s.stockPositive, 2);
  assert.equal(s.invalidPrice, 1);
  assert.equal(s.missingUnit, 1);
  assert.equal(s.expired, 1);
  assert.equal(s.missingExpiry, 1);
  assert.equal(s.duplicateCodes, 1);
  assert.equal(s.otcCategoryWithAntibioticType, 1);
  assert.equal(s.eligibleForOnlineSale, 0);
  assert.equal(s.pendingLegalReview, 3);
});

test("invalid branch and mismatched pagination fail closed", async () => {
  await assert.rejects(fetchPilotProducts(mockClient({ branch: 3 }).api), /PILOT_BRANCH_NOT_FOUND/);
  await assert.rejects(fetchPilotProducts(mockClient({ mismatch: true }).api), /SOURCE_PAGINATION_INVALID/);
});

test("bad API key never appears in thrown error", async () => {
  const { api } = mockClient({ authorized: false });
  await assert.rejects(fetchPilotProducts(api), err => {
    assert.equal(err.code, "SOURCE_AUTH_FAILED");
    assert(!String(err).includes("test-only-api-key"));
    return true;
  });
});

test("missing credentials fail before any request", () => {
  assert.throws(() => createFarmaboxApi({ apiKey: "" }), /API_KEY_NOT_CONFIGURED/);
});