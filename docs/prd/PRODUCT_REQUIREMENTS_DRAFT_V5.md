# Settleora - Product Requirements Draft V5

## 1. Product Purpose
Settleora is a self-hosted cross-platform expense management and shared bill tracking application that supports:
- personal expense recording
- future expense prediction
- recurring and non-recurring bill entry
- OCR-based receipt extraction with item-level assignment
- settlement tracking between friends
- reconciliation of incoming and outgoing payments
- privacy-focused data storage with configurable security policies
- iOS and Android app support from day 1
- full-featured user web and admin web portals

## 2. Product Goals
The product must prioritize:
1. convenient bill entry
2. accurate shared-expense handling
3. future visibility and forecasting
4. settlement transparency
5. privacy and security
6. maintainability and safe future extensibility
7. production-grade release and deployment automation

## 3. User Model
### 3.1 Users
Users may only see:
- their own profile data
- expenses they created
- expenses shared with them
- groups they belong to
- relevant settlement and payment records involving them

### 3.2 Friends
- friend requests must be approved
- direct sharing requires approved friend relationship

### 3.3 Groups
- users can create groups
- groups may contain approved friends
- a bill may contain mixed assignment logic at item level

## 4. Roles
### 4.1 Owner
Can manage:
- global settings
- auth integrations
- encryption/storage policy
- system health and logs
- admin assignment
- maintenance and backup policy

### 4.2 Admin
Can manage:
- users and invitations
- categories/tags defaults
- recurring presets
- support/debug screens
- audit log viewing
- maintenance UI

### 4.3 User
Can manage:
- own profile
- friends and groups
- expenses
- receipts
- assignments and splits
- settlement actions
- notification preferences
- privacy/security settings allowed by policy

### 4.4 Configurability
System should support:
- invite-only mode
- public self-registration toggle
- local accounts toggle
- OAuth-only mode if desired
- passkey toggle/policy
- MFA policy
- role flexibility with secure defaults

## 5. Expense Entry Modes
### 5.1 Manual Entry
- default date = current date
- can select past/current/future date

### 5.2 OCR Receipt Entry
- photo capture or upload
- OCR auto-runs when OCR mode selected
- if OCR fails: retry or manual entry
- item-level OCR mandatory
- all OCR results editable before save
- item names, notes, and aliases retained for search/tracking

### 5.3 Recurring Bill Entry
- recurring and non-recurring supported
- recurring UI must be clear and easy to understand

## 6. OCR Workflow
### 6.1 OCR Trigger
OCR runs automatically when OCR mode is selected and image is captured/uploaded.

### 6.2 Failure Handling
If OCR fails:
- prompt retry
- prompt manual entry

### 6.3 OCR Output Targets
OCR should attempt to detect:
- merchant
- date/time
- currency
- item names
- quantity
- unit price
- line totals
- subtotal
- discount
- tax
- service charge
- grand total

### 6.4 OCR Editability
Users can:
- delete/edit lines
- add missing lines
- add notes/translations
- assign items to people/groups
- split items among selected users

### 6.5 OCR Language Strategy
- architecture must support multilingual receipts
- language/model support must be extensible
- broad multilingual support is required as a design goal
- quality may vary by receipt structure/language and must be improvable over time

### 6.6 Local-Only Mode OCR
- local-only mode must also support OCR as a major feature

## 7. Receipt Storage
### 7.1 Server Mode
- server stores encrypted receipt images
- Day 1 privacy mode can be selected by the user where deployment/admin policy allows it
- default privacy mode is Standard Secure Mode
- selected sensitive receipt content may use user-selected Recoverable Private Vault where policy and implementation support it
- shared participants can view image before confirming
- original image retained by default
- thumbnail generated
- no destructive compression of original by default

### 7.2 Local Mode
- local copies stored securely/encrypted where possible
- biometric/PIN protection supported

### 7.3 Retention
- default keep forever
- user/admin configurable retention and deletion policy
- anything deletable should first go to Trash

## 8. Split Logic
### 8.1 Whole-Bill Split
Support:
- equal split
- ratio split
- custom amount split
- manual override split

### 8.2 Item-Level Split
Support:
- single individual
- single group
- equal split among selected users
- ratio split among selected users
- custom amount among selected users
- editable amounts after assignment

### 8.3 Mixed-Mode Bills
A single bill must support mixed assignment/split models across items.

## 9. Discounts, Tax, Service Charge
### 9.1 Item-Level Discount
- can attach directly to specific item

### 9.2 Bill-Level Discount
- default split equally
- user can edit allocation

### 9.3 Allocation Options
Support allocation:
- equal split
- proportional by item subtotal
- manual override

### 9.4 Rounding
- decimal-safe calculations only
- per-currency rounding configurable
- separate incoming/outgoing rounding preference supported
- rounding behavior may include normal / round up / round down

## 10. Acceptance Workflow
### 10.1 Shared Record Effectiveness
Assigned shared expense is not effective on recipient side until accepted.

### 10.2 Bill-Level Status
Support:
- Draft
- Pending Confirmation
- Confirmed
- Rejected
- Finalized

### 10.3 Participant Share Status
Support:
- Pending Acceptance
- Accepted
- Rejected
- Partially Settled
- Settled
- Waived
- Claimed Paid
- Confirmed Paid

### 10.4 Rejection Flow
Rejector must provide/select reason.
Creator can then:
- edit and resubmit
- delete/cancel
- start discussion

## 11. Comments and Notes
Support:
- shared notes
- private notes
- bill-level comments
- item-level comments

Notification preferences apply to comments. Per-thread mute supported.

## 12. Settlement and Reconciliation
### 12.1 Views
Separate:
- Outstanding Incoming
- Outstanding Outgoing
- Cleared Incoming
- Cleared Outgoing

### 12.2 Actions
Support:
- Record Payment
- Confirm Receipt
- Undo / Reopen Settlement
- one-click mark paid
- batch mark paid with filters/confirmation
- partial settlement
- overpayment/underpayment handling by user choice

### 12.3 Payment Data
Allow:
- amount
- date
- note
- optional proof attachment
- optional account/method label (reference only, no integration in MVP)

### 12.4 Proof Visibility
- configurable visibility
- proof upload optional
- confirmation must not depend on proof existing

## 13. Recurring Bills
### 13.1 Recurrence Support
Support broad recurring patterns in MVP, including:
- weekly
- monthly
- yearly
- custom interval
- default no end date
- optional end date

### 13.2 Defaults
- auto-generate real entries by default
- remember preference
- allow profile-level default override

### 13.3 Edit Behavior
When editing recurring template, user should be prompted for scope such as:
- future only
- from effective date
- future generated unpaid/unconfirmed entries where applicable

### 13.4 Shared Recurring Bills
- supported in MVP

## 14. Forecasting and Upcoming Bills
Support:
- due this month
- due next month
- due within 60 days
- custom range/date
- user-selectable filtering

Dashboard should support:
- summary cards
- basic charts
- recurring forecast summary
- friend/group settlement summaries
- user-editable dashboard layout/widgets

## 15. Notifications
### 15.1 Channels
MVP must support selectable:
- in-app
- mobile push
- email

### 15.2 Preferences
Users can choose:
- channel
- event types
- quiet hours
- digest/immediate options

### 15.3 Events
Include:
- friend requests
- group invites
- bill assigned
- share pending
- accepted/rejected
- financially impactful edits
- settlement actions
- payment confirmation
- recurring due reminders
- overdue alerts
- comments

## 16. Edit Reset Rules
Financial-impacting edits reset affected participants to Pending Acceptance and notify them.
Non-financial edits do not require re-approval.

## 17. Currency
- multi-currency supported
- OCR-detected currency if possible
- manual override
- user default currency
- if OCR only sees `$` without reliable context, use user default currency
- support original currency and settlement currency where relevant

## 18. Search, Export, Reporting
### 18.1 Search
Search across:
- merchant
- item name
- notes
- tags
- category
- friend/group
- date range
- currency
- status
- OCR raw text

### 18.2 Export
Support:
- CSV
- JSON
- PDF summary
With filters such as:
- selected records
- date range
- group/friend/category
- privacy-aware export rules

## 19. Authentication and Security
### 19.1 Auth Methods
Support:
- Keycloak OAuth integration
- local accounts
- email and/or username login (admin configurable)
- passkeys
- MFA

### 19.2 Security Defaults
- high-security by default
- strong policy controls
- secure sessions
- audit enabled
- rate limiting
- token expiry with recommended defaults
- admin UI LAN-only by default, configurable

### 19.3 Encryption Model
MVP uses:
- server-side encryption at rest for collaborative/server-side records
- encrypted receipt storage
- two Day 1 user-selectable privacy modes where deployment/admin policy allows them: `standard_secure` and `recoverable_private_vault`
- Standard Secure Mode by default
- Recoverable Private Vault direction for selected sensitive data such as receipt images, payment details, private notes, OCR raw text where stored, statement data when added, and settlement proof files
- deployment/admin policy may disable vault features, allow Standard only, allow Recoverable Private Vault, require Recoverable Private Vault for sensitive data, or reserve future Strict Private Vault for later implementation
- future-compatible Strict Private Vault architecture, without treating it as MVP implementation by default
- not full zero-knowledge for all collaborative content in MVP

Core financial truth remains API/domain-authoritative in MVP. Privacy vault behavior must not make clients authoritative for money, settlement states, authorization, audit, or shared accounting truth.

### 19.4 Local Security
Local mode should support:
- biometric unlock
- app PIN
- encrypted local storage where feasible

### 19.5 Session Management
Users can:
- view sessions/devices
- revoke sessions
- receive new device alerts

## 20. Local Mode and Server Mode
### 20.1 Setup Modes
First launch should offer:
- Connect to Server
- Use Local Mode
Clear warning/explanation required for Local Mode limitations.

### 20.2 Local Mode
Supports:
- personal expenses
- OCR
- recurring bills
- forecasting
- local exports
No friends/groups/server collaboration.

### 20.3 Server Mode
Supports:
- local-first storage
- sync
- collaboration
- user/admin web
- force sync
- offline queue
- cached access during downtime

### 20.4 Migration
Support:
- local to server bulk import
- local to server selective import
- server mode disconnect/export-to-local with warning
- future Recoverable Private Vault to Strict Private Vault migration with key rotation or re-wrapping, recovery-envelope removal/disablement, audit events, trusted-device or recovery-key checks, and older-backup warnings

### 20.5 Sync
- immediate on change
- periodic background sync
- manual force sync
- cron/configurable defaults on server side where applicable

### 20.6 Offline Shared Edits
Allow offline edits as pending local changes, not effective for others until synced.

### 20.7 Conflict Handling
- optimistic locking/versioning
- compare/reload/overwrite flow
- conflict dialogs required

## 21. File Types
Broad support for common mobile/photo/document formats.
Initial practical support target includes:
- JPG/JPEG
- PNG
- HEIC
- WEBP
- PDF
- common office document attachments where permitted (e.g. Word files) for optional proof/supporting attachments
Exact enforcement should remain security-conscious and configurable.

## 22. Deletion and Trash
- anything deletable should first go to Trash
- user-facing delete should generally be soft delete
- drafts may be hard-deletable where safe
- permanent delete should occur from Trash with warning/confirmation
- admin purge path may exist separately

## 23. Aliasing
Support:
- merchant aliasing
- item aliasing

## 24. Backup and Maintenance
### 24.1 Backup
- TrueNAS snapshot-friendly storage layout
- DB backup config UI
- manual backup trigger
- script templates
- retention controls, including keep forever where allowed

### 24.2 Maintenance UI
Expose:
- worker status
- OCR queue
- notification queue
- failed jobs
- storage usage
- DB backup status

## 25. Deployment
- Dockerized
- compatible with TrueNAS SCALE
- persistent volumes
- environment variables documented
- separate user/admin web exposure supported
- subdomains preferred, separate ports also supported

## 26. Non-Functional Requirements
### 26.1 Performance
Expected to feel near-instant on good/okay phone or PC.

### 26.2 Scale
Typical deployment:
- 5 to 50 users
Architecture should remain extensible toward much larger scale.

### 26.3 Maintainability
- clear module boundaries
- script + UI maintenance
- migrations
- health checks
- structured logs

## 27. Extensibility and Change-Safe Design
This section is mandatory so future requirements can be added without compromising security.

### 27.1 Modular Boundaries
Separate major domains:
- Auth/IAM
- Users/Friends/Groups
- Expenses/Bills
- Split Engine
- Settlement Engine
- Recurring Engine
- Forecasting/Reporting
- OCR Pipeline
- Notifications
- Sync Engine
- Storage
- Audit Logging
- Admin/Policy

### 27.2 Centralized Business Rules
All financial calculations and status transition rules must be centralized in shared backend/domain services, not duplicated across clients.

### 27.3 Centralized Authorization
All access control must be enforced server-side through centralized authorization policy.

### 27.4 Policy-Driven Behavior
Configurable behavior should use policy/config systems rather than deep hardcoding whenever security allows.

### 27.5 Feature Flags / Capability Flags
Support feature flags or capability flags for controlled rollout and optional functionality.

### 27.6 Provider Abstractions
Use safe abstractions/interfaces for:
- OCR providers
- storage providers
- notification providers
- auth providers
- export providers

### 27.7 Secure Defaults for Future Features
New features must default to least privilege / safe behavior until explicitly enabled.

### 27.8 Audit Integration Requirement
Any future feature affecting money, permissions, sharing, settlement, or security settings must integrate with audit logging.

### 27.9 Extensible Schema and API
Database and API design must support future additions with minimal breaking changes.

### 27.10 Backward Compatibility
Future changes should preserve compatibility where practical and avoid unnecessary refactors.

## 28. Open Source
- full source in repository
- issue templates
- contribution guide
- GitHub Sponsors placeholders/links
- recommended permissive license: Apache-2.0

## 29. AI-Assisted CI/CD, Branching, and Release Automation
The engineering workflow must behave like a real product team workflow, even when AI is generating code.

### 29.1 Branching Model
Recommended branch model:
- `main` = production-ready branch
- `develop` = integration branch
- `feature/<name>` = feature work
- `fix/<name>` = bug fixes
- `release/<version>` = release stabilization
- `hotfix/<version>` = production fixes

### 29.2 Pull Request Discipline
AI-generated changes should:
- be made in dedicated feature/fix branches
- create small reviewable PRs
- include linked requirement/task references
- include updated tests and docs
- avoid direct pushes to `main`

### 29.3 CI Requirements
Every PR and protected branch push should run:
- formatting/lint checks
- unit tests
- integration tests where practical
- security/dependency scanning
- build validation for relevant components
- container build validation
- migration validation where practical

### 29.4 CD / Release Requirements
The project should support automated or semi-automated pipelines for:
- publishing backend and worker container images
- publishing web artifacts
- creating mobile release artifacts
- packaging release notes/changelogs
- tagging versions
- optionally promoting builds from staging to production

### 29.5 Registry Publication
Release pipeline should be designed to publish:
- official images to GitHub Container Registry
- optionally mirrored images to Docker Hub
- appropriately tagged versions such as `latest`, semantic versions, and commit/build tags

### 29.6 Environment Promotion
Recommended environments:
- local development
- CI test environment
- staging / pre-release
- production

### 29.7 Secrets and Security
Pipelines must:
- avoid storing secrets in source control
- use secret stores / CI secret management
- avoid exposing signing keys or deploy tokens
- separate production secrets from non-production secrets

### 29.8 Mobile Publishing
Pipeline design should allow future automation for:
- iOS build/sign/export workflows
- Android build/sign/export workflows
- TestFlight / App Store release preparation
- Play Store release preparation
Even if final human approval is still required.

### 29.9 AI Workflow Guardrails
AI-assisted coding workflow must:
- respect branching strategy
- avoid direct release without tests
- avoid bypassing review requirements
- create/update release and deployment documentation when relevant
- prefer safe incremental changes over giant unreviewable dumps

### 29.10 Manual Approval Gates
Certain actions should support manual approval gates:
- production deploy
- mobile store release submission
- destructive migrations
- key security setting changes
