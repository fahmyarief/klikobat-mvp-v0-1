# KlikObat MVP v0.1

KlikObat.com by FarmaBox. Existing demo homepage, now with S1 catalogue foundation.

## Local development

```bash
npm ci
npm run dev
npm test
npm run build
```

## S1: Product and Outlet

- PostgreSQL schema: [db/001_catalog.sql](db/001_catalog.sql)
- Initialization, safety gates, and environment: [db/README.md](db/README.md)
- `GET /api/outlets`: only active, license-verified outlets accepting orders
- `GET /api/catalog?outletId=...&q=...&category=...`: approved online-eligible catalogue with price and stock freshness per outlet
- The homepage switches to live outlet/product data when the database is connected and populated.
- Without `DATABASE_URL`, the existing demo remains available, visibly labeled as a simulation. No actual orders or payment are accepted.
- No real FarmaBox SKU, license status, stock, or prices have been imported or invented.

**Release boundary:** S1 installs code/schema only; provisioning a database, applying a production migration, importing official stock, activating sales, or changing klikobat.com DNS is separate and requires verified scope and authorization.

## Deployment

Vercel auto-deploys merged `main` revisions. CI runs tests, dependency audit, and build. The exact deployment revision and app health must be verified independently.
