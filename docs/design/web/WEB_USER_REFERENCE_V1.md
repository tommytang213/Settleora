# User Web Reference V1

## Status

Reference gate for Day 1 user web surfaces.

- Related issues: #458, #459, #460, #461, #462, #372
- Gate issue: #462
- Status: `approved_textual_reference_gate`
- New Figma required for every derivative user-web screen: No
- Runtime implementation authorized by this doc: No

This document adapts the approved Settleora mobile V1 design language to
desktop and tablet user-web surfaces. It is a repo-tracked substitute reference
for broad user-web implementation planning where a screen is derivative of
existing mobile V1 references and follows the rules below.

## Source References

Future user-web implementation tasks must read the current repo versions of:

- [Program architecture](../../../PROGRAM_ARCHITECTURE.md)
- [Day 1 UX reference decisions](../../planning/DAY1_UX_REFERENCE_DECISIONS.md)
- [Day 1 UX implementation readiness plan](../../planning/DAY1_UX_IMPLEMENTATION_READINESS_PLAN.md)
- [Mobile design references](../mobile/README.md)
- [Mobile implementation guardrails V1](../mobile/MOBILE_IMPLEMENTATION_GUARDRAILS_V1.md)
- [Mobile design reference V1](../mobile/MOBILE_DESIGN_REFERENCE_V1.md)
- [Mobile Bills and OCR reference V1](../mobile/MOBILE_BILLS_OCR_REFERENCE_V1.md)
- [Mobile Groups reference V1](../mobile/MOBILE_GROUPS_REFERENCE_V1.md)
- [Mobile Settle reference V1](../mobile/MOBILE_SETTLE_REFERENCE_V1.md)
- [Mobile More and Settings reference V1](../mobile/MOBILE_MORE_SETTINGS_REFERENCE_V1.md)
- [Mobile Notifications reference V1](../mobile/MOBILE_NOTIFICATIONS_REFERENCE_V1.md)
- [Mobile Auth Security reference V1](../mobile/MOBILE_AUTH_SECURITY_REFERENCE_V1.md)
- [Mobile Privacy Vault reference V1](../mobile/MOBILE_PRIVACY_VAULT_REFERENCE_V1.md)
- [Mobile Web Bill Revision Diff reference V1](../mobile/MOBILE_WEB_BILL_REVISION_DIFF_REFERENCE_V1.md)
- Relevant domain architecture docs for auth, storage, money, sync, import/export,
  backup, notifications, privacy, and settlements when those surfaces are in
  scope.

## Product Direction

User web is a product-grade companion to mobile, not a marketing site and not a
backend console. It should feel like a quiet personal finance workspace: dense
enough for repeated review, restrained in decoration, and optimized for scanning
tables, lists, balances, activity, and forms.

The web surface inherits Settleora's mobile V1 language:

- Semantic tokens for surface, text, border, status, navigation, chart, density,
  and elevation.
- Shared components before one-off styling.
- Money displayed with amount plus ISO-style uppercase currency where ambiguity
  matters.
- Product-facing copy only.
- Explicit warning, disabled, loading, error, empty, and denied states.
- API/domain authority for authorization, money, storage access, settlement
  state, sync acceptance, and audit.

## Shell And Navigation

Desktop uses an authenticated application shell with persistent primary
navigation. Recommended desktop structure:

- Left sidebar for `Home`, `Bills`, `Groups`, `Settle`, `Reports`, and `More`.
- Top bar for workspace/server mode, search, sync/status, notifications, and
  profile/account.
- Contextual page actions in the page header, not scattered across cards.
- More/settings area for profile, payment details, account/security,
  notifications, import/export, backup/local-mode, sessions/devices, appearance,
  and advanced tools.

Tablet may collapse the sidebar to icon rail or top tabs depending width.
Mobile web should converge toward the mobile information architecture rather
than creating a separate navigation model.

Navigation must not authorize access by route hiding. The API/domain response
decides whether a user can view or act on data.

## Layout Patterns

Use these patterns before inventing screen-specific layouts:

- Dashboard: summary metrics, needs-attention queue, recent activity, quick
  actions, and upcoming bills arranged as responsive grid plus list bands.
- List/detail: left list or table with right detail panel on wide screens; full
  page detail on narrow screens.
- Split pane: use for bills, groups, settlements, notifications, reports, and
  review queues when the user benefits from keeping list context.
- Detail drawer: use for quick readouts, notification detail, person/payment
  detail previews, and non-destructive edits.
- Modal: reserve for confirmations, focused create flows, import/export
  review, and security/privacy warnings.
- Tables: use for reports, bill histories, settlement history, sync queue,
  import review, and export histories. Tables need sorting, filtering,
  pagination or virtualized scrolling where needed, row actions, and responsive
  fallbacks.
- Cards: use for repeated entities or status panels only. Do not nest cards
  inside cards or turn full page sections into floating cards.

## Dashboard And Readout Structure

Home answers the same questions as mobile in roughly three seconds:

- What is my current spending?
- What do I owe or what is owed to me?
- What needs review?
- What is the next useful action?

Desktop Home may add a denser right rail for notifications, review queue, sync
status, or upcoming recurring bills. It must not become a feature cupboard.
Advanced controls should sit behind filters, More, or mode-aware disclosure.

## Bills, Groups, Friends, Settlements, And Reports

Bills:

- Table/list supports search, filters, date range, status, group/person context,
  receipt/OCR indicators, draft/archive state, and amount plus currency.
- Detail supports read-only overview, item rows, participant shares, payer
  contributions, attachments/proof summaries, OCR review handoffs, activity,
  revisions, and safe action affordances.
- Bill revision review should use the approved desktop reference in
  [Mobile Web Bill Revision Diff reference V1](../mobile/MOBILE_WEB_BILL_REVISION_DIFF_REFERENCE_V1.md).

Groups:

- Group dashboard uses summary readouts, balances, members, open bills,
  needs-attention items, invite/member management, and group activity.
- Member and role surfaces must present server-authorized status and avoid
  implying client-side permission authority.

Friends and direct sharing:

- Use exact-match search and invite/link flows by default.
- No browse-all-users directory unless a later manually gated policy enables it.
- Friend status alone does not expose payment details, receipt files, proof
  files, hidden profile data, or unrelated bills.

Settlements:

- Use summary balances, suggested actions, request/payment detail, proof summary,
  payment method visibility, residual/overpayment/underpayment states, and
  activity timeline.
- Final settlement actions require detail-first review and action-specific
  wording.

Reports:

- Summary-first, then statement-style details.
- Support search, filters, date ranges, group/person/category/currency filters,
  and export affordances where authorized.
- Reports render server-authorized truth and must not compute authoritative
  money or settlement state in the browser.

## Search, Filter, Import, Export, And Backup Surfaces

Search and filters should use a consistent pattern: persistent search field,
filter chips or toolbar, advanced filter drawer, applied-filter summary, and
clear-all action.

CSV import/export and backup surfaces must use staged review language:

- Export copy states scope, destination, sensitivity, and included categories.
- Import copy states that imported data is staged until validated and accepted.
- Unsupported or unimplemented runtime states must be explicit.
- Backup/local-mode copy must distinguish local-only authority from server-mode
  authority.
- UI must not expose storage paths, provider internals, object IDs, raw file
  bytes, raw OCR text, secrets, tokens, or vault keys.

Import/export/backup runtime remains manually gated by domain. This textual
reference only clears the broad visual/reference gate for ordinary web surface
composition.

## Account, Security, Profile, Notifications, And Payment Details

Account/security surfaces adapt the mobile auth/security and settings references
to desktop:

- Use readable setting rows, policy/state chips, last-updated readouts, and
  action-specific confirmations.
- Sessions/devices can use tables or rows with current-session emphasis and
  safe revoke/sign-out-all copy.
- MFA/passkey setup, recovery-code display, and security warnings still need
  strong visual evidence in implementation tasks.

Notifications:

- Notification center uses filters, unread/read state, needs-action queue,
  detail pane/drawer, bulk read/archive actions, and activity links.
- Notification visibility and deep links do not authorize underlying business
  data.

Payment details:

- Use a searchable payment method picker, masked previews, visibility chips, QR
  summary/file handoffs, and authorized counterparty readouts.
- Payment details are shown only when API/domain policy allows the current
  actor to see them.

## Responsive And Scroll Behavior

Breakpoints should preserve task context:

- Wide desktop: sidebar plus content, optional split pane or right rail.
- Medium/tablet: collapsed rail or top navigation, two-column content where
  useful, drawers for detail.
- Narrow/mobile web: stacked content, bottom-safe sticky actions only where they
  do not cover content, mobile-like navigation density.

Long forms, tables, sticky action bars, drawers, and split panes need stable
scroll containers, visible focus order, and enough bottom padding that sticky
actions never cover final content.

## Shared Components And Tokens

User web should define or reuse shared components corresponding to the mobile
component set:

- App shell, top bar, side nav, notification affordance, profile menu.
- Search field, filter chip group, advanced filter drawer.
- Status chip, privacy/trust chip, sync chip, metric chip.
- Money text, money input, currency selector, date field.
- Person/group selector, payment method selector, category selector.
- Data table, list row, detail drawer, split pane, activity timeline.
- Primary, secondary, quiet, and destructive buttons.
- Empty, loading, error, warning, offline, denied, stale, blocked, and sync
  conflict states.

Token categories must include color, surface, text, border, elevation, status,
navigation, chart, spacing, radius, and density. Web density can be more compact
than mobile, but touch targets and focus states must remain accessible.

## Privacy-Safe Copy And States

Normal user-facing copy must not expose implementation details:

- No API route names, repository names, generated-client language, internal IDs,
  storage paths, object-store keys, provider payloads, raw config, stack traces,
  raw secrets, tokens, recovery codes, raw OCR full text, or sensitive file
  contents.
- Denied states should say the user cannot access the item, not reveal hidden
  record details.
- Unconfigured provider states should say setup is unavailable or incomplete,
  not pretend delivery or upload succeeded.
- Warnings for import/export, backup, privacy, security, sync conflicts, and
  settlements must describe consequences before final action.

## Visual Evidence Requirements

Material user-web UI PRs must include branch-rendered visual evidence, even when
new Figma is not required:

- Desktop screenshot for the changed primary screen.
- Tablet or narrow responsive screenshot when layout changes across breakpoints.
- State evidence for changed empty, loading, error, warning, denied, or disabled
  states.
- Screenshot comparison against approved repo references when a matching mobile
  or desktop reference exists.
- Explicit note when a textual reference is used instead of new Figma.

Do not use generated Figma code, fabricated screenshots, or scraped Figma
assets as implementation source.

## Gate Classification

Can proceed from this textual reference plus existing mobile/domain references:

- #458 user-web shell/navigation planning and ordinary authenticated shell
  layout, subject to auth/security manual gates for runtime.
- #459 derivative bills, groups, friends, and direct-sharing surfaces when they
  use existing mobile patterns and approved bill-revision desktop reference.
- #460 derivative settlement, notification, profile, and payment-detail surfaces
  when they use existing mobile patterns and do not introduce new high-risk
  confirmation flows.
- #461 derivative reports, search, filters, export/import planning, and
  unsupported-state surfaces when runtime import/export/backup authority remains
  separately gated.

Still needs screenshot, Figma, or human taste approval before implementation:

- A materially new dashboard shell or visual language.
- New high-consequence security/privacy/auth warning patterns.
- MFA/passkey/recovery-code screens not already covered by approved references.
- New import conflict, restore, backup, or data-loss confirmation flows.
- New settlement dispute, correction, residual, or post-settlement revision
  impact flows not covered by approved references.
- Any web UI PR whose branch-rendered screenshots show a material divergence
  from the approved Settleora product language.

## Acceptance Checklist For #462

- Full Day 1 user-web surface categories are named.
- Responsive layout, states, accessibility, and component inventory are defined.
- Implementation wait rules and visual evidence requirements are explicit.
- Textual substitute reference is identified for derivative screens.
- Remaining screenshot/Figma/taste approval blockers are named precisely.
- No runtime, API, OpenAPI, generated-client, schema, auth/security, storage,
  money, deployment, provider, or secret change is authorized.
