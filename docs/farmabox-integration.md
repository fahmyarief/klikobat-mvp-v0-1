# FarmaBox API → KlikObat: first read-only pilot

Scope: Farmabox 01 Taman Dhika only (source cabang_id=1).
Source: `https://apotekfarmabox.com/api/klikobat/v1` (GET-only).
The actual source API specification is supplied privately by FarmaBox; do not commit API keys or source inventory to GitHub.

## Current stage

- `/api/integrations/farmabox/status`: **Preview only**. Reads `/ping`, `/cabang`, and paginated `/produk` to return aggregate data-quality findings. Protected Vercel Preview only; always returns 404 in Production.
- `FARMABOX_API_KEY`: Vercel Preview **sensitive** variable, server-only. Do not use a `NEXT_PUBLIC_` prefix or place it in a client component.
- Does **not** write to Neon or FarmaBox and does **not** alter the public catalogue or checkout.
- 401/403, 429, malformed pagination, unexpected branch IDs, and incomplete product sets fail closed.
- The client is fixed to FarmaBox cabang_id 1 and per_page 500, maximum 20 pages.

## Important business rules

- `kategori=OTC` from FarmaBox is **not** authorization to sell online; the source classification can be inaccurate. APJ/legal review remains mandatory.
- Reject expired, unknown-expiry, inactive, invalid-price, and otherwise ineligible products from future public listings. No new products are published by this phase.
- A single barcode can point to multiple FarmaBox master rows; preserve source `id` plus `cabang_id` as the product identity for any later importer.
- `harga_normal`, `harga_display`, and promo discounts are different. FarmaBox's cashier rounds line subtotals using ceil-to-Rp500 after quantity and item discounts; do not advertise a quantity-independent checkout price based solely on `harga_display`.
- `updated_since` is documented for future incremental sync, but stock is live per request. Never treat incremental product updates as complete inventory snapshots without explicit guarantees from Mas Anam.
- Existing KlikObat product, outlet-approval, listing and order flags remain disabled.

## Next gated phase

Design a staging-only importer into Neon that persists source IDs, unit, category, expiry, price, stock and source-update times. Validate product counts and the APJ decision workflow before scheduling automatic refresh or shipping catalogue visibility. Rotate the chat-shared API key after a replacement has been securely configured. Ensure Preview and Production remain isolated.