# Settleora Business Requirements

## Purpose

This document summarizes Settleora's business/product requirements at a level above feature specifications. It complements the PRD, Day 1/Day 2/Day 3 scope documents, and architecture docs.

Settleora is intended to become a privacy-first expense, shared bill, settlement, receipt OCR, recurring bill, forecasting, reconciliation, sync, mobile/web/admin platform.

## Target users

### General public

Users who want a simple app for:

- personal expense tracking
- receipt capture
- recurring bills
- basic forecasting
- local-only privacy
- export/import and backup

### Shared expense users

Users who need to split bills with:

- friends
- couples
- roommates
- households
- colleagues
- trips and events

### Power users and self-hosters

Users who want:

- self-hosted server mode
- local data control
- admin portal
- storage and backup control
- privacy/security settings
- advanced reports and reconciliation

### Future hosted users

Users who want cloud convenience without self-hosting complexity.

Hosted/cloud operation is a future business/deployment direction and must not weaken privacy, security, audit, or data deletion commitments.

## Product goals

Settleora must prioritize:

1. Convenient bill and receipt entry.
2. Accurate shared-expense handling.
3. Clear settlement and payment confirmation flows.
4. Privacy-first data handling.
5. Secure local and server modes.
6. Useful forecasting, reporting, search, import, and export.
7. Maintainable architecture with safe extension points.
8. Production-shaped deployment and upgrade paths.

## Core value proposition

Settleora should solve the full real-life expense loop:

```text
capture -> split -> review -> accept -> settle -> confirm -> reconcile -> report
```

The product should feel simple to normal users while keeping advanced controls available for power users.

## Deployment model

### Day 1

- Local-only mode for general users and private personal finance.
- Self-hosted server mode for power users and collaborative groups.
- No required hosted Settleora cloud dependency.

### Future

- Optional hosted service for non-self-host users.
- Hosted mode requires operational planning for uptime, backups, privacy, account recovery, billing, abuse handling, support, and incident response.

## Business constraints

- Day 1 must not require Settleora-operated cloud infrastructure.
- Self-hosting must remain supported and documented.
- Local mode must remain useful without server setup.
- Public/cloud hosting must not become the only way to use core personal features.
- Provider integrations must be optional and policy-controlled.

## Privacy and trust requirements

- Users must understand whether data is local-only, server-mode, or client-encrypted/private-vault style where supported.
- Payment details, statements, receipts, and provider transactions are sensitive data.
- Raw secrets, tokens, password material, and sensitive provider payloads must not be exposed through logs, generated clients, API responses, or audit metadata.
- Shared users may see only records they are authorized to access.

## Revenue and sustainability directions

Potential future models:

- free local mode
- paid hosted cloud account
- family/group plan
- power-user/pro plan
- hosted storage/OCR limits
- sponsor/supporter tier for open-source development
- optional managed server hosting

Any monetization must preserve self-hosted availability and avoid weakening privacy expectations.

## Success criteria

Settleora is successful if users can:

- record expenses quickly
- scan and review receipts
- split bills accurately
- settle payments transparently
- understand who owes what
- find and export records
- use the app privately in local mode
- collaborate securely in server mode
- trust financial and privacy behavior

## Non-goals

- Becoming a bank.
- Holding user funds as a core product requirement.
- Direct bank API sync in Day 1.
- Replacing accounting software for businesses in Day 1.
- AI or provider events becoming financial authority.
- Cloud hosting as a Day 1 requirement.
