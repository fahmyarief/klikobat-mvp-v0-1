import { stockFreshnessMinutes, toCatalogProduct } from "./catalog.mjs";

export async function listActiveOutlets(sql) {
  const rows = await sql`
    SELECT id, name, city, address, pickup_enabled, updated_at
    FROM outlets
    WHERE is_active = TRUE
      AND license_verified = TRUE
      AND accepting_orders = TRUE
    ORDER BY name ASC
  `;
  return rows.map(({ id, name, city, address, pickup_enabled, updated_at }) => ({
    id, name, city, address,
    pickupEnabled: pickup_enabled,
    updatedAt: updated_at ? new Date(updated_at).toISOString() : null,
  }));
}

export async function listCatalog(sql, { outletId, q, category }) {
  const rows = await sql`
    SELECT p.id, p.name, p.brand, p.category, p.unit,
           op.price_idr, op.stock_quantity, op.stock_verified,
           op.stock_updated_at, op.outlet_id
    FROM products p
    JOIN outlet_products op ON op.product_id = p.id
    JOIN outlets o ON o.id = op.outlet_id
    WHERE o.id = ${outletId}
      AND o.is_active = TRUE
      AND o.license_verified = TRUE
      AND o.accepting_orders = TRUE
      AND p.is_active = TRUE
      AND p.approval_status = 'APPROVED'
      AND p.sale_eligibility = 'ONLINE_ALLOWED'
      AND p.requires_prescription = FALSE
      AND op.is_listed = TRUE
      AND op.price_idr > 0
      AND (${category} = '' OR p.category = ${category})
      AND (${q} = '' OR position(lower(${q}) in lower(p.name)) > 0
        OR position(lower(${q}) in lower(coalesce(p.brand, ''))) > 0)
    ORDER BY p.name ASC, p.id ASC
    LIMIT 100
  `;
  const maxAgeMinutes = stockFreshnessMinutes();
  return rows.map(row => toCatalogProduct(row, { maxAgeMinutes }));
}
