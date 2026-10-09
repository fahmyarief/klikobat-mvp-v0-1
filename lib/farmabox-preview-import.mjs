import { auditFarmaboxProducts } from "./farmabox-audit.mjs";
import { FARMABOX_PILOT_BRANCH_ID } from "./farmabox-api.mjs";

export const PREVIEW_PROJECT = "late-union-10460085";
export const PREVIEW_BRANCH = "br-small-boat-b335j2hx";
export const PILOT_OUTLET = "farmabox-taman-dhika";
const LIMIT = 250;

function text(value, max) {
  if (value == null) return "";
  return String(value).trim().slice(0, max);
}

function money(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isSafeInteger(num) && num > 0 ? num : null;
}

function nonnegative(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isSafeInteger(num) && num >= 0 ? num : null;
}

function dateOnly(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) &&
    Number.isFinite(Date.parse(value + "T00:00:00Z")) ? value : null;
}

function wibTimestamp(value) {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(value || ""))) return null;
  const date = new Date(value.replace(" ", "T") + "+07:00");
  return Number.isFinite(date.getTime()) ? date : null;
}

export function prepareFarmaboxPreview(products) {
  if (!Array.isArray(products) || products.length < 1 || products.length > 10000) {
    throw new Error("SOURCE_EMPTY_OR_TOO_LARGE");
  }
  const ids = new Set();
  const prepared = products.map(p => {
    if (!p || !Number.isSafeInteger(Number(p.id)) || Number(p.id) < 1 ||
        Number(p.id) > Number.MAX_SAFE_INTEGER ||
        !text(p.nama, 251) || text(p.nama, 251).length > 250) throw new Error("INVALID_SOURCE_PRODUCT");
    const id = Number(p.id);
    if (ids.has(id)) throw new Error("DUPLICATE_SOURCE_ID");
    ids.add(id);
    return {
      id: `fbx-c1-${id}`,
      name: text(p.nama, 250),
      category: text(p.kategori, 64) || "UNCLASSIFIED",
      unit: text(p.satuan, 80) || "UNKNOWN",
      sourceBranchId: FARMABOX_PILOT_BRANCH_ID,
      sourceId: id,
      barcode: text(p.barcode || p.kode, 128) || null,
      expiryDate: dateOnly(p.tanggal_kadaluarsa),
      expiryStatus: text(p.expiry_status, 20) || "no_date",
      sourceUpdatedAt: wibTimestamp(p.updated_at),
      normalPrice: money(p.harga_normal),
      displayPrice: money(p.harga_display),
      discountPerItem: nonnegative(p.diskon_per_item),
      promoType: text(p.promo?.jenis, 32) || null,
      stock: nonnegative(p.stok),
    };
  });
  return { rows: prepared, audit: auditFarmaboxProducts(products) };
}

export function assertPreviewIdentity(record) {
  if (record?.project !== PREVIEW_PROJECT || record?.branch !== PREVIEW_BRANCH ||
      record?.db !== "neondb") throw new Error("WRONG_DATABASE_BRANCH");
}

export async function performPreviewImport(sql, prepared, { commit = false } = {}) {
  if (!prepared || !Array.isArray(prepared.rows) || !prepared.rows.length) throw new Error("INVALID_IMPORT");
  const result = await sql.begin(async tx => {
    const [identity] = await tx`SELECT current_database() AS db,
      current_setting('neon.project_id', true) AS project,
      current_setting('neon.branch_id', true) AS branch`;
    assertPreviewIdentity(identity);

    const [outlet] = await tx`SELECT id, is_active, license_verified, accepting_orders
      FROM public.outlets WHERE id = ${PILOT_OUTLET} FOR UPDATE`;
    if (!outlet || outlet.is_active || outlet.license_verified || outlet.accepting_orders) {
      throw new Error("PILOT_OUTLET_NOT_LOCKED");
    }

    // At most one first import: never silently replace a reviewed catalogue.
    const [count] = await tx`SELECT
      (SELECT COUNT(*)::int FROM public.products) AS products,
      (SELECT COUNT(*)::int FROM public.outlet_products) AS inventory`;
    if (count.products !== 0 || count.inventory !== 0) throw new Error("CATALOG_ALREADY_POPULATED");

    const requiredProducts = ["source_system", "source_branch_id", "source_product_id",
      "source_barcode", "source_expiry_date", "source_expiry_status", "source_updated_at"];
    const requiredInventory = ["source_display_price_idr", "source_discount_per_item", "source_promo_type"];
    const columns = await tx`SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name IN ('products', 'outlet_products')`;
    const present = new Set(columns.map(x => x.table_name + "." + x.column_name));
    for (const col of requiredProducts) if (!present.has("products." + col)) throw new Error("MIGRATION_REQUIRED");
    for (const col of requiredInventory) if (!present.has("outlet_products." + col)) throw new Error("MIGRATION_REQUIRED");

    if (!commit) return { dryRun: true, planned: prepared.rows.length, branch: identity.branch };
    const takenAt = new Date();

    for (let i = 0; i < prepared.rows.length; i += LIMIT) {
      const batch = prepared.rows.slice(i, i + LIMIT);
      const products = batch.map(x => ({
        id: x.id, name: x.name, brand: null, category: x.category, unit: x.unit,
        is_active: false, approval_status: "PENDING", sale_eligibility: "BLOCKED",
        requires_prescription: true,
        source_system: "farmabox", source_branch_id: x.sourceBranchId,
        source_product_id: x.sourceId, source_barcode: x.barcode,
        source_expiry_date: x.expiryDate, source_expiry_status: x.expiryStatus,
        source_updated_at: x.sourceUpdatedAt,
      }));
      await tx`INSERT INTO public.products ${tx(products,
        "id", "name", "brand", "category", "unit", "is_active", "approval_status",
        "sale_eligibility", "requires_prescription", "source_system", "source_branch_id",
        "source_product_id", "source_barcode", "source_expiry_date", "source_expiry_status",
        "source_updated_at")}`;

      const inventory = batch.map(x => ({
        outlet_id: PILOT_OUTLET, product_id: x.id,
        price_idr: x.normalPrice,
        stock_quantity: x.stock,
        stock_verified: false, stock_updated_at: takenAt,
        is_listed: false,
        source_display_price_idr: x.displayPrice,
        source_discount_per_item: x.discountPerItem,
        source_promo_type: x.promoType,
      }));
      await tx`INSERT INTO public.outlet_products ${tx(inventory,
        "outlet_id", "product_id", "price_idr", "stock_quantity", "stock_verified",
        "stock_updated_at", "is_listed", "source_display_price_idr",
        "source_discount_per_item", "source_promo_type")}`;
    }
    const [proof] = await tx`SELECT
      (SELECT COUNT(*)::int FROM public.products WHERE approval_status = 'PENDING'
        AND sale_eligibility = 'BLOCKED' AND is_active = false
        AND requires_prescription = true) AS safely_blocked,
      (SELECT COUNT(*)::int FROM public.outlet_products WHERE
        is_listed = false AND stock_verified = false
        AND outlet_id = ${PILOT_OUTLET}) AS safely_hidden`;
    if (proof.safely_blocked !== prepared.rows.length ||
        proof.safely_hidden !== prepared.rows.length) throw new Error("POST_IMPORT_GUARD_FAILED");
    return { dryRun: false, inserted: prepared.rows.length, branch: identity.branch };
  });
  return result;
}
