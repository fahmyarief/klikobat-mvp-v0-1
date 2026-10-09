# Farmabox import: first staged snapshot

Scope: **Neon s1-preview only**, branch `br-small-boat-b335j2hx`, project `late-union-10460085`.
Do not migrate or import to production. No public listing or ordering activation.

## Migration

Only run `db/002_farmabox_preview.sql` in the exact verified Neon Preview branch.
It adds nullable source identifiers, barcode, expiry/source timestamps, and promotional price metadata.

## Import

The Preview-only `POST /api/integrations/farmabox/import-preview` requires
`Authorization: Bearer <FARMABOX_IMPORT_TOKEN>` (a separate Vercel Preview sensitive secret).
Body `{"mode":"dry-run"}` checks API completeness, data normalization, target branch,
outlet safety flags, schema, and that the current catalogue is empty. It writes nothing.
Body `{"mode":"commit"}` inserts the same data transactionally into Preview.

Source: FarmaBox `GET /cabang`, `GET /produk?cabang_id=1&page=N&per_page=500`.
The importer validates source page totals, master product IDs, and the exact Neon project/branch
inside the database transaction before a write. Full inserts either commit or roll back.
The import refuses to run again once any products or outlet_products exist.

### Safety defaults

- Product IDs: `fbx-c1-<source id>`, with the raw source ID stored separately.
- Never use barcode as a unique identity; source may assign same barcode to multiple products.
- Every product: inactive, approval PENDING, online eligibility BLOCKED,
  requires_prescription TRUE.
- Every outlet item: unlisted and stock_verified FALSE. Outlet itself stays inactive,
  license unverified, and not accepting orders.
- Master price `harga_normal` saved as `price_idr`; promo display & discount stored separately.
  Pricing at checkout must recompute FarmaBox per-item/per-quantity rounding;
  this importer does not implement checkout.
- Source expiry and timestamps are stored as metadata only; online approval needs APJ review.
- This is a one-time snapshot, **not yet scheduled auto-sync**.
- The API key must be rotated by Mas Anam; never place either secret in GitHub.

## Acceptance

Verify API sourceCount equals Neon rows, source branch and project identity,
zero approved/listed/available-for-sale products, price and stock consistency on samples,
repeat commit rejects with 409, public `/api/catalog` stays empty, and Production schema/data unchanged.
