# Settleora Feature Specifications

## Purpose

This directory contains focused functional and technical specifications for major Settleora feature areas.

These specs bridge the gap between product scope documents and implementation branches.

## Spec types

### Functional spec

A functional spec explains how the feature should behave from a product/user perspective.

It should cover:

- user goals
- user flows
- screens or surfaces
- states and statuses
- permissions and visibility
- edge cases
- acceptance criteria
- non-goals

### Technical spec

A technical spec explains how the feature should be implemented safely.

It should cover:

- domain boundaries
- API/OpenAPI impact
- database/migration impact
- authorization rules
- audit requirements
- sync/offline behavior
- storage/privacy behavior
- validation and tests
- failure modes
- non-goals

## Current feature spec areas

```text
auth-session
expenses-bills
receipt-ocr
reconciliation
settlements
sync-offline
payment-integration
```

## Usage rules

- Specs are living documents, not frozen waterfall artifacts.
- Implementation branches should read the relevant specs before coding.
- Specs must not override `PROGRAM_ARCHITECTURE.md`.
- OpenAPI remains the contract source of truth for generated clients.
- Security, money, authorization, audit, and storage rules must stay server-enforced.
- Feature specs should remain scoped and practical.

## Update expectations

When a feature branch changes product behavior, update the relevant functional spec.

When a feature branch changes API, persistence, authorization, audit, sync, or storage design, update the relevant technical spec.
