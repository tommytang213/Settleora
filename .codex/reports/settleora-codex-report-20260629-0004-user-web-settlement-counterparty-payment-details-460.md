# Settleora Codex Report - User Web Settlement Counterparty Payment Details Readout (#460)

## Status

- Status: `READY_FOR_REVIEW`
- Start timestamp: `2026-06-29 00:04 HKT`
- End timestamp: `2026-06-29 00:09 HKT`
- Elapsed time: approximately 5 minutes
- Branch: `feature/user-web-settlement-counterparty-payment-details-readout-460`
- Base/main SHA: `41082a5fa2653922f653704743b89dc975abe665`
- Source SHA: `41082a5fa2653922f653704743b89dc975abe665`
- Integration SHA: `d3f458b146bc5c5621478aceba8d26f69b5d434a`
- Implementation commit SHA: `802da37c6a80c534dc4f81b798956f928773735a`
- Branch pushed: yes
- PR URL: not created

## Files Changed

- `apps/web-user/src/App.tsx`
- `apps/web-user/src/settlementsReadout.ts`
- `apps/web-user/src/settlementsReadout.test.ts`
- `.codex/reports/settleora-user-web-settlement-counterparty-payment-details-desktop-20260629-0004.png`
- `.codex/reports/settleora-user-web-settlement-counterparty-payment-details-mobile-20260629-0004.png`
- `.codex/reports/settleora-codex-report-20260629-0004-user-web-settlement-counterparty-payment-details-460.md`

## Required Reading Notes

- Read `PROGRAM_ARCHITECTURE.md`, `README.md`, `docs/workflow/CODEX_TASK_GUIDE.md`, active `.ai/*` files, `docs/planning/USER_WEB_BILLS_GROUPS_FRIENDS_IMPLEMENTATION_PLAN.md`, `docs/architecture/PAYMENT_DETAILS_VISIBILITY_ARCHITECTURE.md`, and `docs/architecture/SETTLEMENT_RUNTIME_ARCHITECTURE.md`.
- Current #460/user-web planning was found in architecture/runtime docs rather than a dedicated #460 planning file under `docs/planning/`.
- Inspected `apps/web-user/src/App.tsx`, `apps/web-user/src/shellModel.ts`, `apps/web-user/src/settlementsReadout.ts`, `apps/web-user/src/settlementsReadout.test.ts`, `apps/web-user/src/profileReadout.ts`, `apps/web-user/src/profileReadout.test.ts`, and `packages/client-web/src/generated/client.ts`.

## Generated-Client Methods Found And Used

- Used `getSettlementCounterpartyPaymentDetails(settlementId: string, userProfileId: string, options: SettleoraAuthenticatedRequestOptions): Promise<SettlementCounterpartyPaymentDetailsResponse>`.
- Existing settlement detail reads remain in use:
  - `getSettlementRequest(settlementId: string, options: SettleoraAuthenticatedRequestOptions): Promise<SettlementRequestResponse>`
  - `listSettlementPayments(settlementId: string, options: SettleoraAuthenticatedRequestOptions): Promise<SettlementPaymentListResponse>`

## Generated-Client Methods Found But Not Used

- `getSettlementCounterpartyPaymentDetailsQrContent(settlementId: string, userProfileId: string, options: SettleoraAuthenticatedRequestOptions): Promise<Blob>` was intentionally not used because this slice is metadata-only and must not fetch QR/image bytes.
- Self payment detail and self QR content methods remain profile-scoped and were not used from the settlements readout.
- Settlement payment proof content methods were not used.

## Missing Method Or Context Categories

- No generated-client method gap blocked implementation.
- Live screenshot capture cannot show authenticated settlement data because the current user-web shell still has no real web credential source and calls `loadSessionBoundaryState({ accessToken: null })`. The captured route therefore shows the established auth-required state.
- Runtime counterparty metadata calls require `session.currentUser.userProfile.id`. If no signed-in profile ID is available, the settlement detail shows an unavailable state and does not call the counterparty payment-detail method.

## Implementation Summary

- Extended settlement detail readout state with a nested counterparty payment-details metadata state.
- Derived the counterparty ID only from the selected server-returned settlement debtor/creditor IDs and the authenticated current user profile ID.
- Called only the settlement-scoped generated metadata method after the selected settlement is loaded and the current profile matches the settlement debtor or creditor.
- Added unavailable states for missing current-user context, nonmatching settlement context, 403/404 API denial/not-found responses, and QR byte/content boundaries.
- Rendered method, handle, note, applied visibility, counterparty ID, and QR metadata when returned by the API.
- Kept QR/image content reads, proof reads, profile/global payment detail reads, edits, uploads, removals, and mutations out of scope.

## Unsupported / Follow-Up Coverage

- Real web credential/session sourcing remains a separate auth/security runtime slice.
- QR/payment image byte display remains future storage/file-byte work.
- Profile/payment edits, visibility mutation, QR upload/remove, settlement payment actions, proof upload/content, and notification runtime remain out of scope.
- No global counterparty payment details are exposed from `#/profile` or unrelated routes.

## Screenshot Evidence

- Desktop: `.codex/reports/settleora-user-web-settlement-counterparty-payment-details-desktop-20260629-0004.png`
- Mobile: `.codex/reports/settleora-user-web-settlement-counterparty-payment-details-mobile-20260629-0004.png`
- Capture commands:
  - `cd /workspace/repos/Settleora; npm --prefix apps/web-user run dev -- --host 127.0.0.1 --port 5174`
  - `cd /workspace/repos/Settleora; npx --yes playwright screenshot --browser=chromium --viewport-size=1440,1100 --full-page http://127.0.0.1:5174/#/settlements .codex/reports/settleora-user-web-settlement-counterparty-payment-details-desktop-20260629-0004.png`
  - `cd /workspace/repos/Settleora; npx --yes playwright screenshot --browser=chromium --viewport-size=390,1200 --full-page http://127.0.0.1:5174/#/settlements .codex/reports/settleora-user-web-settlement-counterparty-payment-details-mobile-20260629-0004.png`
- Screenshot limitation: route evidence is auth-required because no real web credential/session source exists in the runtime shell.

## Validation

- `cd /workspace/repos/Settleora; npm ci` - passed; added 2 packages, audited 6 packages, 0 vulnerabilities.
- `cd /workspace/repos/Settleora; npm run validate:scaffold` - passed; scaffold validation passed for 19 paths.
- `cd /workspace/repos/Settleora; npm run validate:openapi` - passed; Redocly validated `packages/contracts/openapi/settleora.v1.yaml`.
- `cd /workspace/repos/Settleora; npm run validate:clients` - passed; generated web and Dart client validation passed in a temp directory.
- `cd /workspace/repos/Settleora; npm --prefix apps/web-user run lint` - passed; `tsc --noEmit`.
- `cd /workspace/repos/Settleora; npm --prefix apps/web-user run test` - passed; 6 test files, 29 tests.
- `cd /workspace/repos/Settleora; npm --prefix apps/web-user run build` - passed; `tsc --noEmit && vite build`.
- `cd /workspace/repos/Settleora; git diff --check` - passed; no whitespace errors.
- `cd /workspace/repos/Settleora; git status --short` - clean after final commit and push.

## Scope Guard Confirmation

- Changed files are limited to `apps/web-user/src/` and this task's `.codex/reports/` evidence/report files.
- No forbidden backend/API runtime, OpenAPI, generated-client, security/auth/session policy, money/settlement calculation authority, schema/migration, storage/file-byte, deployment, Docker, CI, environment, secret, mobile, or admin-web changes were made.
- The implementation displays server-returned metadata only and does not fetch QR/content bytes or construct storage URLs.
- Client filtering and derived counterparty selection remain presentation/transport gating only; API/domain remains authoritative for authorization, visibility, settlement state, and payment-detail exposure.

## Dirty / Untracked Files Left Untouched

- Pre-existing ignored `.codex/reports/*` files were left untouched.
- Only this task's report and two screenshot files were explicitly force-staged from `.codex/reports/`.

## Next Recommended Action

- Open a separate PR/review task for `feature/user-web-settlement-counterparty-payment-details-readout-460`.
