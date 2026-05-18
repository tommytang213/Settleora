# Recurring Bills Technical Spec

## Purpose

Define the first backend-owned recurring bill foundation: guarded recurring bill templates, bounded upcoming forecast reads, and explicit user-confirmed draft bill generation.

## Implemented Surface

- `POST /api/v1/recurring-bills` creates a personal or group recurring bill template for the authenticated actor.
- `GET /api/v1/recurring-bills` lists templates visible to the authenticated actor, with status, group, and date filters.
- `GET /api/v1/recurring-bills/{templateId}` reads one visible template.
- `PATCH /api/v1/recurring-bills/{templateId}` updates safe template fields, schedule, or payload for a non-archived visible template.
- `POST /api/v1/recurring-bills/{templateId}/pause`, `/resume`, and `/archive` transition template state.
- `GET /api/v1/recurring-bills/forecast` returns upcoming forecast occurrences without creating bills.
- `POST /api/v1/recurring-bills/{templateId}/occurrences/{occurrenceDate}/generate-draft` generates or returns the idempotent draft bill for an explicit occurrence.

OpenAPI remains the source of truth for exact request and response schemas.

## Mobile Current State

- `apps/mobile/lib/recurring_bills/` provides a starter authenticated server-mode recurring bill module backed by the generated Dart client.
- The mobile repository reads templates, forecast occurrences, template detail, and explicit draft-generation results with per-operation access-token lookup and bounded failure mapping.
- The mobile UI exposes a shell entry, template list/detail, upcoming forecast list, loading/empty/retry/error states, and explicit online-only draft generation for forecasted occurrences.
- The mobile app does not create/edit recurring templates, run pause/resume/archive lifecycle actions, queue offline recurring-bill work, calculate recurrence or money locally, send reminders, perform background auto-generation, or manage advanced exceptions.

## Persistence

- `recurring_bill_templates` stores owner/creator profile IDs, optional group ID, bounded merchant/name/description text, date-based schedule fields, status, next occurrence date, forecast amount/currency, payload version, and a bounded canonical template payload JSON value.
- `recurring_bill_occurrences` stores template occurrence tracking, due date, status, generated bill linkage, generated actor, and generated timestamps.
- A unique template/occurrence-date constraint supports idempotent draft generation.
- Template payload JSON is configuration only. Generated `expense_bills` rows remain financial truth after draft creation.

## Schedule Rules

- Supported schedule types are `weekly`, `monthly`, `yearly`, and `custom_interval_days`.
- Recurrence is date-based with `DateOnly`; this slice does not introduce time-zone-heavy behavior.
- Schedule validation requires positive intervals, valid start/end ranges, and bounded due offsets.
- Forecast reads and schedule generation enforce hard result limits to avoid unbounded loops.

## Authorization And Privacy

- All recurring bill endpoints require the existing `SettleoraSession` bearer authentication.
- Personal templates are visible and generatable only by the owner/current actor.
- Group templates require active group membership through existing group authorization rules.
- Missing/deleted profiles, cross-user access, unrelated groups, and removed group members fail closed through safe not-found or existing unauthenticated problem responses.
- Responses and audit metadata must not expose raw session tokens, token hashes, auth account IDs, storage paths, or unrelated profile/group data.

## Draft Generation

- Forecast reads never create bills.
- Draft generation requires explicit user action for one template occurrence.
- Generation revalidates current actor access, template status, schedule membership, payload JSON, money/currency, participants, group membership, and payer policy.
- Generated bills use the existing expense bill domain conventions and bill calculation service and start in `draft` status.
- Archived or paused templates cannot generate new drafts.

## Audit

Recurring bill audit events are written for create, update, pause, resume, archive, and draft generation. Metadata is intentionally bounded to IDs, action, actor, subject, status, group mode, occurrence date, generated bill ID, and amount/currency summaries. Raw template payload, full notes, tokens, password material, storage paths, and raw sensitive text are not logged.

## Non-Goals

- Mobile recurring bill creation/editing, full lifecycle/offline queueing, reminders, background auto-generation, and advanced recurrence exception UX.
- Web/admin screens.
- Dashboard widgets or dashboard preference storage.
- Background worker auto-generation, cron, or scheduled runtime.
- Reminder or notification delivery.
- Advanced recurrence exceptions or skip-one occurrence UX.
- FX-aware forecasting, statement reconciliation, imports, or reporting.
- Direct mutation of historical bills when a template changes.
