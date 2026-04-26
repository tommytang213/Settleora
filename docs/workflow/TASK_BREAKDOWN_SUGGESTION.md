# TASK_BREAKDOWN_SUGGESTION.md

## Recommended Delivery Order

1. Foundations
   - repo structure
   - CI
   - coding standards
   - shared contracts
   - config/policy system
   - audit/logging scaffolding
   - branching and release docs

2. Auth / IAM
   - local accounts
   - Keycloak integration
   - roles
   - session management
   - MFA/passkey-ready architecture

3. Core Domain
   - users
   - friends
   - groups
   - expenses
   - bill statuses
   - comments/notes
   - trash model

4. Financial Engines
   - split engine
   - tax/discount/service allocation
   - settlement engine
   - recurring engine
   - rounding configuration

5. File and OCR
   - receipt storage abstraction
   - encrypted file handling
   - OCR workflow
   - aliasing support

6. Mobile App
   - local-only mode
   - server mode
   - sync status
   - OCR entry
   - reconciliation flows

7. Web Portals
   - user portal
   - admin portal
   - dashboard/reporting
   - maintenance UI

8. Sync / Offline
   - local-first cache
   - background sync
   - manual sync
   - conflict handling

9. Notifications
   - in-app
   - email
   - push
   - preferences / quiet hours / digest

10. Reporting / Export
   - dashboard widgets
   - CSV / JSON / PDF export
   - summaries and charts

11. Backup / Maintenance
   - backup UI/scripts
   - retention controls
   - queue/worker monitoring

12. CI/CD and Release Automation
   - branch protections
   - PR validation workflows
   - container publishing
   - staging/prod release flows
   - mobile build/export workflows
   - changelog/version tagging

13. Hardening
   - security review
   - performance review
   - UX review
   - documentation finalization
