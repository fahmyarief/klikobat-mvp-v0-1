import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCatalogFilters, resolveStockStatus, toCatalogProduct } from "../lib/catalog.mjs";
import { listActiveOutlets, listCatalog } from "../lib/catalog-repository.mjs";

test("filter rejects invalid outlet and oversized query", () => {
  assert.deepEqual(normalizeCatalogFilters({ outletId: " farmabox-a ", q: "  vit C ", category: " Vitamin " }),
    { outletId: "farmabox-a", q: "vit C", category: "Vitamin" });
  assert.throws(() => normalizeCatalogFilters({ outletId: "../etc" }), /OUTLET_ID_INVALID/);
  assert.throws(() => normalizeCatalogFilters({ outletId: "a", q: "a".repeat(101) }), /FILTER_INVALID/);
});

test("stock never reports available if unverified, missing, or stale", () => {
  const now = Date.parse("2026-10-09T08:00:00Z");
  const base = { stock_quantity: 5, stock_verified: true, stock_updated_at: "2026-10-09T07:55:00Z" };
  assert.equal(resolveStockStatus(base, now), "AVAILABLE");
  assert.equal(resolveStockStatus({ ...base, stock_quantity: 0 }, now), "OUT_OF_STOCK");
  assert.equal(resolveStockStatus({ ...base, stock_verified: false }, now), "NEEDS_CONFIRMATION");
  assert.equal(resolveStockStatus({ ...base, stock_updated_at: null }, now), "NEEDS_CONFIRMATION");
  assert.equal(resolveStockStatus({ ...base, stock_updated_at: "2026-10-08T07:00:00Z" }, now), "NEEDS_CONFIRMATION");
  assert.equal(resolveStockStatus({ ...base, stock_updated_at: "2026-10-09T10:00:00Z" }, now), "NEEDS_CONFIRMATION");
});

test("catalog maps outlet price and excludes internal stock quantity", () => {
  const row = {
    id: "demo-1", name: "Produk Uji", brand: "Demo", category: "Uji", unit: "pcs",
    outlet_id: "outlet-a", price_idr: "34500", stock_quantity: 4, stock_verified: false,
    stock_updated_at: null,
  };
  const result = toCatalogProduct(row);
  assert.equal(result.priceIdr, 34500);
  assert.equal(result.outletId, "outlet-a");
  assert.equal(result.stockStatus, "NEEDS_CONFIRMATION");
  assert.equal("stock_quantity" in result, false);
});

test("query uses parameter placeholders and eligibility/license gates", async () => {
  let text = ""; let values = [];
  const fakeSql = async (parts, ...bindings) => {
    text = parts.join("?");
    values = bindings;
    return [{
      id: "sku-a", name: "Sample", brand: null, category: "Uji", unit: "pcs",
      price_idr: 12000, stock_quantity: 4, stock_verified: false,
      stock_updated_at: null, outlet_id: "outlet-a",
    }];
  };
  const items = await listCatalog(fakeSql, { outletId: "outlet-a", q: "sample", category: "Uji" });
  assert.equal(items.length, 1);
  assert.ok(text.includes("p.sale_eligibility = 'ONLINE_ALLOWED'"));
  assert.ok(text.includes("p.approval_status = 'APPROVED'"));
  assert.ok(text.includes("p.requires_prescription = FALSE"));
  assert.ok(text.includes("o.license_verified = TRUE"));
  assert.ok(text.includes("op.is_listed = TRUE"));
  assert.equal(values[0], "outlet-a");
  assert.ok(values.includes("sample"));
  assert.ok(values.includes("Uji"));
  assert.ok(!text.includes("outlet-a"));
});

test("outlet discovery only selects licensed accepting outlets", async () => {
  let query = "";
  const fakeSql = async parts => {
    query = parts.join("");
    return [{id:"outlet-a", name:"Outlet A", city:"Test", address:null,
      pickup_enabled:true, updated_at:"2026-10-09T07:00:00Z"}];
  };
  const outlets = await listActiveOutlets(fakeSql);
  assert.equal(outlets.length, 1);
  assert.equal(outlets[0].pickupEnabled, true);
  assert.ok(query.includes("license_verified = TRUE"));
  assert.ok(query.includes("accepting_orders = TRUE"));
});
