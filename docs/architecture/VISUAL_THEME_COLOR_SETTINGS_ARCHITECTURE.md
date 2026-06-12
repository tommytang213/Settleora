# Visual Theme And Color Settings Architecture

## Purpose

This document defines the architecture guardrail for configurable visual and color settings in Settleora. It is documentation only. It records the future persistence and safety model without authorizing database migrations, runtime endpoints, generated-client changes, or settings UI work.

Visual settings are presentation preferences. They must make the product easier to read, personalize, and administer, but they must never become an input to authorization, financial truth, settlement state, sync acceptance, storage access, audit truth, or security policy.

## Concepts And Terminology

- App theme palette: A named collection of semantic color tokens used by the mobile, web, and admin interfaces, such as background, surface, text, border, primary action, warning, success, danger, chart, and chip colors.
- Appearance mode: The selected rendering mode for a profile or deployment. Supported concepts are `system`, `light`, and `dark`, where `system` follows the operating system or browser setting.
- Accent color: A constrained color preference used for prominent actions, focus states, selected navigation, or similar emphasis surfaces.
- Category, tag, group, dashboard, and chart colors: Subject-specific display colors used to help users distinguish product concepts. These colors are presentation labels only, not policy or data classification.
- Status display colors: User-configurable status colors where the product explicitly allows display customization. Status colors do not change the underlying status value or status transition rules.
- Built-in palette: A palette definition shipped with the app code for first launch, offline bootstrap, and seed data. Built-in palettes are immutable at runtime.
- Deployment/admin default palette: The persisted default selected by a deployment owner or admin where policy allows. It applies when a user profile has no explicit visual preference.
- User-owned palette: A palette owned by one user profile and available as that user's personal preference.
- Shared palette: A user-owned or deployment-owned palette made visible to other users according to sharing policy.
- Copied or forked palette: A new palette derived from another palette. The copy has its own owner, version history, and future edits.
- Palette version: A stable version marker for a palette definition. Versions let clients cache safely, audit changes, and avoid silently mutating historical user choices.

## Persistence And Source Of Truth

Visual preference resolution should use this order:

```text
1. User-specific active visual preference
2. Admin/deployment default visual preference
3. System-seeded database default
4. Built-in app fallback for first launch/offline/bootstrap only
```

In server mode, visual preference persistence belongs behind API/domain boundaries and PostgreSQL. The API owns writes for server-mode palettes, selected visual preferences, deployment defaults, palette sharing, and cross-user visibility. Mobile, web, and admin clients may render and locally cache selected settings, but they must not bypass the API as the server-mode source of truth.

Database migrations and seed data for palettes must be explicit, reviewable files. Production startup must not silently auto-apply migrations, rewrite palette rows, change selected palettes, or mutate user color data. Built-in app palettes may exist in code only as offline fallback and seed definitions.

Local-only mode stores visual preferences locally and remains locally authoritative for those preferences. Local-only storage should preserve the user's active palette, appearance mode, accent color, and subject-color choices without requiring a server.

If local-to-server migration or import is supported later, the import path must explicitly map local visual preferences into server-mode preference records. It must not silently discard, merge, or publish local palettes without user-visible behavior and API validation.

## Suggested Future Schema Model

Future schema work should remain directional until an implementation branch explicitly approves migrations and API contracts. Likely table or entity concepts include:

- `visual_palettes`: Palette root records with stable IDs, owner scope, optional user profile owner, palette key, display name, semantic tokens JSON, version, source or fork parent ID, built-in or seeded flag, shared visibility, active or archived state, created timestamp, and updated timestamp.
- `user_visual_preferences`: Per-profile active preferences with user profile ID, selected palette ID or key, palette version, appearance mode, accent token or color reference, local/import source metadata where safe, created timestamp, and updated timestamp.
- `deployment_visual_preferences`: Deployment-level defaults with selected palette ID or key, palette version, default appearance mode, policy flags for user customization, actor metadata through audit boundaries, created timestamp, and updated timestamp.
- `visual_subject_colors`: Optional subject-specific color assignments for categories, tags, groups, dashboards, charts, or configurable statuses, with subject type, subject ID, user or deployment scope, semantic token key or strict color value, created timestamp, and updated timestamp.
- `palette_shares`: Palette sharing records with palette ID, owner profile or deployment scope, recipient scope, visibility, share status, optional copy/fork relation, created timestamp, updated timestamp, and revoked or archived timestamp.

Palette JSON should use known semantic token keys and bounded value shapes. Tables should use stable identifiers and state fields that support active, archived, revoked, or replaced records without deleting history needed by existing users.

## Palette Mutation And Versioning Rules

Built-in palettes are immutable. Editing a built-in palette creates a new user-owned or deployment-owned version/fork rather than changing the built-in definition for everyone.

Editing a deployment default changes the default for new users and users with no explicit visual preference only, unless a future explicit migration policy is approved. Existing users with user-specific active preferences must not be silently moved to a new palette.

Editing a private, unshared personal palette may update in place when no other user depends on it and the owner is clearly editing their own preference. The implementation may still create versions for audit, undo, or cache correctness.

Editing shared, copied, or subscribed palettes should create a new version or fork by default. Sharing should copy or fork by default so recipients receive stable colors that do not unexpectedly change later.

Subscribe-to-updates behavior is a future optional feature. It must be opt-in by the recipient and should clearly explain that future owner changes can affect the subscriber's appearance.

Deleting a shared palette should archive the palette or revoke sharing. It must not break existing recipient copies, remove historical palette references, or invalidate users' active preferences without an explicit replacement flow.

## User And Admin Behavior

Palettes are per user profile by default. Different users may use the same palette, copied variants of a palette, or completely different palettes while viewing the same bills, groups, settlements, and receipts.

Deployment owners or admins can manage deployment defaults where policy allows. Those defaults are fallback preferences, not forced mutation of every existing user profile unless a future policy explicitly defines a forced theme mode.

Users can create personal custom palettes if customization is enabled. Custom palette creation should support controlled token editing rather than arbitrary stylesheet input.

Future custom color UX should preview representative surfaces before save, including text, buttons, chips, navigation, charts, and warning/success/error states where applicable. Contrast warnings should be friendly but clear. Example actions should include `Use new color` and `Keep current color` so the user can intentionally accept or reject a risky choice.

## Validation And Safety Rules

Custom colors must be validated as safe structured values. Acceptable shapes should be approved semantic token keys or strict color values such as `#RRGGBB`. Do not store executable CSS, HTML, JavaScript, raw style blobs, URLs, selectors, or arbitrary platform rendering code in visual preference records.

Contrast must be checked where colors affect text, chips, icons, charts, navigation, form controls, and status indicators. Warnings should distinguish readability risk from hard validation failure. Accessibility-critical surfaces may require hard minimum contrast.

Palette JSON must have bounded size, known semantic token keys, stable value types, and deterministic fallback behavior. Unknown or missing tokens should fall back safely through the resolved palette chain without crashing or rendering unreadable UI.

Themes must be compatible with localization and accessibility. Text expansion, right-to-left layouts, high-contrast needs, color-blind use, and system light/dark settings should remain usable.

## Security And Audit Boundary

Visual settings are presentation-only. They must not influence:

- authentication or authorization
- user, group, bill, receipt, settlement, payment, or file visibility
- money calculations, split calculations, rounding, balances, or settlement status
- sync acceptance, conflict resolution, or server validation
- storage provider access, file object identity, or receipt/proof access
- audit truth, security policy, session policy, or admin authority

Admin, global, or deployment visual policy changes should be auditable because they affect multiple users' presentation defaults. Palette share and revoke actions can be auditable where they change cross-user visibility.

Visual setting audit metadata must be bounded and must not log secrets, auth tokens, raw receipt contents, sensitive payment details, storage paths, object keys, signed URLs, or unrelated bill/payment data.

## Non-goals

This document does not authorize:

- database migrations
- OpenAPI contract changes
- generated client changes
- runtime settings endpoints
- mobile, web, or admin settings UI
- OCR implementation
- AI-driven theming
- direct migration of existing users
- money, authorization, settlement, sync, storage, or security behavior changes

## Future Implementation Slices

Future work should be split into small branches such as:

1. Documentation and contract design for visual preference endpoints.
2. Server schema migration for palette, preference, subject-color, and sharing tables.
3. API endpoint, OpenAPI, and generated-client slice for read/write visual preferences.
4. Mobile settings read/apply persisted palette slice.
5. Custom palette preview and contrast warning UI slice.
6. Admin deployment default palette policy slice.

Each slice must restate its authority boundary and validation plan before implementation.
