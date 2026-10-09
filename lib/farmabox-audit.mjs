// This audit is NOT a permit to list or sell products online.
export function auditFarmaboxProducts(products) {
  if (!Array.isArray(products)) throw new TypeError("products must be an array");
  const seenIds = new Set();
  const seenCodes = new Map();
  const summary = {
    total: products.length,
    active: 0,
    stockPositive: 0,
    zeroOrNegativeStock: 0,
    missingUnit: 0,
    invalidPrice: 0,
    expired: 0,
    nearExpiry: 0,
    missingExpiry: 0,
    duplicateIds: 0,
    duplicateCodes: 0,
    otcCategoryWithAntibioticType: 0,
    categories: {},
    pendingLegalReview: products.length,
    eligibleForOnlineSale: 0,
  };

  for (const p of products) {
    if (!p || typeof p !== "object" || !Number.isSafeInteger(Number(p.id)) || Number(p.id) <= 0) {
      throw new TypeError("source product is missing a valid numeric id");
    }
    const id = Number(p.id);
    if (seenIds.has(id)) summary.duplicateIds++;
    seenIds.add(id);

    const code = String(p.kode || p.barcode || "").trim();
    if (code) {
      if (seenCodes.has(code) && seenCodes.get(code) !== id) summary.duplicateCodes++;
      seenCodes.set(code, id);
    }
    if (p.is_active === true || p.is_active === 1) summary.active++;
    if (Number.isFinite(Number(p.stok)) && Number(p.stok) > 0) summary.stockPositive++;
    else summary.zeroOrNegativeStock++;

    if (!String(p.satuan || "").trim()) summary.missingUnit++;
    if (!Number.isFinite(Number(p.harga_normal)) || Number(p.harga_normal) <= 0) summary.invalidPrice++;
    if (p.expiry_status === "expired") summary.expired++;
    if (p.expiry_status === "near_expiry") summary.nearExpiry++;
    if (p.expiry_status === "no_date" || !p.expiry_status) summary.missingExpiry++;

    const category = String(p.kategori || "UNCLASSIFIED").trim().slice(0, 64);
    summary.categories[category] = (summary.categories[category] || 0) + 1;
    if (category.toLowerCase() === "otc" &&
        /antibiotik|antibiotic/i.test(String(p.jenis || ""))) {
      summary.otcCategoryWithAntibioticType++;
    }
  }
  return summary;
}