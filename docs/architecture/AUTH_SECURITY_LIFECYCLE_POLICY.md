# Auth And Security Lifecycle Policy

Issue: [#721](https://github.com/tommytang213/Settleora/issues/721)

Parent chain: [#716](https://github.com/tommytang213/Settleora/issues/716) →
[#717](https://github.com/tommytang213/Settleora/issues/717) → #721; shared
template: [#960](https://github.com/tommytang213/Settleora/issues/960).

## 1. Decision And Authority

This document defines Day 1 lifecycle wording and retention posture for
server-mode authentication and security records. It applies the
[shared lifecycle taxonomy](../planning/DAY1_LIFECYCLE_POLICY_TEMPLATE.md) to
the current repository at `a93409c306133ef7b9c4d1861f36f69f724b011e` (tree
`956339fed075713be12f3d74c0742eb2cc4414ac`). It is policy and factual
reconciliation only: it does not change runtime behavior, persistence,
contracts, clients, configuration, providers, exposure, or data.

API/domain auth services remain authoritative for server-mode account,
identity, role, credential, factor, challenge, session, policy, and audit
writes. A client label or generated method never proves authorization or an
accepted transition. Local-only mode has no server auth account/session
records: device biometric, app-PIN, and local secure-storage lifecycle belongs
to a separate local-device security owner. Nothing here turns local profile
state into a server identity.

The original #721 wording is stale where it calls passkeys, TOTP/MFA, recovery
codes, and challenges “future” families. The merged
[auth completeness audit](../qa/AUTH_DAY1_COMPLETENESS_AUDIT.md) and current
source prove persisted records and substantial API runtime for each. Older
architecture text is retained as historical design evidence only where it
conflicts with current source. `REC-AUTH-DOC-DRIFT-001` remains the owner for
reconciling those canonical documents and the unresolved immediate one-time
response rules.

## 2. Vocabulary And User-Visible Wording

- **Revoke** means make a grant, credential, factor, session, invitation, or
  lineage unusable. It does not mean erase the row or its evidence.
- **Disable** means block eligibility under a reversible administrative or
  policy condition. It is not automatically revoke and never implies that
  existing sessions were invalidated.
- **Expire** means validity ended at a server-controlled time or policy limit.
  It is not an actor-initiated revocation and is not a purge trigger.
- **Rotate / replace** means create new authority or verifier state and make
  the predecessor unusable. It does not erase predecessor evidence.
- **Unlink** means end an identity-provider relationship. It is not account
  disablement, profile deletion, or historical-reference removal.
- **Retain** means preserve the minimum justified record or safe metadata for
  enforcement, replay detection, investigation, or audit. A stored hash is not
  automatically safe or necessary to retain indefinitely.
- **Reactivate / re-enable** is a new authorized transition after current
  policy, recovery, dependency, and lockout checks. It is not silent restore.
- **Retention-expired** means a retention condition ended. It does not execute
  hard deletion or prove disposal eligibility.
- **Purge / hard delete** is a separate irreversible disposition action. No
  ordinary account-security control should be labelled “Delete” when the
  actual effect is revoke, disable, replace, or unlink.

Approved presentation verbs when a client later exposes the corresponding
currently implemented API actions are
“Sign out”, “Sign out all sessions”, “Revoke session”, “Change password”,
“Reset password”, “Revoke passkey”, “Cancel authenticator setup”, “Revoke
authenticator”, “Generate new recovery codes”, and “Revoke recovery codes”.
“Remove passkey/factor” is acceptable only when adjacent copy says the
credential is revoked and security history may remain. Account administration
must use “Disable account” and “Re-enable account”; identity administration
must use “Unlink identity”; role administration must name the exact role
assignment or removal.

## 3. Secret-Material Boundary

Lifecycle history must never preserve reusable authentication material merely
to prove that an event happened. Documentation, logs, audit, notifications,
metrics, traces, reports, examples, and later metadata/read APIs must never
contain plaintext or reversible passwords; raw access or refresh credentials;
raw password-reset or invitation material; raw recovery codes; submitted OTPs;
TOTP seeds, provisioning URIs, or QR payloads; passkey private material; raw
WebAuthn assertions or reusable challenges; provider tokens/payloads; or
private signing, encryption, pepper, or data-protection keys.

Current persistence uses password verifiers, purpose-bound token/material
hashes, challenge verifiers, recovery-code salted verifiers, protected TOTP
payloads, and passkey public material. Those values remain security-sensitive.
Their existence does not authorize indefinite retention. In particular:

- a revoked password verifier may not be kept merely as lifecycle evidence;
- a revoked/disabled TOTP factor must not retain decryptable reusable secret
  material merely for history;
- terminal reset/invitation hashes and recovery-code verifiers need an explicit
  enforcement or replay-detection purpose and bounded retention decision;
- passkey public keys and credential lookup hashes are not private keys, but
  their terminal retention still needs a bounded policy; and
- access/refresh hashes may be retained only as long as a defined lookup,
  revocation, replay, or investigation purpose requires them.

Immediate successful issuance/display responses are transport boundaries, not
lifecycle evidence. Current source returns access/refresh credentials once,
TOTP setup material during enrollment start, and recovery codes once at batch
generation. Canonical documents conflict over those response rules. This
policy neither expands nor resolves that behavior; `AUTH-LC-CHOICE-012` keeps
the manual security decision open.

## 4. Row Contract And Common Rules

The two matrices in section 5 together form each policy row. These common
values apply to every row unless its cell states otherwise, satisfying the
shared-template fields without repeating unsafe boilerplate:

- **Authority mode/workspace:** server mode, within one self-hosted workspace.
- **Authoritative boundary:** the API/domain auth service named by current
  source; clients and workers cannot accept transitions.
- **Actor/authorization:** current authenticated account for self-service,
  owner/admin or system only where explicitly designed, and public bearer only
  for the bounded invitation/reset attempt. Possession of an ID, link, route,
  or generated method is not authorization.
- **Preconditions:** authoritative current state, account availability, target
  ownership, policy eligibility, fresh step-up where the current factor runtime
  requires it, and a persistence transaction/concurrency guard where the
  transition can race. Unimplemented administration also requires lockout and
  last-owner proof.
- **Ordinary read/mutation effect:** terminal security authority is excluded
  from authentication use. Retained rows may remain available only to an
  authorized bounded security/audit read; ordinary clients must not infer
  authority from cached status.
- **Persisted lifecycle metadata:** stable subject ID, bounded prior/new status,
  applicable created/issued/updated/expiry/consumed/revoked/disabled/replaced
  timestamps, safe actor/reason/correlation fields, and a concurrency/version
  mechanism where a future mutation is added. Absence of one of these fields
  in current source is an implementation gap, not permission to invent it.
- **Idempotency/replay/concurrency:** current endpoint behavior is credited only
  where source/tests prove it. Otherwise the retry result and conflicting
  transition outcome are unresolved and the future mutation is blocked.
  Replaying one-time material never restores usability.
- **Dependency checks:** account state, role/last-owner safety, remaining sign-in
  methods, current and family-linked sessions, factors/recovery, policy version,
  audit, notifications, and backup/export/replica disposition where relevant.
  No current source proves complete backup/export/replica disposition.
- **Hard-delete/purge:** `ineligible` for ordinary user/admin actions.
  `unresolved` for a separate retention cleanup; it requires explicit target
  classification, retention and hold proof, all dependency/copy checks,
  authority, audit, retry/concurrency safety, consequence warning and explicit
  confirmation when user-initiated, plus every destructive/privacy/security
  manual gate. Retention expiry alone is insufficient.
- **Audit:** where applicable, record success and security-relevant denied,
  blocked, expired, replay, and conflict outcomes with actor/account ID when
  safely resolved, subject type/ID, action, bounded prior/new status, reason
  category, UTC timestamp, correlation/request/idempotency metadata, and no
  secret or private payload. The matrices do not claim an event exists unless
  implementation evidence says so.
- **Client presentation:** refresh server state after mutation; show precise
  lost-usability and session impact; preserve generic public failure shapes;
  never claim deletion, restoration, delivery, or notification that the server
  did not prove; expose a blocked/unavailable state rather than deciding policy
  locally.
- **Manual gates:** policy/runtime, schema/migration, OpenAPI/generated clients,
  platform UI/Figma, provider/configuration, public/admin exposure, destructive
  disposal, and privacy gates remain separate. A satisfied docs review does not
  satisfy any implementation gate.
- **Runtime acceptance:** future work needs focused service/endpoint tests,
  transaction and concurrent/replay tests, authorization/lockout tests,
  redaction/no-secret scans, OpenAPI/generated parity when applicable, client
  state tests, and manual hostile/provider/device/exposure evidence where the
  lane requires it. This policy is never runtime proof.

## 5. Lifecycle Transition Matrix

### 5.1 Transition, Authority, And Usability

| Row ID | Record family and user-visible action | Internal transition and actor | Authentication / authorization / session effect | Reversibility, dependency checks, implementation evidence |
| --- | --- | --- | --- | --- |
| `AUTH-LC-SES-001` | Current access session — **Sign out** | Current account requests `active → revoked`; `AuthSessionRuntimeService` executes with `user_sign_out`. | Current access credential stops authenticating; its linked refresh family/credentials and other active sessions in that family are revoked. Other independent families remain usable. Roles are unchanged. | Irreversible for that session; sign in creates new authority. Implemented and idempotent for the post-validation already-revoked race. Evidence: `SignOutEndpoints`, `AuthSessionRuntimeService`, `SessionRevocationEndpointTests`. Owner #338. |
| `AUTH-LC-SES-002` | Selected owned access session — **Revoke session** | Current account requests an owned session `active → revoked`; not-owned/missing/already-terminal targets use a non-disclosing unavailable result. | Target access credential and linked family authority stop working; unrelated session families remain usable. Authorization records are unchanged. | Irreversible for the target; reauthentication creates a new session. Implemented; target ownership and current-session self-revoke are tested. Owner #338/#774. |
| `AUTH-LC-SES-003` | All account sessions — **Sign out all sessions** | Current account requests every eligible active access session `→ revoked`; linked active family/refresh authority is revoked. | All current bearer and refresh continuity for the account stops. Account, identities, password/factors, and roles remain. | Irreversible for existing sessions; later sign-in is possible if another credential and policy allow it. Implemented, including zero-active-session success. Owner #338. |
| `AUTH-LC-SES-004` | Access session — not user-initiated: **Expired** | Server validation observes `ExpiresAtUtc` reached; the row can remain stored even if its status is still `active` until another path materializes status. | Credential cannot authenticate or authorize; expiry does not revoke unrelated sessions or change roles. | Irreversible for that session. Source-defined validity from `Settleora:Auth:Sessions`; no expiry cleanup exists. Owner #338/#1059. |
| `AUTH-LC-REF-001` | Refresh credential — not user-visible: **Rotate** | Valid `active` credential is atomically consumed as `rotated`, linked to a new credential/session in the same active family. | Old refresh material cannot refresh; new access/refresh authority is usable. Rotation does not extend family absolute expiry or change roles. | Irreversible for predecessor; retry with predecessor is replay, not success replay. Implemented with relational transaction/conditional consume tests. Owner #338; future sender constraint #1059. |
| `AUTH-LC-REF-002` | Refresh credential/family — user sees generic **Sign in again** | Reuse of rotated/consumed/revoked material marks linked authority `replayed` or revoked; expiry marks linked authority expired/revoked under current service paths. | Every active access session and refresh credential linked to the identified family becomes unusable; unrelated families remain unless separately revoked. | Irreversible for that family. Implemented for linkable replay/expiry; unknown material stays generic. Owner #338; abuse/notification consumers remain separate. |
| `AUTH-LC-PWD-001` | Local password credential — **Change password** | Current account proves current password; API replaces verifier fields in the same active credential row. This is replacement, not credential revocation. | New password works; old password fails. Reviewed current flow preserves the current session and revokes other session authority according to `CurrentAccountPasswordChangeService`; roles/identity link remain. | Not reversible; user may change again. Implemented API, no complete client surface. Evidence: `AuthCredentialWorkflowService`, `CurrentAccountPasswordChangeService`, `CurrentAccountPasswordChangeEndpointTests`. Owner #339/#774. |
| `AUTH-LC-PWD-002` | Local password/reset material — **Reset password** | A valid pending reset request is consumed; API replaces the active password verifier, revokes other outstanding reset requests, and revokes all active sessions. | New password can sign in; old password and all prior sessions/refresh families stop working. Identity and role assignments remain. | Not reversible; a later reset creates new material. Implemented core, delivery default-disabled. Owner #339/#773. |
| `AUTH-LC-PWD-003` | Local password credential — **Disable credential** / **Revoke credential** | Schema has `active`, `disabled`, `revoked`, but no current endpoint/service performs either lifecycle transition. Disable and revoke must remain distinct. | Verification already refuses disabled/revoked rows. Exact effect on existing sessions, fallback identities/factors, and re-enable is unresolved. | Disabled may be conditionally re-enabled; revoked is terminal for that verifier. Runtime unimplemented and blocked by `AUTH-LC-CHOICE-002`. Owner #788/#339. |
| `AUTH-LC-ACC-001` | Auth account — **Disable account** | Proposed administrative `active → disabled`; schema supports status/`DisabledAtUtc`, but no mutation runtime exists. | Current validation, sign-in, refresh, password-reset completion, passkey, and MFA services reject unavailable accounts. Whether disable must transactionally revoke all sessions/material is unresolved; roles remain assignments but are ineligible while account is disabled. | Conditionally reversible only through explicit re-enable. Requires last-owner and alternate-auth recovery proof. Blocked by `AUTH-LC-CHOICE-001`; owner #788/#785. |
| `AUTH-LC-ACC-002` | Auth account — **Re-enable account** | Proposed authorized `disabled → active` after current policy and recovery checks; no runtime exists. It must not clear audit or silently restore credentials/sessions/factors. | Account eligibility may return, but each identity, credential, factor, role and session must be independently revalidated; old revoked/expired authority stays unusable. | Conditional, not restore. Blocked by `AUTH-LC-CHOICE-001`; owner #788/#785. |
| `AUTH-LC-ID-001` | Provider identity link — **Unlink identity** | Proposed relationship disable/unlink; schema has `DisabledAtUtc` but no unlink runtime. Local and OIDC links must not be conflated. | Stops future resolution through that identity only. It must not disable/delete account/profile, erase historical subject linkage, remove roles, or silently revoke other sign-in methods. Session effect is unresolved. | Re-link is a distinct proofed transition, not restore. Must preserve at least one safe owner/admin sign-in path. Blocked by `AUTH-LC-CHOICE-003`; owner #787/#773/#785. |
| `AUTH-LC-ROL-001` | Product role assignment — **Assign/change/remove [role]** | `SystemRoleAssignment` currently has assignment rows and timestamps but no status/removal metadata or mutation API. Actor must be a separately authorized owner/admin. | Changes authorization eligibility after server revalidation; it is not account disablement and does not itself revoke authentication credentials. Session/claim refresh and last-owner behavior are unresolved. | Assignment removal can be followed by a new assignment, not restoration of the old event. Blocked by `AUTH-LC-CHOICE-004`; owner #785/#464/#465. |
| `AUTH-LC-PKY-001` | Passkey credential — **Revoke passkey** (or **Remove passkey** with explanatory copy) | Current owner, after required fresh step-up, changes retained credential `enrolled → revoked` with actor/reason/correlation metadata. | Credential stops future enrollment lookup/sign-in/step-up use. Current code does not revoke existing sessions or other factors/roles. | Irreversible for that credential; enroll a new passkey. Implemented and idempotent for already revoked. Anti-lockout/session review remains `AUTH-LC-CHOICE-005`. Owner #394/#776; session handoff recommendation remains separate. |
| `AUTH-LC-TOTP-001` | Pending TOTP factor — **Cancel authenticator setup** / start replacement | Cancel or newer enrollment changes pending row `→ revoked`; timeout changes pending row `→ expired`. | Pending factor never authenticates. Existing enrolled factors and sessions are unchanged. | Cancel/replacement/expiry is terminal for that protected secret; restart creates fresh setup material. Implemented. Owner #394/#776. |
| `AUTH-LC-TOTP-002` | Enrolled TOTP factor — **Disable authenticator** | Schema defines `disabled`, but current self-service runtime exposes revoke, not disable or re-enable. | A disabled factor must not authenticate. Exact session, recovery, and policy-compliance effects are unresolved. | Conditional re-enable only if an explicit policy later proves safe. Unimplemented; blocked by `AUTH-LC-CHOICE-005`. Owner #394/#465/#776. |
| `AUTH-LC-TOTP-003` | Enrolled TOTP factor — **Revoke authenticator** | Current owner, after required fresh step-up, changes retained factor `enrolled → revoked`. | Factor stops future TOTP authentication; current code does not revoke existing sessions, challenges, recovery batches, or other factors. | Irreversible for that factor; re-enroll creates new protected material. Implemented, but protected-secret disposition and anti-lockout/session response are unresolved under `AUTH-LC-CHOICE-005`. |
| `AUTH-LC-RCV-001` | Recovery-code batch/verifiers — **Generate new recovery codes** | With fresh step-up and an enrolled factor, old active batch `→ replaced`, unused verifiers `→ replaced`, then a new active batch is generated. | All unused old codes stop working; already consumed evidence remains consumed. Sessions, factors, roles are unchanged. | Irreversible for old batch. Implemented; caller must explicitly request replacement when an active batch exists. Owner #775/#776. |
| `AUTH-LC-RCV-002` | One recovery-code verifier — not a management action: **Used** | Successful bound challenge changes exactly one `unused → consumed` and decrements batch count. | That code can never satisfy another challenge; it does not re-enable/rotate a factor or alter session lifetime. | Irreversible and single-use. Implemented. Owner #775; password-primary MFA binding remains `REC-AUTH-MFA-SIGNIN-001`. |
| `AUTH-LC-RCV-003` | Recovery-code batch — **Revoke recovery codes** | Current owner after fresh step-up changes batch `active → revoked` and all unused verifiers `→ revoked`. | Revoked unused codes stop working. Current code does not revoke sessions or factors. | Irreversible for the batch; generate a new batch if policy permits. Implemented; verifier disposition remains `AUTH-LC-CHOICE-005`. |
| `AUTH-LC-CHL-001` | MFA/passkey challenge — not normally user-visible: **Verified / consumed** | Successful ceremony changes pending challenge to `verified` (MFA) or `consumed` (passkey), binds safe factor/credential context, and records consumption time. | Challenge cannot be used again; only the scoped sign-in/step-up/enrollment outcome may proceed. MFA success never silently extends refresh lifetime. | Irreversible. Implemented for mapped flows; passkey sign-in credential handoff remains unresolved under `REC-AUTH-PASSKEY-SESSION-001`. |
| `AUTH-LC-CHL-002` | MFA/passkey challenge — **Expired**, **blocked**, failed, cancelled, or replay-detected | Server time/attempt/replay/policy state makes pending ceremony unusable. Current services materialize expired/blocked/failure states during verification; the schema also supports cancelled/replay-detected. | No authentication or authorization results from the terminal challenge. Existing sessions/factors remain unless a separately reviewed policy responds to suspicion. | Terminal for that challenge. Partial implementation; cleanup/compaction and session response blocked by `AUTH-LC-CHOICE-006`. |
| `AUTH-LC-RST-001` | Password-reset request — not user-visible: **Replace/reset link** | Issuing newer material changes earlier pending requests `→ revoked`, sets replaced metadata and links to the replacement. | Old reset material cannot reset the password. Account credential/sessions remain until successful completion. | Irreversible for old material. Implemented; raw material only crosses immediate delivery boundary. Owner #339. |
| `AUTH-LC-RST-002` | Password-reset request — **Reset password** | Valid pending request `→ consumed`; see `AUTH-LC-PWD-002` for credential and session effects. | Consumed material is unusable; later reuse becomes suspicious replay with a generic public failure. | Irreversible. Implemented. Owner #339. |
| `AUTH-LC-RST-003` | Password-reset request — **Expired reset link** | Server observes `ExpiresAtUtc` and changes request `pending → expired` during a matched completion attempt. | Material cannot reset a password; account, credential, roles, identities and existing sessions are otherwise unchanged. | Terminal. Implemented lazily; no cleanup runtime. Owner #339. |
| `AUTH-LC-RST-004` | Password-reset request — generic **Link unavailable** | Reuse of consumed/revoked/replaced material changes matched request `→ suspicious_replay`; policy/account failure may revoke outstanding requests. | No credential or session authority is granted. Public response stays generic. | Terminal for the material. Implemented in part; retry/guess limiting and disposition remain unresolved. Owners #339 and `REC-AUTH-ABUSE-001`. |
| `AUTH-LC-INV-001` | Invitation — **Accept invitation** | Valid pending invitation is transactionally changed `→ accepted` after policy, secret, account, and credential checks. | Invitation becomes single-use; accepted account gets only the approved `user` role. The invitation is not a session and does not sign the user in. | Terminal for invitation; rollback logic restores pending only if account-creation persistence fails. Implemented runtime, capability/provider default-off. Owner #784. |
| `AUTH-LC-INV-002` | Pending invitation — **Resend invitation** | Still-pending invitation keeps `pending`; server rotates the stored secret hash before new raw delivery material leaves the boundary. | Prior link stops redeeming; new link may redeem until expiry. No account/session/role changes occur. | Old material is irreversibly replaced. Implemented; delivery state must not claim sent without provider proof. Owner #784. |
| `AUTH-LC-INV-003` | Pending invitation — **Revoke invitation** | Authorized owner/admin changes `pending → revoked`, records actor/time, and sets current cleanup eligibility. | Link stops redeeming immediately. No accepted account, credential, session, identity, or role is removed. | Terminal. Implemented. Owner #784. |
| `AUTH-LC-INV-004` | Pending invitation — **Expired invitation** | Server time changes `pending → expired` lazily/on bounded lifecycle cleanup; public redemption remains generic. | Link cannot redeem; no account/session/role change. | Terminal. Implemented. Owner #784. |
| `AUTH-LC-INV-005` | Terminal invitation — not ordinary UI: **retention cleanup** | Current runtime physically deletes accepted/revoked/expired rows after `CleanupEligibleAtUtc` and writes aggregate cleanup audit. | Deletion does not alter an already accepted account, but removes row-level invitation evidence. | Irreversible current behavior; not endorsed as settled Day 1 purge authority. Blocked for policy acceptance by `AUTH-LC-CHOICE-008`; owner #784/#724. |
| `AUTH-LC-POL-001` | Auth security / invitation policy version — **Change policy** | Security policy supports draft/active/retired rows; invitation policy mutation retires the active row and creates a new active version. | New policy governs later eligibility; it must not silently delete factors, revive revoked authority, or lock out all owners. Current security-policy service is read-focused; invitation policy mutation is implemented. | Old policy is retained/retired, not restored. Security-policy mutation partial; invitation policy implemented. `AUTH-LC-CHOICE-011`; owners #394/#465/#784/#785. |
| `AUTH-LC-AUD-001` | Auth audit events — not user-removable: **Retain security evidence** | Append bounded event evidence; later retention expiry is a condition, not deletion. No current audit purge/read/export runtime exists. | Audit rows never authenticate or authorize. Account/factor/session revocation must not erase their evidence. | Events are immutable evidence; correction is additive. Retention/disposal blocked by `AUTH-LC-CHOICE-009`; owners #721/#724/#774/#973. |

### 5.2 Retention, Audit, Privacy, Follow-Up, And Acceptance

`Operationally required, duration unresolved` means current security behavior
needs some bounded evidence, but no reviewed duration exists. `Source-defined
validity` describes usability only; it is not a retention or disposal period.

| Row ID(s) | Retention classification and trigger | Retained safe evidence / privacy boundary | Current audit evidence and gaps | Open choice, follow-up lane, manual gate, runtime acceptance |
| --- | --- | --- | --- | --- |
| `AUTH-LC-SES-001`–`AUTH-LC-SES-004` | Source-defined session validity; post-expiry/revocation metadata retention is operationally required but duration unresolved. | Session/account IDs, status, issued/expires/last-seen/revoked time, bounded reason/device label; never raw access material, token hash in client/audit, full IP, or unbounded agent. | Session creation/validation/revocation/family events exist; no retention cleanup/readout proof. | `AUTH-LC-CHOICE-010`; #338/#1059, `auth-session-security`; security/privacy/destructive gates. Accept expiry/revoke/family isolation, concurrent revoke, redaction, and retained-copy disposition tests. |
| `AUTH-LC-REF-001`–`AUTH-LC-REF-002` | Source-defined idle/absolute validity; rotated/replayed hash/lineage retention is operationally required for replay detection, duration unresolved. | Family/credential/session IDs, status, lineage, issued/idle/absolute/consumed/revoked times, bounded reason; no raw refresh value or exposed hash. | Rotation, replay, expiry and family-revoke events exist. | `AUTH-LC-CHOICE-010`; #338/#1059. Accept atomic race/retry, linkable/unknown replay, family-only blast radius, and no-secret evidence. |
| `AUTH-LC-PWD-001`–`AUTH-LC-PWD-003` | Active verifier is operational credential material. Superseded verifier is overwritten. Disabled/revoked verifier retention and erasure are unresolved; verifier retention as history is forbidden. | Algorithm/version/parameters, status and timestamps only where needed; never password, verifier, salt/pepper detail, submitted values, or previous verifier in audit. | Create/verify/change/reset audit exists; credential disable/revoke lifecycle events do not. | `AUTH-LC-CHOICE-002`; #339/#788. Manual auth/security and schema/privacy gate. Accept current-password proof, same-password denial, atomic replacement, session effects, disable/re-enable/revoke, and secret-erasure tests. |
| `AUTH-LC-ACC-001`–`AUTH-LC-ACC-002` | Account lifecycle evidence operationally required; duration/disposal unresolved. | Account/profile link, bounded status/time/actor/reason; keep profile lifecycle separate. | Architecture requires disable/re-enable/denied audit; runtime absent. | `AUTH-LC-CHOICE-001`; #788/#785. Owner-lockout manual gate. Accept last-owner concurrency, alternate-auth recovery, session/material response, re-enable revalidation and denial audit. |
| `AUTH-LC-ID-001` | Link/tombstone retention operationally required to prevent unsafe relink/collision and explain access; duration unresolved. | Provider type/name, stable bounded subject or non-reversible reference, disable/unlink metadata; no provider tokens/payloads. | Required by architecture; unlink event/runtime absent. | `AUTH-LC-CHOICE-003`; #787/#773/#785. Provider/security/privacy gate. Accept last-sign-in-method, relink takeover, session impact and redaction cases. |
| `AUTH-LC-ROL-001` | Role history operationally required for authorization/audit; current assignment row lacks removal history. Duration unresolved. | Account ID, exact role, actor, assigned/removed time and reason; no client-supplied authority. | Bootstrap assignment exists; general assign/remove audit absent. | `AUTH-LC-CHOICE-004`; #785/#464/#465. Owner-lockout/API/schema/UI gates. Accept stale-claim/session, self-demotion and concurrent last-owner tests. |
| `AUTH-LC-PKY-001` | Revoked public credential metadata operationally required for collision/replay/security review; duration unresolved. | Server credential ID, credential-ID hash, public key only while justified, counter/backup/transport categories, status/times/reason; no private material, raw assertion, full attestation payload. | Enrollment/assertion/revoke/failure audit exists; no terminal cleanup. | `AUTH-LC-CHOICE-005`; #394/#776 plus `REC-AUTH-PASSKEY-SESSION-001`. Accept last-factor/step-up, post-revoke sign-in, session decision, replay and disposition tests. |
| `AUTH-LC-TOTP-001`–`AUTH-LC-TOTP-003` | Pending setup validity is source-defined. Terminal metadata duration unresolved. Reusable protected secret retention after terminal state is forbidden merely for history. | Factor ID/type/status/times/policy/reason and bounded label; terminal lifecycle evidence must exclude decryptable secret, provisioning URI/key, submitted OTP. | Enrollment/cancel/revoke/failure audit exists; disable/re-enable, terminal secret erasure, and cleanup absent. | `AUTH-LC-CHOICE-005`; #394/#465/#776. Secret-management/schema/security gates. Accept atomic secret erasure/rotation, last-factor/recovery, sessions, retry and audit-redaction. |
| `AUTH-LC-RCV-001`–`AUTH-LC-RCV-003` | Active salted verifiers are operational credential material. Consumed/replaced/revoked metadata retention is required for security review, but verifier retention duration is unresolved and never justified solely by hashing. | Batch/code IDs, counts, status and times, safe challenge/correlation linkage; never raw code, submitted code, verifier/hash/salt in read/audit. | Generation/use/revoke events exist. | `AUTH-LC-CHOICE-005`; #775/#776 and `REC-AUTH-MFA-SIGNIN-001`. Accept display-once/no-redisplay, exact-one consumption, replacement/revoke race, depletion, recovery and verifier disposition. |
| `AUTH-LC-CHL-001`–`AUTH-LC-CHL-002` | Source-defined short validity; terminal challenge retention/cleanup unresolved. | IDs, purpose/factor/status, bounded verifier/hash/context, attempts and terminal times/reason only while needed; no raw reusable challenge or full authenticator payload. | Passkey/MFA success/failure/step-up events exist; expiry/replay coverage is incomplete by flow. | `AUTH-LC-CHOICE-006`; #394, `REC-AUTH-MFA-SIGNIN-001`, `REC-AUTH-ABUSE-001`. Accept account/session/purpose binding, expiry, max attempts, replay, concurrent completion and cleanup. |
| `AUTH-LC-RST-001`–`AUTH-LC-RST-004` | Link validity is source-defined by approved reset delivery options; terminal evidence retention and `CleanupEligibleAtUtc` use are unresolved. | Request/account/credential IDs where safe, purpose/status/hash version, issue/expiry/consume/revoke/replace/replay/check times, safe delivery/bucket/correlation categories; no raw material, exposed hash, identifier, email, provider payload, or new password. | Requested/issued/consumed/denied/replay/revocation/session-revoke audit exists; no cleanup. | `AUTH-LC-CHOICE-007`; #339/#724 plus `REC-AUTH-ABUSE-001`. Accept unknown/matched material, replacement, replay, expiry, account-disabled, concurrent completion, cleanup and redaction. |
| `AUTH-LC-INV-001`–`AUTH-LC-INV-004` | Seven-day validity and 90-day cleanup eligibility are current source values, not generally approved retention policy. | Invitation ID, status, contact kind, masked display, target `user` role, actor/account IDs, lifecycle times, safe delivery/correlation categories; no raw link/secret/hash, full email, body, SMTP/provider payload. | Create/revoke/accept/delivery/cleanup events exist; public failures are bounded. | `AUTH-LC-CHOICE-008`; #784/#724. Accept rotation, single-use, rollback, policy disable/grace, provider truth, concurrency and row-level evidence requirements. |
| `AUTH-LC-INV-005` | Current runtime hard-deletes terminal rows after the 90-day eligibility timestamp. Policy classification is unresolved/manual decision required; retention expiry is not sufficient authority under the shared taxonomy. | Current aggregate audit keeps workflow, counts/status categories and timing bucket, but no row IDs. Whether that is sufficient evidence is unresolved. | `invitation.cleanup_completed` exists; no per-row disposal event or hold/copy proof. | `AUTH-LC-CHOICE-008`; focused #784/#724 auth-runtime and retention-policy follow-up, with destructive/security/privacy gates. Accept holds, dependencies, backups/replicas, dry-run, batch retry/idempotency, per-row/aggregate audit sufficiency and rollback boundaries before continued authorization. |
| `AUTH-LC-POL-001` | Active version is authoritative; retired policy evidence is operationally required, duration unresolved. | Policy ID/version, bounded modes/counts/status/effective/retired times, actor/reason/correlation; no keys/secrets or full unsafe configuration payload. | Invitation policy changes are audited; security policy is primarily read/runtime-default and has no general mutation proof. | `AUTH-LC-CHOICE-011`; #394/#465/#784/#785. Accept version race, safe-default fallback, weakening/last-owner gates, effective-time behavior, and session/factor impact. |
| `AUTH-LC-AUD-001` | Policy-defined/configurable intent, but numeric duration, holds, read/export, retention clock and disposition are unresolved. Audit retention is separate from credential-material retention. | Only minimum actor/subject/action/outcome/time/correlation/request and bounded reason/transition metadata. Never credential material, local identifiers/emails without separate approval, request/response bodies, or provider/private payloads. | Substantial writers/redaction tests exist; complete lifecycle event inventory, authorized reads, export and purge do not. | `AUTH-LC-CHOICE-009`; #721/#724/#774/#973. Privacy/destructive/manual gate. Accept append-only correction, pagination/authz, hold, export redaction, disposal accounting and no-secret scans. |

## 6. Explicit Open Choices

Each choice is blocked until its named owner records a reviewed decision. A
current runtime fact is not approval to broaden or perpetuate unsafe behavior.

| Choice ID | Exact question and affected rows | Why current authority cannot answer | Safe blocked posture, owner/gate, downstream work |
| --- | --- | --- | --- |
| `AUTH-LC-CHOICE-001` | What exactly does account disable/re-enable do to sessions/families, reset/invitation material, identities, password/factors, roles, notifications, and owner recovery? (`ACC-001/002`) | Schema and consumers reject disabled accounts, but no transition service, atomic cascade, re-enable, or last-owner policy exists. | Do not expose mutation. #788/#785; manual owner-lockout/auth policy gate. Blocks server/contract/admin UI and #975 acceptance. |
| `AUTH-LC-CHOICE-002` | When may a password credential be disabled, re-enabled, or revoked, what happens to sessions, and when is verifier material erased? (`PWD-003`) | Verification states exist, but lifecycle runtime and terminal-material retention are absent. | Do not expose mutation; never retain verifier solely as history. #339/#788; auth/security, schema/privacy gates. |
| `AUTH-LC-CHOICE-003` | What proofs and remaining-sign-in-method checks permit unlink/relink, and what session response follows? (`ID-001`) | Only identity lookup plus `DisabledAtUtc` exists; OIDC runtime is absent. | No unlink UI/API. #787/#773/#785; provider, lockout, security, privacy gates. |
| `AUTH-LC-CHOICE-004` | How are product roles assigned/removed with last-owner, self-lockout, concurrency, current-claim/session and audit safety? (`ROL-001`) | Current rows lack mutation/removal lifecycle; bootstrap is not general role administration. | No general role mutation. #785/#464/#465; manual owner-lockout plus API/schema/UI gates. |
| `AUTH-LC-CHOICE-005` | What anti-lockout, session/challenge response and terminal material-erasure rules apply to passkey/TOTP/recovery disable, revoke, replace, and depletion? (`PKY-001`, `TOTP-*`, `RCV-*`) | Current revoke/replace works, but does not prove last-factor recovery or session policy; revoked TOTP protected payloads and terminal recovery verifiers remain stored. | Keep precise current revoke behavior; do not add disable/re-enable/admin reset or claim secret disposition. #394/#775/#776/#465; manual auth/recovery/secret/schema gate. |
| `AUTH-LC-CHOICE-006` | How long is terminal challenge metadata retained, which safe fields remain, and how is cleanup audited? (`CHL-*`) | Validity/attempt limits exist, but no retention clock, hold, cleanup, or copy-disposition rule exists. | Terminal challenges stay unusable; no purge authorization. #394 plus auth-retention follow-up; security/privacy/destructive gate. |
| `AUTH-LC-CHOICE-007` | What bounded retention and disposition applies to terminal reset rows and their hashes, including replay evidence and `CleanupEligibleAtUtc`? (`RST-*`) | Field exists but current reset service neither sets a cleanup time nor deletes/compacts rows. | Retain current rows; do not expose hashes or add cleanup. #339/#724; security/privacy/destructive gate. |
| `AUTH-LC-CHOICE-008` | Should invitation terminal cleanup continue to hard-delete rows after 90 days, or compact/retain different row-level evidence, and what holds/dependencies/copies block it? (`INV-*`) | Current code deletes and writes aggregate audit; shared taxonomy requires explicit authoritative-record retention/dependency/disposal policy and current design does not prove aggregate evidence is sufficient. | Do not broaden or treat current timer as general purge authority. Focused #784/#724 decision and later separate runtime task; manual destructive/security/privacy gate. |
| `AUTH-LC-CHOICE-009` | What audit-event retention clock, duration, holds, authorized read/export and terminal disposition apply? (`AUD-001`) | Architecture says configurable/bounded but defines no value or runtime. | Retain; no ordinary removal or purge. #724/#774/#973; privacy/destructive/manual gate. |
| `AUTH-LC-CHOICE-010` | How long are expired/revoked session, family, and token-hash lineage records retained for replay/investigation, and when may sensitive lookup hashes be compacted? (`SES-*`, `REF-*`) | Validity is defined; post-terminal retention and copy disposition are not. | Keep unusable; no cleanup. #338/#1059/#724; security/privacy/destructive gate. |
| `AUTH-LC-CHOICE-011` | What mutation/version/effective-time/retention rules govern security policy rows, and how do changes safely affect sessions/factors/owners? (`POL-001`) | Persisted shape and read service exist; general security-policy mutation/lifecycle does not. | Use current safe read/default only. #394/#465/#785; manual security/owner-lockout gate. |
| `AUTH-LC-CHOICE-012` | Which immediate responses may contain access/refresh issuance material, TOTP setup material, or recovery-code display-once material, and what no-redisplay proof is required? | Current runtime/contracts return them, while several canonical documents prohibit them in all API responses. Runtime evidence cannot resolve normative policy. | No behavior change here. `REC-AUTH-DOC-DRIFT-001`; manual auth/security policy gate, then separate runtime/contract/client tasks if the decision changes behavior. |

## 7. Retention Posture By Family

| Family | Classification |
| --- | --- |
| Active password, TOTP and recovery verifier material | Operational credential material while active; not lifecycle evidence. Terminal material disposition unresolved; reusable-material retention for history forbidden. |
| Access sessions and refresh families/credentials | Validity source-defined; terminal lineage operationally required for revocation/replay, duration unresolved. |
| Account, identity, and role lifecycle | Operationally required evidence, duration unresolved; no purge authority. |
| Passkey credential metadata/public material | Operationally required for active use and bounded terminal collision/replay review; duration unresolved; passkey private material absent. |
| Challenges/ceremonies | Source-defined transient validity; terminal safe-metadata retention/cleanup unresolved. |
| Password-reset requests | Source-defined validity; terminal evidence and hash disposition unresolved; current cleanup marker unused. |
| Invitations | Seven-day validity and current 90-day terminal hard-cleanup are source-defined implementation facts; continued disposal authority unresolved/manual-gated. |
| Security/invitation policies | Active/retired version evidence operationally required; duration unresolved. |
| Auth audit | Policy-defined/configurable intent; operationally required but duration, holds and disposal unresolved. |

No row equates retention expiry with purge. No row authorizes physical deletion
because a value is hashed, encrypted, disabled, revoked, consumed, expired, or
old.

## 8. Current Evidence And Stale-Source Reconciliation

Current implementation evidence includes:

- session and refresh families:
  `services/api/src/Settleora.Api/Auth/Sessions/AuthSessionRuntimeService.cs`,
  `AuthRefreshSessionRuntimeService.cs`, and their focused tests;
- password credential/change/reset:
  `Auth/Credentials/AuthCredentialWorkflowService.cs`,
  `Auth/PasswordChange/CurrentAccountPasswordChangeService.cs`,
  `Auth/PasswordReset/LocalPasswordResetService.cs`, and focused tests;
- passkey/MFA/recovery/challenges:
  `Auth/Passkeys/PasskeyRuntimeService.cs`, `Auth/Mfa/MfaRuntimeService.cs`,
  `Auth/Policy/AuthSecurityPolicyService.cs`, and
  `AuthMfaPasskeySecurityRegressionTests.cs`;
- invitation lifecycle and current physical cleanup:
  `Auth/Invitations/InvitationManagementService.cs`,
  `InvitationAcceptanceService.cs`, `InvitationLifecycleCleanupService.cs`,
  and focused invitation tests;
- persistence shapes and constraints:
  `Domain/Auth/*.cs`, `Persistence/SettleoraDbContext.cs`, and migrations
  `20260501143101_AddAuthCredentialsSessionsAuditSchemaFoundation`,
  `20260503092157_AddRefreshSessionFamilySchemaFoundation`,
  `20260624143555_AddAuthMfaPasskeySchemaFoundation`,
  `20260706041357_AddAuthPasswordResetRequestsFoundation`,
  `20260708085411_AddAuthInvitationsFoundation`, and
  `20260708105314_AddAuthInvitationPolicyRuntime`;
- canonical routes and generated methods in
  `packages/contracts/openapi/settleora.v1.yaml`,
  `packages/client-web/src/generated/`, and
  `packages/client-dart/lib/generated/`; and
- bounded audit/redaction evidence in credential, session, sign-in, reset,
  invitation, MFA and passkey `Ef*AuditWriter`/audit-writer classes plus
  `PasswordResetAuditRedactionAcceptanceTests.cs` and
  `AuthMfaPasskeySecurityRegressionTests.cs`.

The current code proves records and selected transitions, not production
readiness, public exposure, provider enablement, every stated policy, or
complete audit coverage. In particular, the older
[identity foundation](AUTH_IDENTITY_FOUNDATION.md),
[credential/session design](AUTH_CREDENTIALS_SESSIONS_AUDIT_DESIGN.md),
[MFA/passkey architecture](AUTH_MFA_PASSKEY_ARCHITECTURE.md), passkey/TOTP
contract design documents, and parts of the
[Day 1 PRD](../prd/MVP_DAY1_SCOPE.md) contain stale “future/unimplemented”
statements or conflicting response rules. They must not erase current source
facts or be silently rewritten by #721.

## 9. Follow-Up Recommendations And Duplicate Prevention

Live issue/PR and repository searches at the 2026-09-15 HKT checkpoint found no
existing #721 branch, PR, or merged equivalent. Existing owners are reused:

| Recommendation | Existing owner / canonical lane | Focus and gate |
| --- | --- | --- |
| Account/credential/identity/role lifecycle decisions | #788/#785/#787/#339; `auth-session-security`, later split schema/contract/admin UI lanes | Resolve choices 001–004 with last-owner/recovery safety. Manual auth/owner-lockout gates. |
| Factor/passkey/recovery lifecycle and terminal material | #394/#775/#776/#465; `auth-session-security`, split schema/contract/client lanes | Resolve choice 005 without recreating merged runtime. Manual recovery/secret/security gates. |
| Challenge retention/abuse | `REC-AUTH-MFA-SIGNIN-001` and `REC-AUTH-ABUSE-001`; docs decision then split runtime/config lanes | Resolve binding, expiry/replay/attempt and cleanup choices. Manual security/proxy gates. |
| Passkey sign-in handoff | `REC-AUTH-PASSKEY-SESSION-001`; docs decision then split auth runtime and contract lanes | Keep credential/session handoff with its #965 owner; #721 adds lifecycle wording only. |
| Reset retention | #339/#724; `auth-session-security` plus later retention-policy lane | Define bounded terminal row/hash disposition and cleanup evidence. Manual security/privacy/destructive gates. |
| Invitation retention cleanup | #784/#724; focused docs decision, then separate `auth-session-security` runtime if approved | Reconcile current 90-day hard delete with row-level evidence, holds and shared disposal gates. No automatic implementation issue is created. |
| Session/family tombstone retention | #338/#1059/#724; `auth-session-security` | Define bounded lineage/hash retention and later cleanup. Manual security/privacy/destructive gates. |
| Audit retention/read/export | #724/#774/#973; separate auth runtime, contract, clients and retention lanes | Define clocks/holds/read authorization/redaction/disposal. Manual privacy/destructive gates. |
| Canonical doc/contract drift | `REC-AUTH-DOC-DRIFT-001` and `REC-AUTH-CONTRACT-DRIFT-001` | Preserve #965's separate docs decision and OpenAPI/generated-client tasks; manual security gate where required. |
| Security notifications | #369/#973 | Consume only source-owned events after lifecycle decisions; do not infer events from rows or UI. |

No new GitHub issue is required to complete #721. #717 and #716 remain open;
#961 remains a later synthesis consumer; #975 and #946 remain inactive. This
document does not start #718, #719, #720, #961, or any #965 recommendation.

## 10. Non-Goals And Stop Conditions

This policy does not implement account disable/re-enable, identity unlink,
role mutation, credential/factor material erasure, retention cleanup, purge,
notifications, audit read/export, provider delivery, public/admin exposure,
session handoff, MFA sign-in binding, or any other runtime behavior. It does
not approve schemas/migrations, OpenAPI/generated clients, UI/Figma, secrets,
configuration, deployment, destructive data work, or production operations.

Stop future work when a source conflict is unresolved; an owner/admin could be
locked out; reusable terminal authentication material would be retained merely
for history; a purported orphan is not positively non-authoritative; a purge
lacks retention/hold/dependency/copy proof; or a required security, privacy,
schema, contract, UI, provider, deployment, exposure, or destructive manual
gate is pending.

## 11. Validation And Acceptance Contract

This document must retain exactly 33 unique `AUTH-LC-*` transition rows and 12
unique `AUTH-LC-CHOICE-*` records, all required record families, valid relative
links, exact source/test/symbol existence,
secret-material exclusions, one-path scope, no runtime diff, shared-template
field coverage, strong independent review, local auth/security factual review,
exact-head CI/GitHub review, and zero unresolved actionable threads. Any source
change invalidates earlier candidate-bound validation and both fresh reviews.
