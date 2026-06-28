# Settleora Codex Report - User Web Settlements Readout Runtime Slice

- Status: `READY_FOR_REVIEW`
- Start timestamp: `2026-06-28 22:45:00 HKT`
- End timestamp: `2026-06-28 22:54:12 HKT`
- Elapsed time: about 9 minutes
- Branch name: `feature/user-web-settlements-readout-460`
- Base/main SHA: `a4bbcd4f07fcadbb8b7b834c4680af3c41977cfa`
- Integration SHA: `d3f458b146bc5c5621478aceba8d26f69b5d434a`
- Implementation commit SHA: `07134ca5d1ffa008e08f5a52f653e95a03f24e77`
- Report/evidence commit SHA: created after this report is committed
- Branch pushed: no at report write time; yes after final push
- PR URL: `not created`

## Files Changed

- `.codex/reports/web-user-settlements-readout-settlements-20260628-2245-hkt.png`
- `.codex/reports/web-user-settlements-readout-settlements-mobile-20260628-2245-hkt.png`
- `apps/web-user/src/App.tsx`
- `apps/web-user/src/settlementsReadout.test.ts`
- `apps/web-user/src/settlementsReadout.ts`
- `apps/web-user/src/shellModel.test.ts`
- `apps/web-user/src/shellModel.ts`

## Generated-Client Settlement Methods Found/Used

Used read methods:

- `listSettlementBalanceProjections(options)` -> `GET /api/v1/settlement-balances`
- `listSettlementRequests(options)` -> `GET /api/v1/settlements`
- `getSettlementRequest(settlementId, options)` -> `GET /api/v1/settlements/{settlementId}`
- `listSettlementPayments(settlementId, options)` -> `GET /api/v1/settlements/{settlementId}/payments`

Found but not used because this slice is read-only/display-only or out of scope:

- settlement request/payment write lifecycle methods
- settlement payment proof attach/list/content/remove methods
- counterparty payment-details and QR content methods
- settlement basket preview/create methods

Missing method categories for this slice: none for the implemented read-only request/balance/payment readout.

## Implementation Summary

- Added canonical `#/settlements` route/navigation while keeping the compact mobile label `Settle` and accepting old `#/settle` hashes as an alias.
- Added a read-only settlements adapter that auth-gates before generated-client calls and loads server-returned settlement balance projections, settlement requests, selected request detail, and payment rows.
- Added a rounded fintech split-pane settlements screen with summary metrics, local presentation-only request filters, balance projection rows, settlement request selection, request-line detail, and payment/allocation/residual count readouts.
- Added focused Vitest coverage for auth gating, generated-client read calls, detail loading, presentation filtering, summaries, unavailable states, and error states.
- Captured desktop and mobile screenshots for `#/settlements`.

## Unsupported / Follow-Up Coverage

- No settlement mutations: no request/create, mark paid, confirm, dispute, cancel, reopen, partial payment mutation, residual confirmation, basket create, proof upload, proof content, payment detail visibility changes, notification runtime, or fake runtime data.
- Counterparty payment details and QR metadata/content remain out of this slice even though generated methods exist.
- Signed-in visual state was not captured because current user-web auth wiring still has no real web credential source in this slice; screenshots show the auth-required route state with no mock session.

## Screenshot Evidence

- Desktop: `.codex/reports/web-user-settlements-readout-settlements-20260628-2245-hkt.png`
- Mobile: `.codex/reports/web-user-settlements-readout-settlements-mobile-20260628-2245-hkt.png`

Screenshot commands:

- `npm --prefix apps/web-user run dev -- --host 127.0.0.1`
- `npm exec --yes playwright@latest -- screenshot --viewport-size=1440,1000 http://127.0.0.1:5174/#/settlements .codex/reports/web-user-settlements-readout-settlements-20260628-2245-hkt.png`
- `npm exec --yes playwright@latest -- screenshot --viewport-size=390,900 http://127.0.0.1:5174/#/settlements .codex/reports/web-user-settlements-readout-settlements-mobile-20260628-2245-hkt.png`

## Validation Results

- `npm ci` - passed. Output included `added 2 packages`, `found 0 vulnerabilities`.
- `npm run validate:scaffold` - passed. Output: `Scaffold validation passed (19 paths).`
- `npm run validate:openapi` - initial run failed because local Redocly install was missing `node_modules/@redocly/cli/lib/chunks/VXIQEZPR.js`.
- `npm ci --no-audit --prefer-offline` - passed as the single recovery install.
- `npm run validate:openapi` - passed after recovery. Output: `packages/contracts/openapi/settleora.v1.yaml: validated in 609ms` and `Your API description is valid.`
- `npm run validate:clients` - passed. Output included `Generated client validation passed.`
- `npm --prefix apps/web-user run lint` - passed.
- `npm --prefix apps/web-user run test` - passed. Output: `Test Files 5 passed (5)`, `Tests 22 passed (22)`.
- `npm --prefix apps/web-user run build` - passed. Output included `24 modules transformed` and `built in 98ms`.
- `git diff --check` - passed with no output.
- `git status --short` - clean immediately after implementation commit; report file pending until report commit.

## Scope Guard Confirmation

- No backend/API runtime behavior changed.
- No OpenAPI contract changed.
- No generated-client output changed.
- No database schema/migrations changed.
- No auth/session implementation changed.
- No storage/file-byte behavior changed.
- No Docker/deployment/CI/environment/secrets changed.
- No mobile app or admin web changed.
- No settlement/payment/bill calculation authority moved to the client.
- Currency remains attached to displayed settlement money values.
- Client filtering is presentation-only over returned settlement request statuses.

## Dirty / Untracked Files Left Untouched

- None known at report write time, except this report before it is committed and exported.

## Next Recommended Action

Review branch `feature/user-web-settlements-readout-460`; do not create a PR from this task. Future #460 slices can add profile/payment details, notifications, and proof/payment-detail handoffs only through their own scoped tasks and gates.
