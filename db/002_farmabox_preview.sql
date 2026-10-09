-- PREVIEW ONLY: Neon s1-preview (br-small-boat-b335j2hx). DO NOT run against production.
-- Compatibility: additive nullable metadata; no table/drop/delete or approval-flag changes.
BEGIN;
DO $$
BEGIN
  IF current_setting('neon.project_id', true) IS DISTINCT FROM 'late-union-10460085'
     OR current_setting('neon.branch_id', true) IS DISTINCT FROM 'br-small-boat-b335j2hx' THEN
    RAISE EXCEPTION 'WRONG_NEON_TARGET';
  END IF;
END $$;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS source_system VARCHAR(32),
  ADD COLUMN IF NOT EXISTS source_branch_id INTEGER,
  ADD COLUMN IF NOT EXISTS source_product_id BIGINT,
  ADD COLUMN IF NOT EXISTS source_barcode VARCHAR(128),
  ADD COLUMN IF NOT EXISTS source_expiry_date DATE,
  ADD COLUMN IF NOT EXISTS source_expiry_status VARCHAR(20),
  ADD COLUMN IF NOT EXISTS source_updated_at TIMESTAMPTZ;

ALTER TABLE public.outlet_products
  ADD COLUMN IF NOT EXISTS source_display_price_idr INTEGER,
  ADD COLUMN IF NOT EXISTS source_discount_per_item INTEGER,
  ADD COLUMN IF NOT EXISTS source_promo_type VARCHAR(32);
COMMIT;
