# Mobile Auth, Session, And API Client Flow

## Purpose

This document is the design gate for Settleora mobile server-mode auth, session, and generated API client wiring. The current runtime covers first-launch configuration, secure app/session storage boundaries, generated-client-backed sign-in/current-user validation, refresh-aware access-token lookup, a minimal authenticated server-mode shell, current-session logout, account-wide sign-out-all, session/device list, per-session revocation, session-gated self profile/payment-details repository injection, session-gated receipt review repository injection, session-gated personal bill repository plus bill sync queue controller injection, session-gated group bill read-only repository/list/detail access, a starter session-gated settlement repository/list/detail foundation, a starter session-gated recurring-bill template/forecast/detail/draft-generation foundation, a starter session-gated group management repository/list/detail/member surface, a starter session-gated in-app notification list/summary/read/archive surface, and a starter session-gated monthly report read surface.

The mobile app must support both local-only use and server-connected use without moving auth, authorization, money, storage, OCR review apply, or audit authority into the client. This document does not authorize runtime code by itself.

## Current State

- The Dart API client is generated from `packages/contracts/openapi/settleora.v1.yaml` into `packages/client-dart/lib/generated/` and is exported by the `settleora_api_client` package.
- The mobile app depends on `settleora_api_client` through `apps/mobile/pubspec.yaml`.
- The mobile app has a generated-client adapter seam in `apps/mobile/lib/api/settleora_api_client.dart` with `SettleoraApiConfiguration`, `SettleoraGeneratedApiClientFactory`, and `SettleoraAccessTokenProvider`.
- The receipt OCR review mobile foundation exists under `apps/mobile/lib/receipt_ocr_review/`. It can render queue/detail/edit/apply-preview/apply states when a repository is injected, and the generated-backed repository reads an access token per operation through `SettleoraAccessTokenProvider`.
- The starter mobile bill foundation exists under `apps/mobile/lib/bills/`. It reads personal bills and group-scoped bills through a generated-client-backed repository seam, derives active versus archived display state from bounded list filters, queues archive/restore operations only for personal bills through the sync queue foundation, and flushes personal bill queued work through `SettleoraSyncQueueProcessor` when a session is available. Group bill mobile support is read-only list/detail only in this slice.
- The starter mobile settlement foundation exists under `apps/mobile/lib/settlements/`. It reads current-actor balance projections, settlement requests, settlement request details, payment claims, and settlement-scoped counterparty payment details through a generated-client-backed repository seam, and exposes conservative online-only request/payment/residual actions that reload server state after mutation.
- The starter mobile recurring bill foundation exists under `apps/mobile/lib/recurring_bills/`. It reads recurring bill templates, upcoming forecast occurrences, template detail, and explicit draft-generation results through a generated-client-backed repository seam. Draft generation is an online-only user action and the mobile app reloads server state after success instead of treating forecast data as financial truth.
- The starter mobile in-app notification foundation exists under `apps/mobile/lib/notifications/`. It reads current-user notification summary/list rows and submits read/archive actions through the generated-client-backed repository seam. Notification visibility is presentation only: linked bill, settlement, or recurring data must still be re-fetched through its own server-authorized route before any future deep-link behavior.
- The starter mobile monthly report foundation exists under `apps/mobile/lib/reports/`. It reads the server-authorized monthly report through `SettleoraApiClient.getMonthlyReport`, normalizes `yyyy-MM` months and optional group IDs at the repository boundary, preserves decimal-safe money strings with currency attached, and displays report sections without recomputing financial truth.
- The starter mobile self profile/payment-details foundation exists under `apps/mobile/lib/profile/`. It reads and updates the authenticated actor's own profile and text payment details through generated-client-backed repository seams, loads fresh data when opened, maps failures into bounded mobile states, and displays safe QR availability metadata without adding QR upload/remove UX.
- The starter mobile group management foundation exists under `apps/mobile/lib/groups/`. It lists and reads groups, creates/updates group names, lists active visible members, and submits existing registered-user member role/removal actions through the generated-client-backed repository seam. The server remains authoritative for actor identity, authorization, membership visibility, role mutation, audit, and conflict handling.
- The mobile app now has a first-launch local/server mode choice, server base URL validation and normalization, a secure-storage-backed app/session boundary, a generated-client-backed sign-in/current-user repository seam, a refresh-aware secure-session access-token provider, a minimal authenticated server-mode shell, current-session logout, sign-out-all, session/device list, per-session revocation, bootstrap-time repository injection for the self profile/payment-details screen, bootstrap-time repository injection for the receipt OCR review queue, bootstrap-time personal/group bill repository injection plus personal bill sync controller injection, bootstrap-time settlement repository injection, bootstrap-time recurring bill repository injection, bootstrap-time notification repository injection, and bootstrap-time monthly report repository injection after current-user validation succeeds.
- The mobile app does not yet implement local-mode expense storage, mobile group bill creation/edit/lifecycle/offline support, mobile recurring bill creation/editing/full lifecycle/offline queueing/reminders/background generation/advanced exceptions, push notifications, device-token registration, notification preferences, notification deep links/background delivery, mobile receipt capture/OCR extraction, broad bill creation/editing/settlement/payment mobile screens beyond the starter settlement read/detail/action foundation, passkeys, MFA, OIDC/Keycloak mobile flows, password reset/recovery, full offline cache hydration, broad sync conflict review UI, or broader product dashboard UI.
- The backend currently exposes reviewed local auth/session endpoints for first-owner bootstrap, local sign-in, refresh, current-user, current-session sign-out, current-account sign-out-all, current-account session list, and per-session revocation.
- The backend has `SettleoraSession` bearer authentication, current-actor access, authorization policies, and guarded receipt OCR review endpoints that require authenticated session access.
- The backend remains authoritative for auth/session validation, current actor resolution, authorization, money, storage/file access, OCR-review apply eligibility, status transitions, and audit.

## Product Flow

### First Launch

Mobile first launch should ask the user to choose one mode:

- **Local Mode**: local-only profile data stays on the device. No server auth is required. Server-only collaboration, groups, shared bills, server receipt OCR review, and settlement sync are unavailable.
- **Connect to Server**: the user configures a Settleora server base URL, signs in when mobile auth UI exists, and all server-mode collaboration goes through the API.

The mode choice must be explicit. The app must not silently turn a local profile into a server account, and it must not silently start sending local-only receipt, OCR, bill, payment, or profile data to a server.

A future Settleora Cloud managed workspace is still a server-mode authority boundary from the mobile app's perspective. Mobile must treat it like an explicitly selected server/cloud connection, derive auth and current-user state from that boundary, and avoid silently uploading local-only data during setup, sign-in, subscription checks, or workspace switching.

### Server Configuration

Server-mode setup should collect or discover a deployment base URL before any generated API client is created for authenticated repositories.

Requirements:

- Store the validated base URI as deployment configuration, not as a hardcoded app constant.
- Accept self-hosted realities such as LAN hostnames, VPN-only names, reverse-proxy names, and Cloudflare Access-fronted domains.
- Validate that the configured URL uses an approved scheme and normalized API base before saving.
- Treat local development exceptions separately from production behavior.
- Avoid embedding a production API URL or a developer workstation URL in app code.

Server discovery can be manual on Day 1. QR code import, managed configuration, and service discovery can be separate future slices.

### Sign-In

The backend local sign-in endpoint and generated Dart client are wired through the mobile auth repository. The implemented mobile sign-in flow:

1. Uses the validated server base URI to create the generated API client.
2. Submits only the reviewed sign-in contract fields required by the backend.
3. Receives opaque access-session and refresh-like credential material only from the backend.
4. Immediately stores token material through the approved secure-storage boundary.
5. Calls current-user with the access token to derive the signed-in actor/profile/session display state.
6. Routes authenticated server-mode repositories through injected token providers, not static globals.

Manual bearer-token entry is not a production UX. Developer-only token overrides, if ever added, must be separately gated, non-persistent by default, hidden from normal builds, and explicitly excluded from production flows.

### Session-Required And Session-Expired States

Screens backed by authenticated server APIs must show a session-required state when no valid local session material is available. They must show a session-expired state when the server rejects the current token or refresh cannot recover.

The mobile app may cache display state, but it must not decide that a user is still authorized because a profile card, route, group membership row, or generated client method exists locally. Server responses decide whether a session is accepted, expired, denied, unavailable, conflicted, or invalid.

### API Client Injection

Generated API clients should be configured at repository boundaries:

- Base URI comes from validated server configuration.
- Access token comes from an injected token provider.
- Repositories retrieve the token per call.
- Repositories map transport and problem responses into bounded mobile-domain failures.
- UI routes receive repositories through composition or app routing once the signed-in server-mode state exists.

The receipt OCR review generated repository already follows the per-call token-provider direction. Future repositories should reuse that pattern instead of reading global token state.

### Logout And Revocation

Mobile logout prefers server-authoritative revocation:

- Normal logout attempts current-session sign-out before clearing local secure session material.
- If the server is unreachable, local secure session material is cleared only after the user explicitly chooses local device sign-out.
- Sign-out-all is exposed only through an explicit account-wide confirmation from the session list.
- Per-session revocation is exposed from the device/session list for non-current sessions.

Logout UX must avoid showing raw access tokens, refresh credentials, password values, provider tokens, session hashes, or credential metadata.

### Session And Device List

The mobile device/session list displays only safe session metadata returned by the API, such as labels, status, timestamps, and the current-session marker. It does not display raw tokens, refresh credentials, token hashes, auth account IDs, or session hashes. It must not derive trust from device names alone, and revocation remains server-authoritative.

## Security And Privacy Requirements

- Production UX must not ask users to paste bearer tokens.
- Production builds must not hardcode the production API base URL, a local development URL, or a deployment-specific host.
- Raw access tokens, refresh credentials, passwords, recovery codes, OIDC access tokens, OIDC refresh tokens, and OIDC ID tokens must never appear in logs, audit metadata, crash reports, analytics, screenshots, exported diagnostics, UI error text, exception `toString()` output, or debug state dumps.
- Token material must be stored only through the approved secure storage boundary. Plaintext local files, ordinary shared preferences, source files, fixtures, screenshots, and generated clients are not valid secret stores.
- Access sessions should be short-lived where practical. Refresh/session rotation, replay handling, expiry, and revocation remain backend-authoritative.
- The client must not infer authorization from cached profile data, hidden buttons, generated-client availability, local route state, local group membership, local bill records, or saved receipt review summaries.
- Server responses decide denied, unavailable, conflict, validation, session-expired, and session-required states.
- Receipt, OCR, bill, payment, settlement, proof, storage, and profile data must not leak through auth/session error messages.
- Auth/session UI should not reveal whether a particular account, identifier, role, group, bill, file, or receipt exists unless the backend has returned a response that is safe to display.
- Local-only mode may use device security such as OS keystore, biometric unlock, encrypted local storage, and app lock later, but those do not authorize server-mode APIs.
- Development logging must treat token and receipt/OCR data as sensitive by default.

## API Client Boundary

Future mobile server-mode repositories should follow this boundary:

- The generated client is transport plumbing, not an authorization decision point.
- The base URI is injected from validated server configuration.
- The token provider is injected into repositories.
- Token lookup happens per API call so refresh/revocation state can take effect.
- Repositories should map `401` to unauthenticated/session-expired, `403` to denied, `404`/`410` to unavailable where appropriate, `409` to conflict, `400`/`422` to validation, network and TLS failures to offline/unreachable, and `5xx` to server failure.
- Problem details must be reduced to safe mobile messages before display.
- The client must not submit actor identity, auth account IDs, current-user IDs, group membership authority, settlement authority, file/storage authority, provider object keys, storage paths, generated totals, or money authority.
- The client may submit reviewed user input required by a specific contract, but the API revalidates identity, membership, visibility, mutation rights, money, file ownership, OCR-review apply eligibility, and audit.

For receipt OCR review specifically, the mobile repository may submit bounded review/header/line candidate fields supported by the contract. It must not submit authoritative bill item IDs, preview totals, split allocations, settlement data, actor identity, group membership, file metadata, storage metadata, or route ownership as authority.

## Minimum UX States

Mobile implementation should model these states explicitly:

- **Not configured**: no server base URI exists and no local mode has been selected.
- **Local mode selected**: local-only data is available; server-only features are hidden or shown as connect-to-server actions.
- **Server configured, signed out**: server base URI exists, no usable session material exists.
- **Signing in**: credentials are being submitted; secret fields must not be logged or shown outside the form.
- **Signed in**: current-user validation has succeeded and server-mode repositories receive injected configuration and token providers.
- **Session expired**: current token or refresh path failed; authenticated routes require sign-in again.
- **Offline/server unreachable**: network, DNS, timeout, proxy, or server availability failure.
- **TLS/certificate warning**: production should fail closed for certificate errors; development exceptions must be explicit and not silently persisted into production.
- **Denied/unavailable from server**: the API returned a safe denial or not-found/unavailable state; the UI must not reinterpret it as local permission.
- **Logout/revoke in progress**: revocation is underway and protected actions should be disabled until the local session state is settled.

These states should be shared enough that receipt OCR review, bills, settlements, payment details, and future sync screens do not each invent their own auth vocabulary.

## Self-Hosted Deployment Notes

Settleora is self-hosted, so mobile connection design must work beyond a single vendor-hosted URL.

Supported deployment shapes should include:

- LAN-only deployments for a household or small group.
- VPN-only deployments.
- Reverse proxy deployments with a stable domain.
- Cloudflare Access or similar identity-aware proxy fronting the Settleora API.
- TrueNAS or other home-server deployments where DNS, certificates, ports, and reverse proxies are operator-managed.

Production defaults should still prefer HTTPS and valid TLS. Local development can allow explicit HTTP localhost/LAN exceptions only in development builds or visibly marked development settings. A certificate warning should not train users to bypass TLS casually; a future implementation should either reject invalid TLS by default or require a deliberate, auditable development-only trust decision.

If a deployment uses an upstream access proxy, Settleora mobile still needs an approved way to authenticate to Settleora itself or to exchange trusted upstream identity for a Settleora session. Proxy presence alone must not cause the app to skip backend current-user/session validation.

## Backend Dependencies And Future Slices

Good follow-up slices are small and reviewable:

- Keep the implemented mobile auth/session lifecycle shell aligned as future receipt, bill, settlement, and payment-details screens are added.
- Keep group bill mobile creation, edit, lifecycle, and offline/sync work in separate slices that preserve API authority over group membership, bill money, participant state, and settlement effects.
- Keep recurring bill creation, editing, full lifecycle actions, offline queueing, reminders, background generation, and advanced exceptions in separate slices that preserve API authority over recurrence, draft generation, money, authorization, and audit.
- Keep push notifications, device-token registration, notification preferences, reminder scheduling, deep-link routing, and background delivery in separate slices that preserve server authority over notification visibility and linked business-resource authorization.
- Add mobile self payment QR upload/remove/content UX only in a separate file-handling slice with reviewed platform dependency and permission choices.
- Optional managed/server-discovery flow for self-hosted deployments.
- OIDC/Keycloak or passkey/MFA mobile flows only after separate backend and mobile design gates.

## Non-Goals

This document does not add or authorize additional:

- OpenAPI path or schema changes.
- Generated-client changes.
- Backend auth/session implementation.
- New login/current-user/session issuance endpoints.
- Keycloak, OIDC, passkey, or MFA runtime.
- OCR engine, worker, upload, receipt capture, thumbnails, sync/offline, bill apply, settlement, storage, or file API behavior.
- Production bearer-token paste UX.
- Client-side authorization decisions.
