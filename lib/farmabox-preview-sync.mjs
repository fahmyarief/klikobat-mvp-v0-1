import { PILOT_OUTLET, assertPreviewIdentity, prepareFarmaboxPreview } from "./farmabox-preview-import.mjs";

// Single-branch staged-sync: never toggles approval, visibility, prescriptions, or outlet licensing.
export function preparePreviewSync(products) {
  return prepareFarmaboxPreview(products);
}

export function normalizeSchedule(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value !== "string" || value.length > 40) throw new Error("SCHEDULE_INVALID");
  const d = new Date(value);
  if (!Number.isFinite(d.getTime()) || !value.includes("T")) throw new Error("SCHEDULE_INVALID");
  return d;
}

export async function syncPreviewSnapshot(sql, prepared, { scheduledAt = new Date(), dryRun = true } = {}) {
  if (!prepared || !Array.isArray(prepared.rows) || prepared.rows.length < 1) throw new Error("SYNC_INPUT_INVALID");
  const scheduled = normalizeSchedule(scheduledAt);

  return sql.begin(async tx => {
    const [identity] = await tx`SELECT current_database() AS db,
      current_setting('neon.project_id', true) AS project,
      current_setting('neon.branch_id', true) AS branch`;
    assertPreviewIdentity(identity);

    const [lock] = await tx`SELECT pg_try_advisory_xact_lock(762182, 1) AS obtained`;
    if (!lock?.obtained) throw new Error("SYNC_ALREADY_RUNNING");

    const [outlet] = await tx`SELECT id, is_active, license_verified, accepting_orders
      FROM public.outlets WHERE id = ${PILOT_OUTLET} FOR UPDATE`;
    if (!outlet || outlet.is_active || outlet.license_verified || outlet.accepting_orders) {
      throw new Error("PILOT_OUTLET_NOT_LOCKED");
    }
    const [counts] = await tx`SELECT
      (SELECT COUNT(*)::int FROM public.products) AS products,
      (SELECT COUNT(*)::int FROM public.outlet_products WHERE outlet_id = ${PILOT_OUTLET}) AS inventory,
      (SELECT COUNT(*)::int FROM public.products
       WHERE is_active OR approval_status <> 'PENDING' OR sale_eligibility <> 'BLOCKED'
          OR NOT requires_prescription) AS unsafe_products,
      (SELECT COUNT(*)::int FROM public.outlet_products
       WHERE is_listed OR stock_verified) AS unsafe_inventory`;
    if (counts.unsafe_products !== 0 || counts.unsafe_inventory !== 0) {
      throw new Error("REVIEW_FLAGS_CHANGED");
    }
    if (counts.products !== prepared.rows.length || counts.inventory !== prepared.rows.length) {
      throw new Error("SOURCE_COUNT_DRIFT");
    }
    const current = await tx`SELECT id, source_branch_id, source_product_id
      FROM public.products WHERE source_system = 'farmabox'`;
    if (current.length !== prepared.rows.length) throw new Error("SOURCE_ID_DRIFT");
    const keys = new Set(prepared.rows.map(row => row.id));
    for (const row of current) {
      if (row.source_branch_id !== 1 || !keys.has(row.id) ||
        row.id !== `fbx-c1-${row.source_product_id}`) throw new Error("SOURCE_ID_DRIFT");
    }
    const [old] = await tx`SELECT last_scheduled_at FROM public.farmabox_preview_sync_state
      WHERE outlet_id = ${PILOT_OUTLET} FOR UPDATE`;
    if (old?.last_scheduled_at && new Date(old.last_scheduled_at).getTime() >= scheduled.getTime()) {
      return { status: "already_processed", updated: 0, dryRun, branch: identity.branch };
    }
    if (dryRun) return { status: "ready", updated: prepared.rows.length, dryRun: true, branch: identity.branch };

    // Stable source ID is the sole matching key. Barcode duplicates remain distinct.
    const updatedAt = new Date();
    let updated = 0;
    for (let i = 0; i < prepared.rows.length; i += 250) {
      const chunk = prepared.rows.slice(i, i + 250);
      const values = JSON.stringify(chunk.map(x => ({
        id: x.id, name: x.name, category: x.category, unit: x.unit,
        barcode: x.barcode, expiry_date: x.expiryDate,
        expiry_status: x.expiryStatus, source_updated_at: x.sourceUpdatedAt,
        price: x.normalPrice, display_price: x.displayPrice,
        discount: x.discountPerItem, promo_type: x.promoType, stock: x.stock,
      })));
      const data = await tx`
        WITH incoming AS (
          SELECT * FROM jsonb_to_recordset(${values}::jsonb)
          AS x(id TEXT, name TEXT, category TEXT, unit TEXT, barcode TEXT,
               expiry_date DATE, expiry_status TEXT, source_updated_at TIMESTAMPTZ,
               price INTEGER, display_price INTEGER, discount INTEGER, promo_type TEXT,
               stock INTEGER)
        ), products_updated AS (
          UPDATE public.products p
          SET name = v.name, category = v.category, unit = v.unit,
              source_barcode = v.barcode, source_expiry_date = v.expiry_date,
              source_expiry_status = v.expiry_status,
              source_updated_at = v.source_updated_at, updated_at = ${updatedAt}
          FROM incoming v WHERE p.id = v.id AND p.source_system = 'farmabox'
            AND p.source_branch_id = 1
            AND (p.name, p.category, p.unit, p.source_barcode, p.source_expiry_date,
                 p.source_expiry_status, p.source_updated_at)
                IS DISTINCT FROM
                (v.name, v.category, v.unit, v.barcode, v.expiry_date,
                 v.expiry_status, v.source_updated_at)
          RETURNING p.id
        ), inventory_updated AS (
          UPDATE public.outlet_products op
          SET price_idr = v.price, stock_quantity = v.stock,
              source_display_price_idr = v.display_price,
              source_discount_per_item = v.discount,
              source_promo_type = v.promo_type,
              stock_updated_at = CASE WHEN op.stock_quantity IS DISTINCT FROM v.stock
                                      THEN ${updatedAt} ELSE op.stock_updated_at END,
              updated_at = ${updatedAt}
          FROM incoming v WHERE op.product_id = v.id
            AND op.outlet_id = ${PILOT_OUTLET}
            AND op.is_listed = false AND op.stock_verified = false
            AND (op.price_idr, op.stock_quantity, op.source_display_price_idr,
                 op.source_discount_per_item, op.source_promo_type)
                IS DISTINCT FROM
                (v.price, v.stock, v.display_price, v.discount, v.promo_type)
          RETURNING op.product_id
        )
        SELECT
          (SELECT COUNT(*)::int FROM public.products p JOIN incoming v ON p.id=v.id
           WHERE p.source_system='farmabox' AND p.source_branch_id=1) AS matched_products,
          (SELECT COUNT(*)::int FROM public.outlet_products op JOIN incoming v ON op.product_id=v.id
           WHERE op.outlet_id=${PILOT_OUTLET} AND NOT op.is_listed AND NOT op.stock_verified) AS matched_inventory,
          (SELECT COUNT(*)::int FROM products_updated) AS changed_products,
          (SELECT COUNT(*)::int FROM inventory_updated) AS changed_inventory`;
      if (data[0]?.matched_products !== chunk.length ||
          data[0]?.matched_inventory !== chunk.length) {
        throw new Error("SYNC_INCOMPLETE");
      }
      updated += data[0].changed_inventory;
    }
    await tx`INSERT INTO public.farmabox_preview_sync_state
      (outlet_id, source_branch_id, last_scheduled_at, last_completed_at, source_count, updated_count)
      VALUES (${PILOT_OUTLET}, 1, ${scheduled}, ${updatedAt}, ${prepared.rows.length}, ${updated})
      ON CONFLICT (outlet_id) DO UPDATE SET
        last_scheduled_at = EXCLUDED.last_scheduled_at,
        last_completed_at = EXCLUDED.last_completed_at,
        source_count = EXCLUDED.source_count,
        updated_count = EXCLUDED.updated_count`;
    const [proof] = await tx`SELECT
      (SELECT COUNT(*)::int FROM public.products WHERE
        is_active OR approval_status <> 'PENDING' OR sale_eligibility <> 'BLOCKED'
          OR NOT requires_prescription) AS unsafe_products,
      (SELECT COUNT(*)::int FROM public.outlet_products WHERE
        stock_verified OR is_listed) AS unsafe_inventory`;
    if (proof.unsafe_products || proof.unsafe_inventory) throw new Error("POST_SYNC_GUARD_FAILED");
    return { status: "updated", updated, branch: identity.branch, dryRun: false };
  });
}