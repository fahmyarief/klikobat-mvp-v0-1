# KlikObat S1 Database

Schema: `001_catalog.sql`. Database: PostgreSQL 14+ (proposal; provider not provisioned).
Do not run this against Farmabox POS databases. It defines an independent KlikObat catalogue.

## Safe defaults
- Outlets are inactive, not license-verified, and not accepting orders.
- Products are inactive, pending approval, BLOCKED, and prescription-requiring by default.
- Outlet-product entries are unlisted; inventory is unverified until staff approves its source.
- No sample prices/SKU/outlet approvals are inferred from the public demo.

## Initialization (authorized target only)
1. Provision/connect a database after appropriate cost and target approval.
2. Verify database identity and backup/recovery capability.
3. Execute `db/001_catalog.sql` once against the verified target, with a deploy-safe migration procedure.
4. Enter actual outlet and SKU data using an approved import/admin process.
5. Review outlet licenses with the APJ/legal responsible person.
6. Explicitly approve eligible online products before setting product and outlet visibility flags.
7. Set `DATABASE_URL` through the Vercel encrypted environment settings; never commit its value.
8. Optional `STOCK_MAX_AGE_MINUTES` defaults to 60; operational freshness window must be approved.

## Routes
- `GET /api/outlets`: lists only active, verified, order-accepting outlets.
- `GET /api/catalog?outletId=...&q=...&category=...`: lists only eligible approved products and each outlet's price and stock status.

Without `DATABASE_URL` these APIs return HTTP 503, and the existing frontend remains in clearly labeled DEMO mode. S1 code alone does not activate live ordering.
