export function normalizeCatalogFilters(raw = {}) {
  const outletId = typeof raw.outletId === "string" ? raw.outletId.trim() : "";
  const q = typeof raw.q === "string" ? raw.q.trim() : "";
  const category = typeof raw.category === "string" ? raw.category.trim() : "";
  if (!/^[a-z0-9_-]{1,64}$/i.test(outletId)) {
    throw new RangeError("OUTLET_ID_INVALID");
  }
  if (q.length > 100 || category.length > 64) {
    throw new RangeError("FILTER_INVALID");
  }
  return { outletId, q, category };
}

export function resolveStockStatus(row, now = Date.now(), maxAgeMinutes = 60) {
  const updated = row.stock_updated_at ? new Date(row.stock_updated_at).getTime() : NaN;
  const isRecent = Number.isFinite(updated) &&
    updated <= now && (now - updated) <= maxAgeMinutes * 60_000;
  if (!row.stock_verified || !isRecent || row.stock_quantity == null) {
    return "NEEDS_CONFIRMATION";
  }
  return Number(row.stock_quantity) > 0 ? "AVAILABLE" : "OUT_OF_STOCK";
}

export function toCatalogProduct(row, options = {}) {
  const stockStatus = resolveStockStatus(row, options.now, options.maxAgeMinutes);
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    category: row.category,
    unit: row.unit,
    priceIdr: Number(row.price_idr),
    outletId: row.outlet_id,
    stockStatus,
    stockUpdatedAt: row.stock_updated_at ? new Date(row.stock_updated_at).toISOString() : null,
  };
}

export function stockFreshnessMinutes() {
  const value = Number(process.env.STOCK_MAX_AGE_MINUTES ?? 60);
  return Number.isSafeInteger(value) && value > 0 && value <= 1440 ? value : 60;
}
