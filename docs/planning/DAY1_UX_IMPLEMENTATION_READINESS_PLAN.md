# Day 1 UX Implementation Readiness Plan

## Purpose And Status

This plan converts the merged Day 1 UX/reference decisions into an
implementation-readiness map for future focused branches.

Status: `docs/control readiness plan`. It does not implement runtime UI, API
behavior, OpenAPI contracts, generated clients, schema, migrations, providers,
auth/security runtime, storage/file-byte behavior, import/export runtime,
backup/restore runtime, sync runtime, money/settlement/bill-calculation logic,
deployment, CI, Docker, environment changes, or secrets.

Use this file with [Day 1 UX reference decisions](DAY1_UX_REFERENCE_DECISIONS.md)
and the relevant domain architecture docs before opening future implementation
branches.

## Relationship To UX Reference Decisions

[DAY1_UX_REFERENCE_DECISIONS.md](DAY1_UX_REFERENCE_DECISIONS.md) answers the
product/reference questions that previously blocked several UX-facing tracks:
when new Figma is required, which notification channels are Day 1, how sync
conflicts preserve local pending changes, how friends/direct sharing and
temporary participants work, which privacy modes are Day 1, which
import/export/backup flows are in scope, and how bill revision settlement
impact must be reviewed.

This plan does not replace that packet. It translates the packet into issue
readiness, recommended branch names, first slices, validation classes, and
close rules.

## Global Rules

### Do Not Generate New Figma By Default

New Figma or another strong visual reference is required only for critical
flows listed in the UX packet, risky new interaction patterns, materially new
dashboard shells, new web/admin visual language, high-consequence warning or
confirmation patterns, or screens not safely covered by existing references and
components.

Derivative screens should use existing repo-tracked mobile references,
Settleora product language, shared components, product-grade web/admin
patterns, and platform-specific responsive adaptations. Material UI tasks still
require visual QA screenshots and report evidence even when no new Figma is
required.

### No Duplicate Issue Creation

Reuse existing issues where they already cover the work. Create a new focused
child issue only when a required implementation follow-up is not represented by
an existing open issue, recently closed reference gate, or linked child issue.

This audit created no new issues.

## Remaining Implementation Tracks

| Track | Existing coverage issue(s) | Implementation readiness | New Figma required? | Existing references enough? | Manual-gated domain(s) | Recommended next branch/bundle | First child implementation slice | Validation class |
|---|---|---|---|---|---|---|---|---|
| Experience modes: Basic/Guided/Advanced/Help me decide | #412 | `needs_figma_visual_reference` | Yes for first-launch mode choice, help-me-decide, and settings/change flows | Partly; architecture and UX packet clear behavior, but first-launch/settings reference still needed | Schema/API/OpenAPI/generated-client if preferences or server-resolved hints are implemented; auth/security/money/storage only if crossed | `feature/uxmodes-first-launch-reference-412` then `feature/uxmodes-preference-runtime-412` | Reference/checklist for first-launch and settings states, then preference model split | `mobile-ui` for visual gate; `openapi-client` if contract/preferences are added |
| Advanced search/filter and group dashboard | #405, #296, #299, #301 | `ready_for_codex` for derivative mobile/web planning and bounded UI slices; `needs_figma_visual_reference` only if dashboard shell changes materially | No by default; yes for material dashboard/layout redesign | Yes for normal search/filter/report/dashboard patterns | OpenAPI/generated-client if server filters change; money if report truth changes | `feature/search-filter-dashboard-slice-405` | Mobile/web local search/filter and group dashboard readiness slice using existing patterns | `mobile-ui` or `openapi-client` depending touched files |
| Passkey/TOTP/recovery-code/policy/audit/UI/QA | #394, closed #413-#417, merged #501-#506, #465 | `needs_figma_visual_reference` for remaining admin/security policy reference; runtime children are already represented | Yes only for remaining MFA/passkey admin policy/security UX where existing auth reference is insufficient | Mobile/user auth references and UX packet cover normal auth flow reference; #465 remains admin policy surface | Auth/session/security, schema/migration, OpenAPI/generated-client, admin exposure | `feature/admin-mfa-passkey-policy-reference-465` | Admin policy/reference gate for MFA/passkey enforcement and recovery readouts | `mobile-ui`/web visual QA for reference/UI; security/runtime branches use `openapi-client` or auth validation |
| Email/push/device token/preferences/delivery-state/policy/QA | #403, closed #448-#452 | `needs_figma_visual_reference` only if notification preference/permission/deep-link UX is not fully covered by #452 close evidence; otherwise `needs_architecture_breakdown` for runtime provider slices | No new broad Figma by default after UX packet; new reference only for risky provider/permission states not covered | Yes for product/reference direction; architecture docs cover event taxonomy, SMTP, push, preference resolution | Provider credentials/secrets, push release/provider setup, auth/security notification events, OpenAPI/generated-client | `feature/notification-provider-runtime-split-403` | Split SMTP/push/device-token/preference-delivery runtime into provider, API, mobile, and QA branches | `openapi-client`, `api`, provider/runtime QA as scoped |
| CSV import/export and local backup/restore | #406, closed #453-#457 | `needs_architecture_breakdown` for runtime split; reference gate no longer a blocker after #456/UX packet | No new broad Figma by default; only risky import conflict/backup warning states need stronger reference | Yes for planning/reference; architecture docs cover authority, backup security, validation | Storage/privacy, money/import validation, OpenAPI/generated-client, schema/migration if persisted candidates are added | `feature/import-export-runtime-split-406` | Split CSV export, staged CSV import, local backup package, restore preview, and QA into child runtime issues | `storage`, `openapi-client`, `money`, or `mobile-ui` by slice |
| Mobile screen-by-screen Day 1 completeness | #407, #372, #295, #296, #299, #301 | `ready_for_codex` for checklist/audit and derivative UI hardening; `needs_figma_visual_reference` for critical/risky flows only | No by default; yes only for UX-packet critical flows or uncovered component patterns | Yes for normal mobile screens via `docs/design/mobile/*` and guardrails | Manual gates only if a slice touches auth/security, storage/privacy, money, OpenAPI, schema, deployment, or generated clients | `feature/mobile-day1-completeness-checklist-407` | Screen inventory/checklist mapping current surfaces, missing runtime dependencies, and visual QA needs | `mobile-ui` for UI; `docs-only` for checklist-only |
| User web Day 1 surfaces | #458, #459, #460, #461, parent #373 | `needs_figma_visual_reference` for web design gate before broad implementation; focused docs/control planning can proceed | Not screen-by-screen by default, but #462 must clear shared web visual/reference system before implementation | Existing mobile/product references are enough for derivative behavior, not enough for full web shell/component system | Auth/security, OpenAPI/generated-client, storage/privacy, money/settlement, import/export depending slice | `feature/web-user-day1-shell-458` after #462 reference gate | Auth/session shell and navigation foundation, then bills/groups/friends, settlement/profile/notifications, reports/import/export | `openapi-client` or web UI validation as scoped |
| Web/user and admin design-system and Figma/reference gates | #462, #468 | `needs_figma_visual_reference` | Yes as focused design-system/reference gates, not broad new Figma for every derivative screen | Existing product language helps, but web/admin component systems need explicit reference | None for design-only; downstream manual gates remain per domain | `design/web-user-reference-gate-462`, `design/admin-web-reference-gate-468` | Define components, responsive states, accessibility, screenshots/evidence, and implementation wait rules | `docs-only` or visual/reference evidence |
| Admin web Day 1 surfaces | #463, #464, #465, #466, #467, parent #376, legacy #377-#379 | `needs_manual_gate` and `needs_figma_visual_reference` before runtime; docs/control planning remains ready | Yes for admin shell/policy/audit/maintenance reference gates, especially high-risk settings | Existing operational web patterns are enough for derivative layout decisions after #468, not enough for risky policy flows | Admin/public exposure, auth/security, storage/privacy, provider/secrets, backup/deployment, OpenAPI/generated-client | `feature/admin-web-exposure-shell-463` after #468 | Protected shell/exposure guardrails, then user/invite policy, auth/MFA policy, notification/storage/privacy policy, audit/maintenance/backup | `full`, `openapi-client`, or docs/visual QA by slice |
| Settlement impact policy for bill revision apply | #402, #348, #426 | `needs_manual_gate` for runtime; docs/reference blocker is cleared by UX packet | No by default; yes only for user-facing reopen/adjustment/impact prompts lacking reference | Yes for policy direction; runtime policy still requires money/settlement design decisions per branch | Money/settlement/payment/bill calculation authority, OpenAPI/generated-client if impact categories exposed, schema/migration if persisted | `feature/bill-revision-settlement-impact-policy-402` | Define explicit block/invalidate/reopen/adjustment runtime slice and server-provided impact review shape | `money`, `api`, `openapi-client` if contracts change |
| Mobile UI/design-system epic | #372, #295-#301, #407 | `epic_tracker_only` for #372; child slices vary | No by default; use existing mobile references except critical/risky flows | Yes for normal shared-component and screen-hardening work | Domain manual gates only when UI slice crosses gated runtime/API/security/money/storage scope | `feature/mobile-shared-component-audit-301` | Continue shared component/design-system audit and screen-level visual QA | `mobile-ui` |
| Admin web epic | #376, #377-#379, #463-#468 | `epic_tracker_only` for #376; child slices vary | #468 is the focused admin reference gate | Existing admin product patterns help only after #468 clears shared reference | Admin exposure, auth/security, storage/privacy, provider/secrets, backup/deployment | `feature/admin-web-breakdown-refresh-376` | Keep #376 open as parent; execute #468 and #463-#467 as children | `docs-only`, `full`, or `openapi-client` by child |

## Recommended Implementation Order

1. Finish focused reference/design-system gates first where they block broad UI
   work: #462 for user web, #468 for admin web, and any remaining mobile
   critical-flow references not covered by the UX packet.
2. Run docs/control or architecture split tasks before runtime for tracks that
   cross sensitive boundaries: #406 import/export/backup runtime split, #403
   notification provider/runtime split, #402 settlement-impact runtime policy,
   and admin policy surfaces under #463-#467.
3. Keep auth/security work separate from broad UI polish. MFA/passkey/admin
   policy work should not bundle with unrelated web/admin layout work.
4. Keep storage/privacy/import/export/backup work separate from broad UI and
   separate from deployment/server backup automation.
5. Keep money/settlement/bill revision work separate from search/dashboard,
   mobile design-system, and general web/admin shell work.
6. Separate OpenAPI/generated-client changes from broad UI implementation where
   practical. Contract branches must use reviewed OpenAPI change controls and
   regenerate clients through the repo command only.
7. Execute derivative UI slices after references are clear, with visual QA
   screenshots and report evidence for Material/mobile/web surfaces.

## Newly Created Issues

None. The audit found existing coverage for every required follow-up through
open parent/child issues or recently closed UX/reference gates.

## Issues Intentionally Left Open

- #402 remains open for money/settlement runtime policy and implementation.
- #405 remains open for search/filter and dashboard implementation slices.
- #412 remains open for experience-mode first-launch/settings implementation.
- #394 remains open as the MFA/passkey parent until remaining reference/admin
  policy and close rules are reconciled.
- #400 remains open for friends/direct sharing runtime despite architecture
  children being merged.
- #403 remains open for notification provider/runtime and QA work despite
  architecture/reference progress.
- #406 remains open for import/export/backup runtime implementation planning.
- #407 remains open for mobile screen-by-screen completeness.
- #458-#462 remain open for user web Day 1 surface planning and reference gate.
- #463-#468 remain open for admin web Day 1 surface planning and reference gate.
- #372 and #376 remain open as epic trackers; closing child/reference gates does
  not complete the epics.

## No Longer Blockers Because UX/Reference Packet Covers Them

These should not block future implementation merely for broad product/reference
uncertainty:

- Whether Figma is required for every derivative screen: no.
- Whether Day 1 includes email and push notifications: yes, with provider and
  device-token gates.
- Whether notification preferences need per-event control: yes, under admin
  policy caps.
- Whether sync conflicts preserve local pending changes: yes.
- Whether friends/direct sharing uses exact-match plus invite code/link: yes.
- Whether temporary participants are Day 1: yes, as limited placeholders.
- Whether Strict Vault is Day 1: no; Standard Secure and Recoverable Private
  Vault are Day 1.
- Whether CSV import/export and local backup/restore are Day 1: yes.
- Whether passkey, TOTP MFA, and recovery codes are Day 1: yes.
- Whether accepted bill revisions can silently mutate settlement: no.
- Whether Basic, Guided, Advanced, and Help me decide are Day 1: yes.

Recently closed UX/reference gates such as #417 and #456 should stay closed and
should not be reopened solely for the broad questions now answered by the UX
packet. Future implementation may still create focused child issues if a
specific uncovered screen/state is discovered.

## Future Close And Readiness Rules

- A reference issue may close when the UX packet plus relevant design/domain
  docs cover its product/reference acceptance criteria. That closure does not
  close runtime, API, OpenAPI, generated-client, schema, provider, storage,
  money, security, sync, import/export, backup, web/admin, or QA work.
- Parent epics close only when their child implementation, QA, visual evidence,
  manual gates, and close rules are complete.
- Runtime implementation is `ready_for_codex` only when product scope,
  architecture/manual gates, Figma/reference gates, validation class, allowed
  files, and close rule are explicit.
- Any task touching auth/session/security, storage/privacy/file bytes,
  money/settlement/payment/bill calculation, schema/migrations, OpenAPI,
  generated clients, deployment/CI/Docker/env, provider credentials/secrets, or
  admin/public exposure must state the manual gate before implementation.
- Material UI tasks must include branch-rendered visual QA screenshots or a
  clear `VISUAL_CAPTURE_UNAVAILABLE` stop reason.
- Do not create duplicate issues. Link this plan from future issues or PRs
  instead of creating a new parent when an existing tracker already covers the
  work.
