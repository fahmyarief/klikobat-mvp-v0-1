# FarmaBox Taman Dhika — Preview stock & price sync

Target: Neon project `late-union-10460085`, branch `br-small-boat-b335j2hx` (`s1-preview`).
Source: the API provided by Mas Anam. **No production mutations**.

## Preconditions
- API key must be rotated before enabling a new recurring scheduler. Do not paste new secrets into chats or GitHub.
- Preview must have an initial imported snapshot (1,742 at the time of first import).
- Apply `db/003_farmabox_preview_sync.sql` only against the exact Neon Preview branch.
- `FARMABOX_API_KEY` stays only in runtime secret settings.
- If source set grows/shrinks, pause sync and reconcile new/removed source IDs manually.
- Source master `kategori=OTC` never implies approval to sell online.

## Periodic job behavior
- Fetch `GET /cabang` and complete paginated `GET /produk` for source branch 1.
- Validate exact source ID set, Neon target identity, and outlet safety flags.
- Update only source metadata: product display fields, expiry, normal/display prices, discount and stock.
- Never change outlet active/licensing, product approval, prescription or online eligibility,
  `stock_verified` or `is_listed`.
- Transactional batches of 250, advisory lock, monotonic scheduled timestamp,
  100% updated-row count checks, audit row `farmabox_preview_sync_state`.
- On source size/ID drift, fail closed; retry after operator reconciliation.
- On duplicate scheduled invocation, report `already_processed` without a write.
- All products remain blocked. Stock quantity is for staging only; do not use for checkout.

## Scheduling
Neon Function Triggers are branch scoped. Proposed schedule: `*/15 * * * *` UTC.
Deploy function and trigger **only** to `s1-preview`, after new API key has been securely configured
and live sync tests complete. Do not use Vercel Cron to update this branch: Vercel crons
operate only on Production deployments and Hobby plan cannot run every 15 minutes.

## Rollback
Disable the Neon Function trigger first. The last imported snapshot remains as-is.
Any rollback of schema/data is a separate approved operation. No destructive rollback.

## Deployed staging resources (2026-10-09)
- Neon Function: `farmaboxsync` on branch `br-small-boat-b335j2hx` only.
- Trigger: `trigger-d7f55be3-903c-44e0-a779-0f1851e11d6f`, `*/15 * * * *`, currently **disabled**.
- Migration 003 applied to Neon Preview only. Initial snapshot remains 1,742 products.
- Function deployment contains **no FarmaBox API key**. Cron will not run until a securely rotated key is configured in the Neon Function's runtime environment and the trigger is deliberately enabled.
- Source code is in `neon/farmaboxsync/index.mjs`. Deployment package needs `index.mjs`, the four `lib/farmabox*.mjs` files and the `postgres` package. Rebase the entrypoint import paths from `../../lib/` to `./lib/` in the bundled ZIP.
- The function's HTTP handler checks expected trigger ID/name/schedule and also checks the branch identity before fetching from FarmaBox. Untrusted external requests are rejected; never share the source key.
- A script or operator can test read-only source consistency via `syncPreviewSnapshot(..., {dryRun:true})` with preview DB credentials.
- On production branch, neither functions nor triggers were deployed by this task.

## Enable after key rotation
1. Have Mas Anam revoke chat-shared old source key and issue a replacement limited to GET and branch 1. Store the new key directly in Neon's **Preview Function environment**, without sending it into chat or GitHub.
2. Run a one-time authenticated dry-run and a single scheduled invocation. Compare `farmabox_preview_sync_state` with source and check public product count is zero.
3. Enable the Neon trigger. Monitor at least two successive 15-minute executions and verify no source drift, errors or promotion of blocked products.
4. If failures occur, disable trigger; leave source-of-truth FarmaBox unchanged. Do not enable production imports automatically.
