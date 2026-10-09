-- KlikObat S1: additive schema, safe defaults. Apply only to a verified database.
-- NO outlet accepts orders and NO SKU is public without explicit activation/approval.
BEGIN;

CREATE TABLE IF NOT EXISTS outlets (
  id VARCHAR(64) PRIMARY KEY CHECK (id ~ '^[a-zA-Z0-9_-]+$'),
  name VARCHAR(160) NOT NULL,
  city VARCHAR(100),
  address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  license_verified BOOLEAN NOT NULL DEFAULT FALSE,
  accepting_orders BOOLEAN NOT NULL DEFAULT FALSE,
  pickup_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(250) NOT NULL,
  brand VARCHAR(120),
  category VARCHAR(64) NOT NULL,
  unit VARCHAR(80) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  approval_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED')),
  sale_eligibility VARCHAR(30) NOT NULL DEFAULT 'BLOCKED'
    CHECK (sale_eligibility IN ('BLOCKED', 'ONLINE_ALLOWED')),
  requires_prescription BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outlet_products (
  outlet_id VARCHAR(64) NOT NULL REFERENCES outlets(id),
  product_id VARCHAR(64) NOT NULL REFERENCES products(id),
  price_idr INTEGER CHECK (price_idr IS NULL OR price_idr > 0),
  stock_quantity INTEGER CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
  stock_verified BOOLEAN NOT NULL DEFAULT FALSE,
  stock_updated_at TIMESTAMPTZ,
  is_listed BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (outlet_id, product_id)
);

CREATE INDEX IF NOT EXISTS products_category_active_idx ON products(category, name) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS outlet_products_product_idx ON outlet_products(product_id);
COMMIT;
