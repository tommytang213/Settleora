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
- **Actor/authorization:** current authenticated account for self-service and
  owner/admin or system only where explicitly designed. Anonymous protocol
  callers are separately bounded: refresh presents a refresh credential;
  invitation/reset presents its purpose-bound material; passkey sign-in and MFA
  challenge completion present a server-issued bounded challenge plus the
  required authenticator proof. Those proofs authorize only their exact
  protocol transition; they are not a current-account actor, and the server
  must enforce the persisted account/session/purpose/credential/factor binding.
  Possession of an ID, route, or generated method is not authorization.
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
| `AUTH-LC-SES-003` | Account sessions — **Sign out all sessions** | Current account requests each unexpired active access session selected by `RevokeActiveSessionsForAccountAsync` `→ revoked`; the service revokes refresh families discovered through credentials linked to those selected sessions. | Selected bearer sessions and discovered family continuity stop. A valid refresh credential whose only linked access session is already expired is not discovered by this query and can remain usable; account, identities, password/factors, and roles remain. | Irreversible for selected sessions; later sign-in is possible. Implemented but cascade completeness is partial under `AUTH-LC-CHOICE-013`; owner #338. |
| `AUTH-LC-SES-004` | Access session — not user-initiated: **Expired** | Server validation observes `ExpiresAtUtc` reached; the row can remain stored even if its status is still `active` until another path materializes status. | Credential cannot authenticate or authorize; expiry does not revoke unrelated sessions or change roles. | Irreversible for that session. Source-defined validity from `Settleora:Auth:Sessions`; no expiry cleanup exists. Owner #338/#1059. |
| `AUTH-LC-REF-001` | Refresh credential — not user-visible: **Rotate** | Valid `active` credential is consumed as `rotated`, linked to a new credential/session in the same active family; the relational branch uses a status-qualified update inside a transaction. | Old refresh material cannot refresh; new access/refresh authority is usable. Rotation does not extend family absolute expiry or change roles. | Irreversible for predecessor; retry with predecessor is replay, not success replay. Implementation contains the relational guard, but focused tests use EF in-memory and do not prove the relational transaction/race branch. Owner #338; future sender constraint #1059. |
| `AUTH-LC-REF-002` | Refresh credential/family — user sees generic **Sign in again** after detected reuse | Reuse of rotated/consumed/revoked material marks linkable family authority `replayed` and revokes family-linked active sessions/credentials. Unknown material stays generic without a resolved subject. | Every active access session and refresh credential linked to the identified family becomes unusable; unrelated families remain unless separately revoked. | Irreversible for that family. Implemented for linkable replay; abuse/notification consumers remain separate. Owner #338. |
| `AUTH-LC-REF-003` | Refresh credential/family — user sees generic **Sign in again** after expiry | Server time observes credential idle/absolute expiry or family absolute expiry and materializes expired family/credential plus revoked family-linked access authority under the matched path. | Identified family continuity stops; unrelated families and role assignments remain. | Irreversible for that family. Implemented; no cleanup/retention period follows from expiry. Owner #338/#1059. |
| `AUTH-LC-PWD-001` | Local password credential — **Change password** | Current account proves current password; API replaces verifier fields in the same active credential row. This is replacement, not credential revocation. | New password works; old password fails. Current flow preserves the current session and invokes account-session revocation excluding it. Only selected unexpired sessions and families discovered through them are candidates; moreover, if the excluded current session shares a discovered family with another selected session, that whole family is removed from the revocation candidates and its active refresh credential can remain usable. The limitations in `AUTH-LC-CHOICE-013` apply. Roles/identity link remain. | Not reversible; user may change again. Implemented API, incomplete cascade/client surface. Evidence: `AuthCredentialWorkflowService`, `CurrentAccountPasswordChangeService`, `CurrentAccountPasswordChangeEndpointTests`. Owner #339/#338/#774. |
| `AUTH-LC-PWD-002` | Local password/reset material — **Reset password** | A valid pending reset request is consumed; API replaces the active password verifier, revokes other outstanding reset requests, and invokes account-session revocation without excluding a session. | New password works and old password fails. Selected unexpired access sessions and refresh families discovered through them stop; refresh authority linked only through an already-expired access session can remain usable under `AUTH-LC-CHOICE-013`. Identity and role assignments remain. | Not reversible; a later reset creates new material. Implemented core with incomplete cascade; delivery default-disabled. Owner #339/#338/#773. |
| `AUTH-LC-PWD-003` | Local password credential — **Disable credential** | Proposed reversible administrative `active → disabled`; schema supports the target, but no current endpoint/service performs it. | Verification refuses disabled credentials. Existing-session, alternate-method, and reset effects are unresolved. | Conditionally re-enableable only after recovery/lockout policy; unimplemented and blocked by `AUTH-LC-CHOICE-002`. Owner #788/#339. |
| `AUTH-LC-PWD-004` | Local password credential — **Revoke credential** | Proposed terminal `active/disabled → revoked`; schema supports the target, but no current endpoint/service performs it. | Verifier stops future password sign-in; exact existing-session and fallback effects are unresolved. | Irreversible for that verifier; replacement requires a distinct proofed workflow. Blocked by `AUTH-LC-CHOICE-002`. Owner #788/#339. |
| `AUTH-LC-ACC-001` | Auth account — **Disable account** | Proposed administrative `active → disabled`; schema supports status/`DisabledAtUtc`, but no mutation runtime exists. | Session validation, primary sign-in/refresh, reset completion, and mapped passkey paths reject unavailable accounts, but anonymous TOTP/recovery challenge verification does not reload account availability after challenge issuance. Whether disable must transactionally revoke sessions/material and invalidate outstanding challenges is unresolved; roles remain assignments but are ineligible while account is disabled. | Conditionally reversible only through explicit re-enable. Requires last-owner and alternate-auth recovery proof. Blocked by `AUTH-LC-CHOICE-001`; owner #788/#785. |
| `AUTH-LC-ACC-002` | Auth account — **Re-enable account** | Proposed authorized `disabled → active` after current policy and recovery checks; no runtime exists. It must not clear audit or silently restore credentials/sessions/factors. | Account eligibility may return, but each identity, credential, factor, role and session must be independently revalidated; old revoked/expired authority stays unusable. | Conditional, not restore. Blocked by `AUTH-LC-CHOICE-001`; owner #788/#785. |
| `AUTH-LC-ID-001` | Provider identity link — **Unlink identity** | Proposed relationship disable/unlink; schema has `DisabledAtUtc` but no unlink runtime. Local and OIDC links must not be conflated. | Stops future resolution through that identity only. It must not disable/delete account/profile, erase historical subject linkage, remove roles, or silently revoke other sign-in methods. Session effect is unresolved. | Re-link is a distinct proofed transition, not restore. Must preserve at least one safe owner/admin sign-in path. Blocked by `AUTH-LC-CHOICE-003`; owner #787/#773/#785. |
| `AUTH-LC-ROL-001` | Product role assignment — **Assign [role]** | Proposed authorized insertion of an exact assignment. Current bootstrap/invitation paths insert bounded roles, but no general mutation API exists. | May grant future authorization after server revalidation; it does not create authentication authority. | A later removal is a distinct event. General runtime blocked by `AUTH-LC-CHOICE-004`; owner #785/#464/#465. |
| `AUTH-LC-ROL-002` | Product role assignment — **Change [old role] to [new role]** | Proposed atomic remove-and-assign or replacement semantics; current source defines neither the transition nor history shape. | Future authorization changes; current-claim/session refresh and last-owner effects are unresolved. | Not a silent restore; blocked by `AUTH-LC-CHOICE-004`. Owner #785/#464/#465. |
| `AUTH-LC-ROL-003` | Product role assignment — **Remove [role]** | Proposed authorized removal/logical terminal transition; current row has no removal metadata and no mutation API. | Future role eligibility stops after authoritative revalidation; authentication credentials do not thereby become revoked. | New assignment later is a new event. Last-owner/self-lockout and session behavior block implementation under `AUTH-LC-CHOICE-004`. |
| `AUTH-LC-PKY-001` | Passkey credential — **Revoke passkey** (or **Remove passkey** with explanatory copy) | Current owner passes the active policy/actor-dependent step-up check and, when that check requires it, supplies fresh proof; service changes retained credential `enrolled → revoked` with actor/reason/correlation metadata. | Credential stops future enrollment lookup/sign-in/step-up use. Current code does not revoke existing sessions or other factors/roles. | Irreversible for that credential; enroll a new passkey. Implemented and idempotent for already revoked. Anti-lockout/session review remains `AUTH-LC-CHOICE-005`. Owner #394/#776; session handoff recommendation remains separate. |
| `AUTH-LC-PKY-002` | Passkey credential — **Disable passkey** | Proposed `enrolled → disabled`; schema supports the status, but current self-service runtime exposes revoke only. | Disabled credential must be excluded from authentication; session and remaining-factor effects are unresolved. | Conditional re-entry only by a separately approved transition. Unimplemented; `AUTH-LC-CHOICE-005`. Owner #394/#776. |
| `AUTH-LC-PKY-003` | Passkey credential — **Re-enable passkey** | Proposed `disabled → enrolled` after current account, policy, ownership, compromise, and recovery checks; no runtime exists. | May restore future credential use but never revives expired/revoked sessions or challenges. | Conditional, not restore of earlier authority. Unimplemented; `AUTH-LC-CHOICE-005`. Owner #394/#776. |
| `AUTH-LC-PKY-004` | Owned non-revoked passkey record — generic **Revoke passkey** endpoint | Current revoke accepts `pending`, `enrolled`, or `disabled` and changes it `→ revoked` after the policy/actor-dependent step-up check. | Target record stops future use; existing sessions, other credentials/factors, and roles remain. | Irreversible for that row. Implemented broad source-state behavior; whether the endpoint should be narrowed and its concurrent outcome are unresolved in `AUTH-LC-CHOICE-005`. Owner #394/#776. |
| `AUTH-LC-TOTP-001` | Pending TOTP factor — **Cancel authenticator setup** | Current owner cancels `pending → revoked`. | Pending factor never authenticates; existing enrolled factors/sessions remain. | Terminal for that setup. Implemented; terminal secret disposition remains `AUTH-LC-CHOICE-005`. Owner #394/#776. |
| `AUTH-LC-TOTP-002` | Pending TOTP factor — start replacement setup | Starting a new enrollment sequentially marks observed earlier pending rows `→ revoked`, then creates fresh pending material. | Observed earlier setup material stops working; enrolled factors/sessions remain. Concurrent starts can each observe no current pending row and create multiple pending factors. | Irreversible replacement of observed pending material; concurrency is partial under `AUTH-LC-CHOICE-005`. Owner #394/#776. |
| `AUTH-LC-TOTP-003` | Pending TOTP factor — **Setup expired** | Server verification observes the deadline, changes `pending → expired`, and saves through `TrySaveAsync`. | Expired setup cannot enroll/authenticate; other authority remains. | Terminal for that setup. Persistence is source-proven; no focused expiry or concurrency test was found. `AUTH-LC-CHOICE-005`; owner #394/#776. |
| `AUTH-LC-TOTP-004` | Enrolled TOTP factor — **Disable authenticator** | Proposed `enrolled → disabled`; schema supports the status, but current self-service runtime exposes revoke only. | Disabled factor must not authenticate. Exact session, recovery, and policy-compliance effects are unresolved. | Conditional re-entry only after approved checks. Unimplemented; `AUTH-LC-CHOICE-005`. Owner #394/#465/#776. |
| `AUTH-LC-TOTP-005` | Disabled TOTP factor — **Re-enable authenticator** | Proposed `disabled → enrolled`; no runtime exists. | May restore future TOTP use; must not revive sessions/challenges or bypass current policy. | Conditional, not silent restore. Unimplemented; `AUTH-LC-CHOICE-005`. Owner #394/#465/#776. |
| `AUTH-LC-TOTP-006` | Enrolled TOTP factor — **Revoke authenticator** | Current owner passes the policy/actor-dependent step-up check and, when required, supplies fresh proof; service changes retained factor `enrolled → revoked`. | Factor stops future TOTP authentication; current code does not revoke existing sessions, challenges, recovery batches, or other factors. | Irreversible for that factor; re-enroll creates new protected material. Implemented, but protected-secret disposition and anti-lockout/session response are unresolved under `AUTH-LC-CHOICE-005`. |
| `AUTH-LC-TOTP-007` | Owned non-revoked TOTP factor — generic **Revoke authenticator** endpoint | Current generic factor revoke accepts `pending`, `enrolled`, `disabled`, or `expired` and changes it `→ revoked` after the policy/actor-dependent step-up check; this overlaps pending cancellation with a different audit reason. | Target factor/setup stops any future use; sessions, challenges, recovery batches, and other factors remain. | Irreversible for that row. Implemented broad source-state behavior; whether the endpoint should be narrowed is unresolved in `AUTH-LC-CHOICE-005`. Owner #394/#776. |
| `AUTH-LC-RCV-001` | Recovery-code batch/verifiers — **Generate new recovery codes** | With an enrolled factor and the policy/actor-dependent step-up result satisfied, old active batch `→ replaced`, unused verifiers `→ replaced`, then a new active batch is generated. | All unused old codes stop working; already consumed evidence remains consumed. Sessions, factors, roles are unchanged. | Irreversible for old batch. Implemented sequentially; caller must request replacement when an active batch exists, but concurrent generation is not guarded. Owner #775/#776. |
| `AUTH-LC-RCV-002` | One recovery-code verifier — not a management action: **Used** | Successful bound challenge changes exactly one `unused → consumed` and decrements batch count. | That code can never satisfy another challenge; it does not re-enable/rotate a factor or alter session lifetime. | Irreversible and single-use. Implemented. Owner #775; password-primary MFA binding remains `REC-AUTH-MFA-SIGNIN-001`. |
| `AUTH-LC-RCV-003` | Recovery-code batch — **Revoke recovery codes** | Current owner passes the policy/actor-dependent step-up result and changes batch `active → revoked` plus all unused verifiers `→ revoked`. | Revoked unused codes stop working. Current code does not revoke sessions or factors. | Irreversible for the batch; generate a new batch if policy permits. Implemented; verifier disposition remains `AUTH-LC-CHOICE-005`. |
| `AUTH-LC-RCV-004` | Recovery-code batch/verifier — **Expired** | Schema defines expiry states but current management runtime does not materialize a batch/code expiry transition. | Expired material must not authenticate; exact trigger and factor/session effects are unresolved. | Terminal for affected material. Unimplemented; `AUTH-LC-CHOICE-005`. Owner #775/#776. |
| `AUTH-LC-RCV-005` | Owned replaced, expired, or already-revoked recovery batch — generic **Revoke recovery codes** endpoint | Current service accepts any owned batch, unconditionally writes `→ revoked`, refreshes revoke/update/reason fields, revokes unused verifiers, and appends another audit event. | Any unused verifier is unusable; existing sessions/factors remain. | No state restoration, but repeated revoke is not state/audit idempotent. Implemented broad source-state behavior; desired guard is unresolved in `AUTH-LC-CHOICE-005`. Owner #775/#776. |
| `AUTH-LC-CHL-001` | MFA challenge — not user-visible: **Verified** | Successful bounded MFA ceremony changes `pending → verified` and records consumption time. | Only the scoped outcome may proceed; success never silently extends refresh lifetime. | Irreversible. Implemented for mapped MFA flows; password-primary binding remains `REC-AUTH-MFA-SIGNIN-001`. |
| `AUTH-LC-CHL-002` | Passkey challenge — not user-visible: **Consumed** | Successful passkey ceremony changes `pending → consumed`. For sign-in, policy support is checked when options are created but is not revalidated at completion. | Challenge cannot be reused after a successful commit; only its scoped enrollment/sign-in/step-up result may proceed. A policy change after sign-in options are issued does not currently prevent completion/session creation. | Irreversible. Sequential ceremony behavior is implemented; completion concurrency and policy/session handoff remain partial under `REC-AUTH-PASSKEY-SESSION-001`. |
| `AUTH-LC-CHL-003` | MFA/passkey challenge — **Expired** | Server time blocks verification after `ExpiresAtUtc`; preparation helpers set tracked `pending → expired`, but the verification callers return without saving that change, so the persisted row can remain `pending`. | No auth result; existing sessions/factors remain. | Terminal by validity clock, but durable status materialization is partial/unproven. Retention/status reconciliation is `AUTH-LC-CHOICE-006`. |
| `AUTH-LC-CHL-004` | MFA/passkey challenge — **Blocked** | Attempt/policy checks change a pending challenge `→ blocked`. | No auth result; any broader session response requires separate policy. | Terminal. Implemented for mapped attempt-limit paths; `AUTH-LC-CHOICE-006`. |
| `AUTH-LC-CHL-005` | MFA/passkey challenge — **Failed** | Schema supports `failed`; current mapped services generally increment attempts and may block rather than consistently materialize this status. | No auth result. | Terminal when used; partial/unresolved by flow under `AUTH-LC-CHOICE-006`. |
| `AUTH-LC-CHL-006` | MFA/passkey challenge — **Cancelled** | Schema supports `cancelled`; no complete current cancellation transition was found. | No auth result; other authority remains. | Terminal; unimplemented and blocked by `AUTH-LC-CHOICE-006`. |
| `AUTH-LC-CHL-007` | MFA/passkey challenge — **Replay detected** | Schema supports `replay_detected`; current challenge services reject terminal reuse but do not consistently materialize this status. | No auth result; suspicion-driven family/session response is unresolved. | Terminal; partial/unresolved under `AUTH-LC-CHOICE-006`. |
| `AUTH-LC-RST-001` | Password-reset request — not user-visible: **Replace/reset link** | Sequential issuance of newer material changes the pending requests it observed `→ revoked`, sets replaced metadata and links them to the replacement. Concurrent issuances can each miss the other's insertion and leave multiple pending requests. | Observed old reset material cannot reset the password; concurrent newly issued links can both remain usable. Account credential/sessions remain until successful completion. | Irreversible for replaced material. Implemented sequentially; issuance concurrency is partial under `AUTH-LC-CHOICE-007`. Raw material only crosses the immediate delivery boundary. Owner #339. |
| `AUTH-LC-RST-002` | Password-reset request — **Reset password** | Valid pending request `→ consumed`; see `AUTH-LC-PWD-002` for credential and session effects. | Consumed material is unusable; later reuse becomes suspicious replay with a generic public failure. | Irreversible. Implemented. Owner #339. |
| `AUTH-LC-RST-003` | Password-reset request — **Expired reset link** | Server observes `ExpiresAtUtc` and changes request `pending → expired` during a matched completion attempt. | Material cannot reset a password; account, credential, roles, identities and existing sessions are otherwise unchanged. | Terminal. Implemented lazily; no cleanup runtime. Owner #339. |
| `AUTH-LC-RST-004` | Password-reset request — generic **Link unavailable** | Reuse of consumed/revoked/replaced material changes matched request `→ suspicious_replay`. By contrast, account, identity, credential, or policy denial updates only check/update timestamps and audit; a still-pending request is not revoked. | No credential or session authority is granted for that attempt. Public response stays generic. Dependency-denied pending material can become usable again if the dependency recovers before expiry. | Terminal only for material changed to suspicious replay; dependency denial is non-terminal. Implemented in part; retry/guess limiting and disposition remain unresolved. Owners #339 and `REC-AUTH-ABUSE-001`. |
| `AUTH-LC-RST-005` | Pending password-reset requests — not user-visible: **Revoke outstanding reset links** | Successful reset completion changes other observed pending requests `→ revoked`; sequential newer issuance uses the distinct replacement transition in `AUTH-LC-RST-001`. Account/policy denial does not revoke them. | Revoked material cannot reset a password; it does not itself replace the credential. | Terminal for each revoked request. Implemented on successful completion; concurrency, trigger completeness, and retention remain `AUTH-LC-CHOICE-007`. Owner #339. |
| `AUTH-LC-INV-001` | Invitation — **Accept invitation** | Valid pending invitation is transactionally changed `→ accepted` after policy, secret, account, and credential checks. The acceptance service requires capability `enabled`; it ignores `PendingInviteGraceWhenDisabled`, even though the policy readout can report public acceptance enabled from that grace flag. | Invitation becomes single-use; accepted account gets only the approved `user` role. The invitation is not a session and does not sign the user in. A disabled capability currently rejects existing pending invitations despite the grace readout. | Terminal for invitation; rollback logic restores pending only if account-creation persistence fails. Implemented runtime but grace enforcement is inconsistent/partial; capability/provider default-off. Owner #784. |
| `AUTH-LC-INV-002` | Pending invitation — **Resend invitation** with ready requested delivery | When delivery is requested, readiness passes, and composition succeeds, the invitation remains `pending`; server commits a rotated secret hash before handing new raw material to delivery. | Prior link stops redeeming; only the newly generated material can redeem until expiry, even if its send later fails or is ambiguous. No account/session/role changes occur. | Old material is irreversibly replaced. Implemented sequentially and non-idempotent; send outcome remains separately truthful. Owner #784. |
| `AUTH-LC-INV-003` | Pending invitation — **Revoke invitation** | Authorized owner/admin changes `pending → revoked`, records actor/time, and sets current cleanup eligibility. | Link stops redeeming immediately. No accepted account, credential, session, identity, or role is removed. | Terminal. Implemented. Owner #784. |
| `AUTH-LC-INV-004` | Pending invitation — **Expired invitation** | Server time changes `pending → expired` lazily/on bounded lifecycle cleanup; public redemption remains generic. | Link cannot redeem; no account/session/role change. | Terminal. Implemented. Owner #784. |
| `AUTH-LC-INV-005` | Terminal invitation — not ordinary UI: **retention cleanup** | Current runtime physically deletes up to 50 accepted/revoked/expired rows after `CleanupEligibleAtUtc` and writes aggregate cleanup audit. Any well-formed anonymous invitation-acceptance request invokes this global cleanup before abuse, policy, or submitted-secret validation, including an invalid-secret request. | Deletion does not alter an already accepted account, but removes row-level invitation evidence. The trigger is public/protocol-driven even though cleanup is not presented as a user action. | Irreversible current behavior; not endorsed as settled Day 1 purge authority. Trigger authorization, holds/copies, and evidence sufficiency are blocked by `AUTH-LC-CHOICE-008`; owner #784/#724. |
| `AUTH-LC-INV-006` | Pending invitation — **Resend invitation** without ready requested delivery | When delivery is not requested, readiness fails, or composition is unavailable, the invitation stays `pending`, `UpdatedAtUtc` changes, delivery state is recorded, and the existing secret hash is not rotated. | Existing link remains redeemable until its original expiry; no new material is emitted and no account/session/role change occurs. | No credential lifecycle replacement occurs. Implemented and tested; client must show the returned non-sent delivery state and must not claim the old link was revoked. Owner #784. |
| `AUTH-LC-POL-001` | General auth security policy — **Change security policy** | Schema supports draft/active/retired versions, but current `AuthSecurityPolicyService` is read/default focused and no general mutation API exists. | A future active version governs later eligibility; it must not silently delete factors, revive authority, or lock out owners. | Unimplemented; old versions must be retired/retained, not silently overwritten. `AUTH-LC-CHOICE-011`; owners #394/#465/#785. |
| `AUTH-LC-POL-002` | Invitation policy — **Change invitation policy** | Authorized mutation retires the current active row and creates a new active version. | New invitation creation uses the active capability. The readout treats disabled-plus-grace as publicly acceptable, but acceptance requires capability `enabled` and does not enforce that grace flag; existing accounts/sessions are unchanged. | Implemented version replacement; old policy remains retired. Grace semantics are partial under `AUTH-LC-CHOICE-008/011`; owner #784/#785. |
| `AUTH-LC-AUD-001` | Auth audit events — not user-removable: **Retain security evidence** | Append bounded event evidence; later retention expiry is a condition, not deletion. No current audit purge/read/export runtime exists. | Audit rows never authenticate or authorize. Account/factor/session revocation must not erase their evidence. | Events are immutable evidence; correction is additive. Retention/disposal blocked by `AUTH-LC-CHOICE-009`; owners #721/#724/#774/#973. |

### 5.2 Per-Row Template Completion

The following evidence keys keep citations concise without conflating policy
authority with implementation. Each mapped key is part of that exact row; the
text before **Implementation** is decision authority, while the source/test
list after it is evidence only:

- `E-SESSION`: the shared template plus
  [credential/session design](AUTH_CREDENTIALS_SESSIONS_AUDIT_DESIGN.md).
  **Implementation:** `AuthSessionRuntimeService`,
  `AuthRefreshSessionRuntimeService`, and session,
  refresh-rotation, password-change, and password-reset endpoint tests.
- `E-IDENTITY`: the shared template plus
  [identity foundation](AUTH_IDENTITY_FOUNDATION.md).
  **Implementation:** `AuthAccount`, `AuthIdentity`, `SystemRoleAssignment`, current account/identity
  resolution, bootstrap/invitation source, and authorization tests.
- `E-FACTOR`: the shared template,
  [MFA/passkey architecture](AUTH_MFA_PASSKEY_ARCHITECTURE.md), and
  [MFA/passkey policy audit](AUTH_MFA_PASSKEY_POLICY_AUDIT.md),
  with unresolved choices in this policy controlling conflicts.
  **Implementation:** `PasskeyRuntimeService`, `MfaRuntimeService`,
  `AuthSecurityPolicyService`, and
  `AuthMfaPasskeySecurityRegressionTests`.
- `E-RESET`: the shared template and password-reset sections in
  [identity foundation](AUTH_IDENTITY_FOUNDATION.md) and
  [credential/session design](AUTH_CREDENTIALS_SESSIONS_AUDIT_DESIGN.md).
  **Implementation:**
  `LocalPasswordResetService`, its audit writers, and reset/redaction tests.
- `E-INVITE`: the shared template and
  [invitation policy audit](AUTH_INVITATION_POLICY_AUDIT_READINESS.md).
  **Implementation:**
  invitation management/acceptance/policy/cleanup services and focused tests.
- `E-AUDIT`: the shared template, the
  [Day 1 scope](../prd/MVP_DAY1_SCOPE.md), and `AUTH-LC-CHOICE-009`.
  **Implementation:** current audit model/writers and redaction tests.

Notation in this table is normative: `HD` is hard-delete eligibility and `P`
is purge/disposal eligibility. `HD=no; P=unresolved` means the lifecycle action
cannot delete the authoritative row and a later separate disposition remains
blocked. `retry=current` credits only the result described in section 5.1 and
current tests; otherwise retry and concurrent conflict are explicitly
`unresolved`. All retained evidence uses section 3's redaction boundary and
section 4's bounded audit fields. “Refresh” means refresh authoritative server
state and show the precise usability effect; it does not mean refresh-token
rotation. Compact `CHOICE-nnn` references in this table mean the exact stable
`AUTH-LC-CHOICE-nnn` record in section 6; “same gates” means the complete gate
set on the immediately preceding named row, not an omitted gate decision.

| Exact row | Decision authority / implementation evidence | Ordinary read, later mutation, and re-entry | Idempotency, replay, retry, concurrency | Retention, hard delete, purge | Audit, privacy, client | Choice; status; owner/lane; manual gates; runtime acceptance |
| --- | --- | --- | --- | --- | --- | --- |
| `AUTH-LC-SES-001` | Template + `E-SESSION`; current source/tested sequentially | Hide from active-session use; no mutation except terminal read; new sign-in only | Already-terminal retry is sequentially bounded; ordinary tracked updates leave concurrent audit/result behavior unproved; family cascade transactional | Session class §5.3; HD=no; P=unresolved | Success/denial/family transition, no credential; refresh/show current sign-out | `CHOICE-010`; partial concurrency evidence; #338/auth; `G-RET`,`G-PRIV`,`G-DEST`; revoke/family/concurrent/redaction tests |
| `AUTH-LC-SES-002` | Template + `E-SESSION`; current source/tested sequentially | Owner-bounded read; terminal target cannot mutate; new sign-in only | Missing/not-owned/terminal stays non-disclosing sequentially; ordinary tracked updates leave concurrent revoke outcome unproved | Session class §5.3; HD=no; P=unresolved | Actor/target/outcome, no credential; refresh selected-session list | `CHOICE-010`; partial concurrency evidence; #338/#774 auth/client; `G-RET`,`G-PRIV`,`G-DEST`; ownership/race tests |
| `AUTH-LC-SES-003` | Template + `E-SESSION`; current source/tested | Selected unexpired sessions excluded; undiscovered refresh lineage may remain; new sign-in only | Zero-selected is success; transaction covers selected rows/families but cascade completeness is partial | Session class §5.3; HD=no; P=unresolved | Actor/account/count/outcome, no credential; do not promise every refresh is revoked | `CHOICE-010/013`; partial; #338; `G-AUTH`,`G-RET`,`G-PRIV`,`G-DEST`; expired-session-linked refresh regression required |
| `AUTH-LC-SES-004` | Template + `E-SESSION`; current validation source | Exclude when expired even if stored status is active; new sign-in only | Repeated validation denies; status-materialization race unresolved | Session class §5.3; HD=no; P=unresolved | Expiry denial if safely attributable; generic client reauth | `CHOICE-010`; partial lazy state; #338/#1059; `G-RET`,`G-PRIV`,`G-DEST`; time/race/cleanup tests |
| `AUTH-LC-REF-001` | Template + `E-SESSION`; current source, in-memory tests | Predecessor excluded after commit; replacement remains eligible; no predecessor re-entry | Relational code uses status-qualified consume/transaction, but current focused tests do not execute that provider branch; predecessor replay is sequentially tested, relational race proof unresolved | Refresh class §5.3; HD=no; P=unresolved | Rotation lineage/outcome, never raw/hash; client stores only immediate replacement boundary | `CHOICE-010/012`; partial evidence; #338/#1059; `G-AUTH`,`G-RET`,`G-PRIV`,`G-DEST`; relational atomic-race/no-secret tests |
| `AUTH-LC-REF-002` | Template + `E-SESSION`; current source/tested sequentially | Replayed family excluded; only independent new sign-in can re-enter | Linkable replay cascades and unknown stays generic in sequential cases; concurrent replay/rotation result lacks a relational race test | Refresh class §5.3; HD=no; P=unresolved | Replay/family safe IDs and outcome; generic reauth | `CHOICE-010`; partial concurrency evidence; #338; `G-AUTH`,`G-RET`,`G-PRIV`,`G-DEST`; linkable/unknown/relational-race tests |
| `AUTH-LC-REF-003` | Template + `E-SESSION`; current source/tested | Expired family excluded; new sign-in only | Repeated attempt denies; matched family expiry cascade transactional | Refresh class §5.3; HD=no; P=unresolved | Expiry category, no material/hash; generic reauth | `CHOICE-010`; implemented; #338/#1059; `G-RET`,`G-PRIV`,`G-DEST`; clock/family tests |
| `AUTH-LC-PWD-001` | Template + `E-SESSION`; current source/tested | Current credential remains active with new verifier; current session remains; undiscovered refresh lineage or a family shared with the excluded current session may remain | Same-password/current-proof results defined; verifier + selected-session transaction is atomic, but family discovery/exclusion makes cascade completeness partial | Password class §5.3; HD=no; P=unresolved | Change/denial/selected revoke; never old/new/verifier; do not promise every other refresh ended | `CHOICE-012/013`; partial cascade; #339/#338/#774; `G-AUTH`,`G-CLIENT`; proof/race/expired-linkage/shared-family/no-secret tests |
| `AUTH-LC-PWD-002` | Template + `E-RESET`; current source/tested sequentially | New verifier active after a successful commit; reset requests and selected sessions excluded; undiscovered refresh lineage may remain | Replay is generic, but reset consume lacks an atomic status guard and concurrent completions can both succeed; transaction covers each replacement/selected cascade, not cross-request serialization or complete lineage discovery | Password/reset classes §5.3; HD=no; P=unresolved | Consume/change/selected revoke, no material/password; require sign-in without promising universal refresh revoke | `CHOICE-007/012/013`; partial consume/cascade; #339/#338/#773; `G-AUTH`,`G-PROV`,`G-RET`,`G-PRIV`; concurrent completion/expired-linkage/redaction tests |
| `AUTH-LC-PWD-003` | Template + `E-IDENTITY`; schema only | Disabled verifier excluded; allowed admin/re-enable/reset mutations unresolved | Idempotency/retry/concurrency unresolved; block mutation | Password class §5.3; HD=no; P=unresolved | Required success/denial/actor/reason, no verifier; unavailable UI | `CHOICE-002`; unimplemented; #788/#339; `G-AUTH`,`G-LOCK`,`G-SCHEMA`,`G-CONTRACT`,`G-CLIENT`,`G-PRIV`; full lockout/session tests |
| `AUTH-LC-PWD-004` | Template + `E-IDENTITY`; schema only | Revoked verifier excluded; no re-entry; replacement is distinct | Idempotency/retry/concurrency unresolved; block mutation | Password class §5.3; HD=no; P=unresolved | Required revoke/denial, no verifier; unavailable UI | `CHOICE-002`; unimplemented; #788/#339; same gates as PWD-003; terminal/session/material tests |
| `AUTH-LC-ACC-001` | Template + `E-IDENTITY`; schema/consumer evidence | Disabled account restricted; re-enable only explicit; dependent mutation unresolved | Idempotency/retry/atomic cascade/last-owner race unresolved | Account class §5.3; HD=no; P=unresolved | Required actor/reason/prior-new/denials; blocked admin UI | `CHOICE-001`; unimplemented; #788/#785; `G-AUTH`,`G-LOCK`,`G-SCHEMA`,`G-CONTRACT`,`G-CLIENT`,`G-PRIV`; last-owner/cascade tests |
| `AUTH-LC-ACC-002` | Template + `E-IDENTITY`; schema only | Re-evaluate every credential/factor/role/session; never revive terminal authority | Idempotency/retry/concurrency and recovery proofs unresolved | Account class §5.3; HD=no; P=unresolved | Required actor/reason/revalidation; blocked admin UI | `CHOICE-001`; unimplemented; #788/#785; same gates as ACC-001; revalidation/denial tests |
| `AUTH-LC-ID-001` | Template + `E-IDENTITY`; disabled field, no runtime | Unlinked identity excluded; other methods unchanged; relink distinct | Retry/concurrency/provider-collision/last-method result unresolved | Identity class §5.3; HD=no; P=unresolved | Required actor/provider-safe subject/reason, no provider payload; blocked UI | `CHOICE-003`; unimplemented; #787/#773/#785; `G-AUTH`,`G-LOCK`,`G-SCHEMA`,`G-CONTRACT`,`G-CLIENT`,`G-PROV`,`G-PRIV`; takeover/lockout tests |
| `AUTH-LC-ROL-001` | Template + `E-IDENTITY`; bounded insert paths only | Authorized readers see assignment; later change/remove unresolved | Duplicate constraint evidence exists; general retry/last-owner concurrency unresolved | Role class §5.3; HD=no; P=unresolved | Required actor/exact role/reason; blocked general UI | `CHOICE-004`; partial bounded creation; #785/#464/#465; `G-AUTH`,`G-LOCK`,`G-SCHEMA`,`G-CONTRACT`,`G-CLIENT`; grant/authz tests |
| `AUTH-LC-ROL-002` | Template + `E-IDENTITY`; no runtime | Old/new authorization read effect and re-entry unresolved | Atomic replacement/idempotency/retry/concurrency unresolved | Role class §5.3; HD=no; P=unresolved | Required prior/new role + actor/reason; blocked UI | `CHOICE-004`; unimplemented; same owners/gates; stale-claim/last-owner tests |
| `AUTH-LC-ROL-003` | Template + `E-IDENTITY`; no runtime | Removed role excluded; later assignment is new event | Idempotency/retry/concurrency/last-owner unresolved | Role class §5.3; HD=no; P=unresolved | Required removal/denial + actor/reason; blocked UI | `CHOICE-004`; unimplemented; same owners/gates; self-demotion/concurrency tests |
| `AUTH-LC-PKY-001` | Template + `E-FACTOR`; current source/tested sequentially | Revoked credential excluded; metadata owner-read may remain; new enrollment only | Already-revoked retry is sequentially idempotent; ownership/policy-dependent step-up checked; ordinary tracked update leaves concurrent revoke/audit unproved | Passkey class §5.3; HD=no; P=unresolved | Revoke/denial safe credential ID, no assertion/private data; refresh factor list | `CHOICE-005`; partial concurrency; #394/#776; `G-AUTH`,`G-LOCK`,`G-RET`,`G-PRIV`,`G-DEST`; post-revoke/concurrent/session/disposition tests |
| `AUTH-LC-PKY-002` | Template + `E-FACTOR`; schema only | Disabled credential excluded; re-enable only explicit | Idempotency/retry/concurrency unresolved; block mutation | Passkey class §5.3; HD=no; P=unresolved | Required disable/denial, no ceremony payload; unavailable UI | `CHOICE-005`; unimplemented; #394/#776; `G-AUTH`,`G-LOCK`,`G-SCHEMA`,`G-CONTRACT`,`G-CLIENT`,`G-PRIV`; factor/session tests |
| `AUTH-LC-PKY-003` | Template + `E-FACTOR`; schema only | Revalidate credential/account/policy; no session revival | Idempotency/retry/concurrency/compromise response unresolved | Passkey class §5.3; HD=no; P=unresolved | Required re-enable/denial; unavailable UI | `CHOICE-005`; unimplemented; same owners/gates; compromise/re-entry tests |
| `AUTH-LC-PKY-004` | Template + `E-FACTOR`; current source/tested sequentially | Any owned non-revoked passkey row becomes revoked after commit; no re-entry | Broad pending/enrolled/disabled acceptance is current; ordinary tracked update leaves concurrent result/audit and desired source guard unresolved | Passkey class §5.3; HD=no; P=unresolved | Revoke/source-state/reason safe metadata, no assertion/private data; refresh list | `CHOICE-005`; partial broad/concurrent behavior; #394/#776; same gates as PKY-001; source-state/concurrency tests |
| `AUTH-LC-TOTP-001` | Template + `E-FACTOR`; current source/tested sequentially | Pending setup excluded after commit; new enrollment allowed | Already-unavailable generic sequentially; ownership checked; no concurrency token/status-qualified update, so concurrent cancel/revoke audit/outcome is unproved | TOTP class §5.3; HD=no; P=unresolved | Cancel/denial safe ID, never protected secret/OTP; refresh setup state | `CHOICE-005`; partial concurrency; #394/#776; `G-AUTH`,`G-RET`,`G-PRIV`,`G-DEST`; cancel-race/secret-erasure tests |
| `AUTH-LC-TOTP-002` | Template + `E-FACTOR`; current source/tested sequentially | Observed prior pending excluded; new pending setup eligible | Unguarded read-then-insert and no unique active/pending constraint allow concurrent starts to create multiple pending factors | TOTP class §5.3; HD=no; P=unresolved | Replacement lifecycle, no setup secret in audit; show only current setup while acknowledging conflict | `CHOICE-005/012`; partial concurrency; #394/#776; `G-AUTH`,`G-RET`,`G-PRIV`; atomic/unique concurrent-begin and no-secret tests |
| `AUTH-LC-TOTP-003` | Template + `E-FACTOR`; current source, focused expiry test absent | Expired setup excluded; restart allowed | Source saves lazy expiry; retry and concurrent verification outcome lack focused tests | TOTP class §5.3; HD=no; P=unresolved | Expiry/failure, no OTP/secret; show setup expired | `CHOICE-005`; source-implemented/test-partial; #394/#776; `G-RET`,`G-PRIV`,`G-DEST`; clock/race/disposition tests required |
| `AUTH-LC-TOTP-004` | Template + `E-FACTOR`; schema only | Disabled factor excluded; re-enable explicit only | Idempotency/retry/concurrency/last-factor unresolved | TOTP class §5.3; HD=no; P=unresolved | Required disable/denial, no protected secret; unavailable UI | `CHOICE-005`; unimplemented; #394/#465/#776; `G-AUTH`,`G-LOCK`,`G-SCHEMA`,`G-CONTRACT`,`G-CLIENT`,`G-PRIV`; lockout/secret tests |
| `AUTH-LC-TOTP-005` | Template + `E-FACTOR`; schema only | Revalidate factor/account/policy; no session revival | Idempotency/retry/concurrency/secret validity unresolved | TOTP class §5.3; HD=no; P=unresolved | Required re-enable/denial; unavailable UI | `CHOICE-005`; unimplemented; same owners/gates; re-entry/compromise tests |
| `AUTH-LC-TOTP-006` | Template + `E-FACTOR`; current source/tested sequentially | Revoked factor excluded after commit; new enrollment only | Already-revoked idempotent sequentially; ownership/policy-dependent step-up checked; no concurrency token/status-qualified transition | TOTP class §5.3; HD=no; P=unresolved | Revoke/denial safe ID, no secret/OTP; refresh factor list | `CHOICE-005`; partial concurrency; #394/#465/#776; `G-AUTH`,`G-LOCK`,`G-RET`,`G-PRIV`,`G-DEST`; revoke-race/last-factor/session/secret-erasure tests |
| `AUTH-LC-TOTP-007` | Template + `E-FACTOR`; current source/tested sequentially | Any owned non-revoked factor row becomes revoked after commit; no re-entry | Broad source-state acceptance and policy-dependent step-up are current; desired source guard and concurrent transition outcome unresolved | TOTP class §5.3; HD=no; P=unresolved | Revoke/source-state/reason safe metadata, no secret/OTP; refresh factor/setup state | `CHOICE-005`; partial broad/concurrent behavior; #394/#776; same gates as TOTP-006; pending/expired/disabled and concurrency tests |
| `AUTH-LC-RCV-001` | Template + `E-FACTOR`; current source/tested sequentially | Old batch/verifiers excluded; new batch active | Explicit replacement required; concurrent calls can create multiple active batches; retry cannot safely redisplay prior codes | Recovery class §5.3; HD=no; P=unresolved | Replace/generate counts, no codes/verifiers; display once only | `CHOICE-005/012`; partial concurrency; #775/#776; `G-AUTH`,`G-LOCK`,`G-RET`,`G-PRIV`,`G-DEST`; atomic-active-batch race/no-redisplay tests |
| `AUTH-LC-RCV-002` | Template + `E-FACTOR`; current source/tested sequentially | Consumed verifier excluded; batch remains as count permits | Ordinary tracked update has no conditional consume/concurrency token; concurrent challenges can both succeed; replay denies only after committed state | Recovery class §5.3; HD=no; P=unresolved | Consumption safe IDs/counts, no code/verifier; refresh batch count | `CHOICE-005`; partial concurrency; #775; `G-AUTH`,`G-RET`,`G-PRIV`,`G-DEST`; atomic exact-one relational/depletion tests |
| `AUTH-LC-RCV-003` | Template + `E-FACTOR`; current source/tested sequentially for active batch | Revoked batch/unused verifiers excluded after commit; new batch distinct | Active batch and unused verifiers update together; ordinary tracked updates leave concurrent revoke/use unresolved | Recovery class §5.3; HD=no; P=unresolved | Revoke/counts, no codes/verifiers; refresh list | `CHOICE-005`; partial concurrency; #775/#776; same gates as RCV-002; revoke/use race/disposition tests |
| `AUTH-LC-RCV-004` | Template + `E-FACTOR`; schema only | Expired material excluded; replacement distinct | Trigger/idempotency/retry/concurrency unresolved | Recovery class §5.3; HD=no; P=unresolved | Required expiry/counts, no code/verifier; blocked/unavailable state | `CHOICE-005`; unimplemented; #775/#776; `G-AUTH`,`G-SCHEMA`,`G-RET`,`G-PRIV`,`G-DEST`; clock/depletion tests |
| `AUTH-LC-RCV-005` | Template + `E-FACTOR`; current source/tested sequentially | Any owned batch is rewritten revoked; later generation remains distinct | Replaced/expired/revoked accepted; repeated revoke rewrites timestamps/reason and audit, so not idempotent; concurrent outcome unresolved | Recovery class §5.3; HD=no; P=unresolved | Revoke/source-state/counts, no codes/verifiers; refresh list | `CHOICE-005`; partial broad/non-idempotent behavior; #775/#776; same gates as RCV-003; source-state/retry/concurrency tests |
| `AUTH-LC-CHL-001` | Template + `E-FACTOR`; current MFA source/tested sequentially | Verified challenge terminal after commit; scoped continuation only | No conditional status update/concurrency token; two concurrent completions can both pass pending check; later replay denies | Challenge class §5.3; HD=no; P=unresolved | Purpose/factor/outcome/attempts, no OTP/verifier; continue scoped flow | `CHOICE-006`; partial concurrency; #394/`REC-AUTH-MFA-SIGNIN-001`; `G-AUTH`,`G-RET`,`G-PRIV`,`G-DEST`; atomic completion/replay tests |
| `AUTH-LC-CHL-002` | Template + `E-FACTOR`; current passkey source/tested sequentially | Consumed challenge terminal after commit; scoped continuation only; sign-in completion does not revalidate passkey policy after options issuance | No conditional status update/concurrency token; concurrent completions can both succeed and passkey sign-in can create two sessions; intervening policy disable does not currently block completion | Challenge class §5.3; HD=no; P=unresolved | Purpose/credential/outcome, no assertion/challenge; continue scoped flow only after approved policy handoff | `CHOICE-005/006`; partial concurrency/policy revalidation; #394/`REC-AUTH-PASSKEY-SESSION-001`; same gates; atomic binding/handoff/policy-change tests |
| `AUTH-LC-CHL-003` | Template + `E-FACTOR`; current clock-denial source/tested | Clock-expired challenge is unusable even when persisted status remains pending; new ceremony required | Repeated completion denies by clock; helper mutation is not saved on early return, and concurrency/status reconciliation is unresolved | Challenge class §5.3; HD=no; P=unresolved | Expiry/purpose safe IDs only when persisted/audited, no material; show expired/generic public failure | `CHOICE-006`; partial/unpersisted status; #394; `G-RET`,`G-PRIV`,`G-DEST`; clock/persistence/race tests |
| `AUTH-LC-CHL-004` | Template + `E-FACTOR`; current source/tested | Blocked challenge excluded; new ceremony per abuse policy | Attempt threshold guarded; repeat denies; cross-node policy unresolved | Challenge class §5.3; HD=no; P=unresolved | Block/denial/attempt bucket, no submitted factor; generic public failure | `CHOICE-006`; implemented mapped flows; #394/REC-ABUSE; `G-AUTH`,`G-RET`,`G-PRIV`,`G-EXPOSE`; threshold/distributed tests |
| `AUTH-LC-CHL-005` | Template + `E-FACTOR`; schema/partial flow evidence | Failed challenge excluded if materialized; next mutation unresolved | Retry/status materialization/concurrency unresolved | Challenge class §5.3; HD=no; P=unresolved | Required failure category, no submitted factor; generic failure | `CHOICE-006`; partial; #394/REC-ABUSE; same gates as CHL-004; per-flow transition tests |
| `AUTH-LC-CHL-006` | Template + `E-FACTOR`; schema only | Cancelled challenge excluded; new ceremony distinct | Idempotency/retry/concurrency unresolved; no exposed mutation | Challenge class §5.3; HD=no; P=unresolved | Required cancel actor/reason; blocked UI | `CHOICE-006`; unimplemented; #394; `G-AUTH`,`G-SCHEMA`,`G-CONTRACT`,`G-CLIENT`,`G-RET`,`G-PRIV`; authorization/race tests |
| `AUTH-LC-CHL-007` | Template + `E-FACTOR`; schema/terminal-reject evidence | Replay-detected challenge excluded; session response unresolved | Terminal replay rejects; status materialization/concurrent response incomplete | Challenge class §5.3; HD=no; P=unresolved | Replay/purpose safe IDs, no payload; generic reauth/failure | `CHOICE-006`; partial; #394/REC-ABUSE; `G-AUTH`,`G-RET`,`G-PRIV`,`G-EXPOSE`; replay/session tests |
| `AUTH-LC-RST-001` | Template + `E-RESET`; current source/tested sequentially | Replaced observed request excluded; newest sequential pending may proceed; concurrent new requests can both remain pending | New issue revokes the pending set it observes transactionally, but no unique active-status constraint, concurrency token, or conditional replacement prevents a two-link issuance race | Reset class §5.3; HD=no; P=unresolved | Replacement/requested events, no email/material/hash; generic delivery response | `CHOICE-007`; partial issuance concurrency; #339/#724; `G-AUTH`,`G-PROV`,`G-RET`,`G-PRIV`,`G-DEST`; atomic replacement/relational race/redaction tests |
| `AUTH-LC-RST-002` | Template + `E-RESET`; current source/tested sequentially | Consumed request excluded after commit; later request distinct | No status-qualified consume/concurrency token; concurrent completions can both read pending and report success; later replay becomes suspicious | Reset class §5.3; HD=no; P=unresolved | Consume/change/revoke events, no password/material; prompt sign-in | `CHOICE-007`; partial concurrency; #339; same gates as RST-001; atomic pending-to-consumed relational/session tests |
| `AUTH-LC-RST-003` | Template + `E-RESET`; current source/tested | Expired request excluded; later request distinct | Sequential repeated completion is generic; concurrent lazy-expiry outcome remains unproved | Reset class §5.3; HD=no; P=unresolved | Expiry/denial safe metadata, no identifier/material; generic failure | `CHOICE-007`; implemented sequentially; #339/#724; `G-RET`,`G-PRIV`,`G-DEST`; concurrent clock/redaction tests required |
| `AUTH-LC-RST-004` | Template + `E-RESET`; current source/tested in part | Suspicious-replay request excluded; dependency-denied pending request remains eligible if dependencies recover before expiry | Reuse generic; account/identity/credential/policy denial only refreshes check/update times and audit, while guessing/rate/concurrent classification remains incomplete | Reset class §5.3; HD=no; P=unresolved | Replay/denial without identifiers/material; generic failure | `CHOICE-007`; partial/non-terminal denial; #339/REC-ABUSE; `G-AUTH`,`G-RET`,`G-PRIV`,`G-EXPOSE`; dependency-recovery/guessing/replay tests |
| `AUTH-LC-RST-005` | Template + `E-RESET`; current source/tested successful-completion path | Revoked pending requests excluded; new issuance per policy | Successful completion performs an observed-set revoke in the current transaction; denial does not revoke, and trigger/race completeness is unresolved | Reset class §5.3; HD=no; P=unresolved | Revoke reason/count safe metadata, no material; no distinct public disclosure | `CHOICE-007`; implemented bounded success path; #339/#724; `G-AUTH`,`G-RET`,`G-PRIV`,`G-DEST`; trigger/dependency/race tests |
| `AUTH-LC-INV-001` | Template + `E-INVITE`; current source/tested | Accepted invitation excluded; created account independently readable/usable; disabled-plus-grace readout does not permit actual acceptance | Relational transaction and sequential single-use/compensating rollback are tested; grace enforcement is inconsistent and concurrent acceptance remains a required case | Invite class §5.3; HD=no for action; P=unresolved | Accept/denial safe IDs/categories, no contact/material; generic public result | `CHOICE-008`; partial grace/default-off; #784; `G-AUTH`,`G-PROV`,`G-EXPOSE`,`G-RET`,`G-PRIV`,`G-DEST`; grace/concurrent single-use/rollback tests required |
| `AUTH-LC-INV-002` | Template + `E-INVITE`; current source/tested | Same pending row remains; old material excluded only on ready requested-delivery path | Non-idempotent: every ready retry generates/commits another hash before send, invalidating the prior generated link; timeout/send failure leaves delivery ambiguity | Invite class §5.3; HD=no; P=unresolved | Resend/delivery category, no contact/material/hash; show exact known result and never promise which timed-out link arrived | `CHOICE-008`; partial retry semantics; #784; same gates as INV-001; idempotency/delivery-ambiguity/race tests |
| `AUTH-LC-INV-003` | Template + `E-INVITE`; current source/tested | Revoked invitation excluded; no re-entry | Sequential already-terminal and authorization results are bounded; concurrent revoke/accept race remains unproved | Invite class §5.3; HD=no for revoke; P=unresolved | Actor/subject/reason, no contact/material; refresh admin list | `CHOICE-008`; implemented sequentially; #784/#724; `G-AUTH`,`G-RET`,`G-PRIV`,`G-DEST`; concurrent authz/race tests required |
| `AUTH-LC-INV-004` | Template + `E-INVITE`; current source/tested | Expired invitation excluded; no re-entry | Lazy/batch expiry deterministic; repeated redemption generic | Invite class §5.3; HD=no for expiry; P=unresolved | Expiry/denial safe metadata, no material; generic public failure | `CHOICE-008`; implemented; #784/#724; `G-RET`,`G-PRIV`,`G-DEST`; clock/batch tests |
| `AUTH-LC-INV-005` | Template + `E-INVITE`; current destructive source/tested | Row becomes unreadable; accepted account remains; no re-entry; any well-formed anonymous accept request can trigger global cleanup before its abuse/policy/secret checks | Batch 50/order current; retries process survivors; public trigger authorization and cross-copy/hold concurrency are unproved | Current HD=yes after 90-day marker; policy HD/P=unresolved, not authorized here | Aggregate counts/categories only; row evidence sufficiency unresolved; no ordinary cleanup UI, but public protocol invocation exists | `CHOICE-008`; implemented fact/policy-blocked; #784/#724; `G-AUTH`,`G-RET`,`G-PRIV`,`G-DEST`,`G-EXPOSE`; trigger-auth/invalid-secret/holds/copies/idempotency/disposal audit tests |
| `AUTH-LC-INV-006` | Template + `E-INVITE`; current source/tested | Pending row and existing material remain eligible; later ready resend/accept/revoke allowed | Repeated non-ready resend updates state/audit but does not rotate; concurrency with accept/revoke needs terminal-state proof | Invite class §5.3; HD=no; P=unresolved | Non-sent delivery category, no contact/material/hash; explicitly do not claim replacement | `CHOICE-008`; implemented; #784; `G-AUTH`,`G-PROV`,`G-RET`,`G-PRIV`; no-rotation/provider/race tests |
| `AUTH-LC-POL-001` | Template + `E-FACTOR`; schema/read only | Active/default read governs; mutation/re-entry/version retirement unresolved | Version/idempotency/effective-time/concurrency unresolved; block mutation | Policy class §5.3; HD=no; P=unresolved | Required actor/prior-new version/reason, no secret config; read-only/blocked UI | `CHOICE-011`; unimplemented mutation; #394/#465/#785; `G-AUTH`,`G-LOCK`,`G-SCHEMA`,`G-CONTRACT`,`G-CLIENT`,`G-RET`,`G-PRIV`; version/weakening tests |
| `AUTH-LC-POL-002` | Template + `E-INVITE`; current source/tested sequentially | New active read governs; retired version retained; later change allowed; disabled-plus-grace readout and acceptance enforcement disagree | Conditional mutation and current-version retry are source-defined; grace behavior is partial and concurrent version race coverage remains required | Policy class §5.3; HD=no; P=unresolved | Actor/version/prior-new/outcome, no unsafe config; refresh readout without promising grace acceptance | `CHOICE-008/011`; partial grace/sequential mutation; #784/#785; `G-AUTH`,`G-LOCK`,`G-RET`,`G-PRIV`; concurrent race/grace/lockout tests required |
| `AUTH-LC-AUD-001` | Template + `E-AUDIT`; append writers/partial tests | Security-authorized read future; no row mutation/re-entry; correction additive | Writer retry/idempotency varies and complete inventory is unresolved | Audit class §5.3; HD=no; P=unresolved | Exact bounded audit contract; no secret/private payload; no ordinary removal UI | `CHOICE-009`; partial; #724/#774/#973; `G-AUTH`,`G-CONTRACT`,`G-CLIENT`,`G-RET`,`G-PRIV`,`G-DEST`; authz/pagination/hold/export/disposal tests |

### 5.3 Retention, Audit, Privacy, Follow-Up, And Acceptance

`Operationally required, duration unresolved` means current security behavior
needs some bounded evidence, but no reviewed duration exists. `Source-defined
validity` describes usability only; it is not a retention or disposal period.

| Row ID(s) | Retention classification and trigger | Retained safe evidence / privacy boundary | Current audit evidence and gaps | Open choice, follow-up lane, manual gate, runtime acceptance |
| --- | --- | --- | --- | --- |
| `AUTH-LC-SES-001`–`AUTH-LC-SES-004` | Source-defined session validity; post-expiry/revocation metadata retention is operationally required but duration unresolved. | Session/account IDs, status, issued/expires/last-seen/revoked time, bounded reason/device label; never raw access material, token hash in client/audit, full IP, or unbounded agent. | Session creation/validation/revocation/family events exist; no retention cleanup/readout proof. | `AUTH-LC-CHOICE-010`; #338/#1059, `auth-session-security`; security/privacy/destructive gates. Accept expiry/revoke/family isolation, concurrent revoke, redaction, and retained-copy disposition tests. |
| `AUTH-LC-REF-001`–`AUTH-LC-REF-003` | Source-defined idle/absolute validity; rotated/replayed hash/lineage retention is operationally required for replay detection, duration unresolved. | Family/credential/session IDs, status, lineage, issued/idle/absolute/consumed/revoked times, bounded reason; no raw refresh value or exposed hash. | Rotation, replay, expiry and family-revoke events exist. | `AUTH-LC-CHOICE-010`; #338/#1059. Accept atomic race/retry, linkable/unknown replay, family-only blast radius, and no-secret evidence. |
| `AUTH-LC-PWD-001`–`AUTH-LC-PWD-004` | Active verifier is operational credential material. Superseded verifier is overwritten. Disabled/revoked verifier retention and erasure are unresolved; verifier retention as history is forbidden. | Algorithm/version/parameters, status and timestamps only where needed; never password, verifier, salt/pepper detail, submitted values, or previous verifier in audit. | Create/verify/change/reset audit exists; credential disable/revoke lifecycle events do not. | `AUTH-LC-CHOICE-002`; #339/#788. Manual auth/security and schema/privacy gate. Accept current-password proof, same-password denial, atomic replacement, session effects, disable/re-enable/revoke, and secret-erasure tests. |
| `AUTH-LC-ACC-001`–`AUTH-LC-ACC-002` | Account lifecycle evidence operationally required; duration/disposal unresolved. | Account/profile link, bounded status/time/actor/reason; keep profile lifecycle separate. | Architecture requires disable/re-enable/denied audit; runtime absent. | `AUTH-LC-CHOICE-001`; #788/#785. Owner-lockout manual gate. Accept last-owner concurrency, alternate-auth recovery, session/material response, re-enable revalidation and denial audit. |
| `AUTH-LC-ID-001` | Link/tombstone retention operationally required to prevent unsafe relink/collision and explain access; duration unresolved. | Provider type/name, stable bounded subject or non-reversible reference, disable/unlink metadata; no provider tokens/payloads. | Required by architecture; unlink event/runtime absent. | `AUTH-LC-CHOICE-003`; #787/#773/#785. Provider/security/privacy gate. Accept last-sign-in-method, relink takeover, session impact and redaction cases. |
| `AUTH-LC-ROL-001`–`AUTH-LC-ROL-003` | Role history operationally required for authorization/audit; current assignment row lacks removal history. Duration unresolved. | Account ID, exact role, actor, assigned/removed time and reason; no client-supplied authority. | Bootstrap assignment exists; general assign/remove audit absent. | `AUTH-LC-CHOICE-004`; #785/#464/#465. Owner-lockout/API/schema/UI gates. Accept stale-claim/session, self-demotion and concurrent last-owner tests. |
| `AUTH-LC-PKY-001`–`AUTH-LC-PKY-004` | Revoked/disabled public credential metadata operationally required for collision/replay/security review; duration unresolved. | Server credential ID, credential-ID hash, public key only while justified, counter/backup/transport categories, status/times/reason; no private material, raw assertion, full attestation payload. | Enrollment/assertion/revoke/failure audit exists; generic revoke accepts every owned non-revoked source state; disable/re-enable and terminal cleanup do not. | `AUTH-LC-CHOICE-005`; #394/#776 plus `REC-AUTH-PASSKEY-SESSION-001`. Accept source-state/concurrency, last-factor/step-up, post-transition sign-in, session decision, replay and disposition tests. |
| `AUTH-LC-TOTP-001`–`AUTH-LC-TOTP-007` | Pending setup validity is source-defined. Terminal metadata duration unresolved. Reusable protected secret retention after terminal state is forbidden merely for history. | Factor ID/type/status/times/policy/reason and bounded label; terminal lifecycle evidence must exclude decryptable secret, provisioning URI/key, submitted OTP. | Enrollment/cancel/revoke/failure audit exists; generic revoke accepts every owned non-revoked source state; disable/re-enable, terminal secret erasure, and cleanup absent. | `AUTH-LC-CHOICE-005`; #394/#465/#776. Secret-management/schema/security gates. Accept source-state guards, atomic secret erasure/rotation, last-factor/recovery, sessions, retry and audit-redaction. |
| `AUTH-LC-RCV-001`–`AUTH-LC-RCV-005` | Active salted verifiers are operational credential material. Consumed/replaced/revoked metadata retention is required for security review, but verifier retention duration is unresolved and never justified solely by hashing. | Batch/code IDs, counts, status and times, safe challenge/correlation linkage; never raw code, submitted code, verifier/hash/salt in read/audit. | Generation/use/revoke events exist; generic revoke rewrites every owned batch source state and expiry runtime does not exist. | `AUTH-LC-CHOICE-005`; #775/#776 and `REC-AUTH-MFA-SIGNIN-001`. Accept display-once/no-redisplay, exact-one consumption, source-state/idempotency, replacement/revoke race, depletion, expiry and verifier disposition. |
| `AUTH-LC-CHL-001`–`AUTH-LC-CHL-007` | Source-defined short validity; terminal challenge retention/cleanup unresolved. | IDs, purpose/factor/status, bounded verifier/hash/context, attempts and terminal times/reason only while needed; no raw reusable challenge or full authenticator payload. | Passkey/MFA success/failure/step-up events exist; terminal-status coverage differs by flow as section 5.2 records. | `AUTH-LC-CHOICE-006`; #394, `REC-AUTH-MFA-SIGNIN-001`, `REC-AUTH-ABUSE-001`. Accept account/session/purpose binding, expiry, max attempts, replay, concurrent completion and cleanup. |
| `AUTH-LC-RST-001`–`AUTH-LC-RST-005` | Link validity is source-defined by approved reset delivery options; terminal evidence retention and `CleanupEligibleAtUtc` use are unresolved. | Request/account/credential IDs where safe, purpose/status/hash version, issue/expiry/consume/revoke/replace/replay/check times, safe delivery/bucket/correlation categories; no raw material, exposed hash, identifier, email, provider payload, or new password. | Requested/issued/consumed/denied/replay/revocation/session-revoke audit exists; no cleanup. | `AUTH-LC-CHOICE-007`; #339/#724 plus `REC-AUTH-ABUSE-001`. Accept unknown/matched material, sequential replacement, concurrent issuance/consume, denial with dependency recovery, replay, expiry, cleanup and redaction. |
| `AUTH-LC-INV-001`–`AUTH-LC-INV-004`, `AUTH-LC-INV-006` | Seven-day validity and 90-day cleanup eligibility are current source values, not generally approved retention policy. | Invitation ID, status, contact kind, masked display, target `user` role, actor/account IDs, lifecycle times, safe delivery/correlation categories; no raw link/secret/hash, full email, body, SMTP/provider payload. | Create/revoke/accept/resend/delivery/cleanup events exist; public failures are bounded. | `AUTH-LC-CHOICE-008`; #784/#724. Accept grace readout/enforcement consistency, conditional rotation/no-rotation, single-use, rollback, provider truth, concurrency and row-level evidence requirements. |
| `AUTH-LC-INV-005` | Current runtime hard-deletes terminal rows after the 90-day eligibility timestamp, and any well-formed anonymous accept request invokes cleanup before its abuse/policy/secret validation. Policy classification and trigger authority are unresolved/manual decisions; retention expiry is not sufficient authority under the shared taxonomy. | Current aggregate audit keeps workflow, counts/status categories and timing bucket, but no row IDs. Whether that is sufficient evidence is unresolved. | `invitation.cleanup_completed` exists; no per-row disposal event or hold/copy proof. | `AUTH-LC-CHOICE-008`; focused #784/#724 auth-runtime and retention-policy follow-up, with exposure/destructive/security/privacy gates. Accept trigger authorization/order, invalid-secret isolation, holds, dependencies, backups/replicas, dry-run, batch retry/idempotency, per-row/aggregate audit sufficiency and rollback boundaries before continued authorization. |
| `AUTH-LC-POL-001`–`AUTH-LC-POL-002` | Active version is authoritative; retired policy evidence is operationally required, duration unresolved. | Policy ID/version, bounded modes/counts/status/effective/retired times, actor/reason/correlation; no keys/secrets or full unsafe configuration payload. | Invitation policy changes are audited; security policy is primarily read/runtime-default and has no general mutation proof. | `AUTH-LC-CHOICE-011`; #394/#465/#784/#785. Accept version race, safe-default fallback, weakening/last-owner gates, effective-time behavior, and session/factor impact. |
| `AUTH-LC-AUD-001` | Policy-defined/configurable intent, but numeric duration, holds, read/export, retention clock and disposition are unresolved. Audit retention is separate from credential-material retention. | Only minimum actor/subject/action/outcome/time/correlation/request and bounded reason/transition metadata. Never credential material, local identifiers/emails without separate approval, request/response bodies, or provider/private payloads. | Substantial writers/redaction tests exist; complete lifecycle event inventory, authorized reads, export and purge do not. | `AUTH-LC-CHOICE-009`; #721/#724/#774/#973. Privacy/destructive/manual gate. Accept append-only correction, pagination/authz, hold, export redaction, disposal accounting and no-secret scans. |

### 5.4 Manual-Gate Registry

These gates are not required to merge this documentation-only policy. They are
separate pending gates for the exact downstream behavior referenced by rows in
section 5.2. No gate has approval evidence, and satisfying one never satisfies
another.

| Gate ID | Required / status | Gate and decision owner | Approval evidence | Downstream work blocked |
| --- | --- | --- | --- | --- |
| `G-AUTH` | Yes / pending | Auth/session/security behavior and policy; focused row owner plus human security review | None; pending | Any new or changed lifecycle acceptance, cascade, material response, replay response, or policy enforcement |
| `G-LOCK` | Yes / pending where referenced | Owner/admin and last-sign-in-method lockout safety; #785/#788/#394 | None; pending | Account, role, identity, password, passkey, or MFA disable/re-enable/revoke administration |
| `G-SCHEMA` | Yes / pending where referenced | Persistence shape/migration; focused schema owner and human schema review | None; pending | New lifecycle fields, constraints, tombstones, secret erasure, compaction, or cleanup state |
| `G-CONTRACT` | Yes / pending where referenced | OpenAPI/generated clients; focused contract lane | None; pending | New/changed endpoints, states, results, error shapes, and generated methods |
| `G-CLIENT` | Yes / pending where referenced | Mobile, user-web, or admin-web owner as separate lanes | None; pending | Controls, warnings, confirmations, readouts, accessibility, and localized catalog adoption |
| `G-RET` | Yes / pending | Retention clock, holds, minimum evidence, and copy disposition; #724 plus record-family owner | None; pending | Any claimed duration, retention expiry processing, compaction, or disposal eligibility |
| `G-PRIV` | Yes / pending | Privacy/redaction and minimum-data decision; #724/#973 plus security owner | None; pending | New metadata/read/export, terminal verifier/hash retention, or evidence exposure |
| `G-DEST` | Yes / pending | Destructive purge/hard-delete authorization and operational proof; human destructive gate | None; pending | Physical deletion, purge, backup/replica disposition, or continuation/broadening of invitation cleanup as settled policy |
| `G-PROV` | Yes / pending where referenced | Provider/delivery/configuration owner; #403/#773/#784 | None; pending | Email/provider claims, enabled delivery, credentials/configuration, or provider-specific payload handling |
| `G-EXPOSE` | Yes / pending where referenced | Public/admin exposure; #777 or the private admin-entry owner | None; pending | Public registration/ceremony/reset/invitation exposure or a new admin lifecycle surface |

### 5.5 Exact Surface, Metadata, And Disposition Fields

This subsection completes the remaining reusable-schema fields for every exact
row. Profiles are values, not defaults to be guessed:

- `S-SELF-API`: existing authenticated API action; no complete shipped client
  surface is claimed. If exposed, use section 5.1's exact wording.
- `S-PUBLIC-API`: existing bounded anonymous/protocol API surface with generic
  failure presentation; no broader public exposure is authorized.
- `S-ADMIN-API`: existing private authenticated admin API action/readout; no
  complete admin-web UI is claimed.
- `S-PROTOCOL`: not a management control; existing sign-in, refresh, reset,
  invitation, or ceremony protocol presents only the section 5.1 outcome.
- `S-NOT-VISIBLE`: not user-visible; internal time, lineage, policy, cleanup,
  or evidence transition.
- `S-BLOCKED-SELF` / `S-BLOCKED-ADMIN`: proposed wording only; no current API
  or UI exists and the referenced gates block exposure.

Metadata applicability is `applicable` for every profile. `M-SESSION` requires
session/account/status/issue/expiry/revoke/reason/actor/version fields;
`M-REFRESH` family/credential/session IDs, status/lineage, issue/idle/absolute/
consume/revoke/replay/reason/version fields; `M-PASSWORD` credential/account,
status, verifier algorithm/version/parameters, create/update/disable/revoke
times, actor/reason/version but never prior/current verifier material;
`M-ACCOUNT`, `M-IDENTITY`, and `M-ROLE` require their stable subject IDs,
bounded prior/new status or relationship/role, applicable timestamps,
actor/reason/version; `M-PASSKEY`, `M-TOTP`, `M-RECOVERY`, and `M-CHALLENGE`
require the safe fields enumerated in section 5.3 plus their status and terminal
timestamps, actor/reason and version, excluding section 3 material;
`M-RESET` and `M-INVITE` require their section 5.3 safe IDs/status/hash-version
and lifecycle/delivery timestamps/categories but no raw material or exposed
hash/contact; `M-POLICY` requires ID/version/status/effective/retired times and
actor/reason/version; `M-AUDIT` requires bounded actor/subject/action/outcome/
time/reason/correlation/request/transition metadata. A named field absent from
current persistence is a gap, not a claim that the field exists.

`D-ORDINARY` means hard-delete `ineligible`: target classification is an
authoritative security record/material, conditions are not met, and consequence
warning/confirmation are `not applicable` because this transition is not a
delete. Purge is `unresolved`: a separate action is required; retention/hold,
dependency/copy, authority, audit, retry/concurrency, warning, explicit
confirmation if user-initiated, and `G-RET`/`G-PRIV`/`G-DEST` remain pending.
`D-INVITE-CLEANUP` records current hard-delete fact only: target is an
authoritative terminal invitation and current row conditions are terminal
status plus `CleanupEligibleAtUtc`. The cleanup is not a user-presented action,
but a well-formed anonymous acceptance request invokes it before abuse, policy,
or secret validation; no warning/confirmation exists, and current code does not
prove trigger authorization, holds, or copies. Continued hard-delete and purge
policy remain `unresolved`, require a separate reviewed action/policy, warning
and confirmation if ever user-initiated, and are blocked by
`G-AUTH`/`G-RET`/`G-PRIV`/`G-DEST`/`G-EXPOSE`.

| Exact row | Exact surface profile | Metadata profile | Hard-delete / purge profile |
| --- | --- | --- | --- |
| `AUTH-LC-SES-001` | `S-SELF-API` | `M-SESSION` | `D-ORDINARY` |
| `AUTH-LC-SES-002` | `S-SELF-API` | `M-SESSION` | `D-ORDINARY` |
| `AUTH-LC-SES-003` | `S-SELF-API` | `M-SESSION` | `D-ORDINARY` |
| `AUTH-LC-SES-004` | `S-PROTOCOL` | `M-SESSION` | `D-ORDINARY` |
| `AUTH-LC-REF-001` | `S-PROTOCOL` | `M-REFRESH` | `D-ORDINARY` |
| `AUTH-LC-REF-002` | `S-PROTOCOL` | `M-REFRESH` | `D-ORDINARY` |
| `AUTH-LC-REF-003` | `S-PROTOCOL` | `M-REFRESH` | `D-ORDINARY` |
| `AUTH-LC-PWD-001` | `S-SELF-API` | `M-PASSWORD` | `D-ORDINARY` |
| `AUTH-LC-PWD-002` | `S-PUBLIC-API` | `M-PASSWORD` + `M-RESET` | `D-ORDINARY` |
| `AUTH-LC-PWD-003` | `S-BLOCKED-ADMIN` | `M-PASSWORD` | `D-ORDINARY` |
| `AUTH-LC-PWD-004` | `S-BLOCKED-ADMIN` | `M-PASSWORD` | `D-ORDINARY` |
| `AUTH-LC-ACC-001` | `S-BLOCKED-ADMIN` | `M-ACCOUNT` | `D-ORDINARY` |
| `AUTH-LC-ACC-002` | `S-BLOCKED-ADMIN` | `M-ACCOUNT` | `D-ORDINARY` |
| `AUTH-LC-ID-001` | `S-BLOCKED-SELF`/`S-BLOCKED-ADMIN` | `M-IDENTITY` | `D-ORDINARY` |
| `AUTH-LC-ROL-001` | `S-BLOCKED-ADMIN` | `M-ROLE` | `D-ORDINARY` |
| `AUTH-LC-ROL-002` | `S-BLOCKED-ADMIN` | `M-ROLE` | `D-ORDINARY` |
| `AUTH-LC-ROL-003` | `S-BLOCKED-ADMIN` | `M-ROLE` | `D-ORDINARY` |
| `AUTH-LC-PKY-001` | `S-SELF-API` | `M-PASSKEY` | `D-ORDINARY` |
| `AUTH-LC-PKY-002` | `S-BLOCKED-SELF`/`S-BLOCKED-ADMIN` | `M-PASSKEY` | `D-ORDINARY` |
| `AUTH-LC-PKY-003` | `S-BLOCKED-SELF`/`S-BLOCKED-ADMIN` | `M-PASSKEY` | `D-ORDINARY` |
| `AUTH-LC-PKY-004` | `S-SELF-API` | `M-PASSKEY` | `D-ORDINARY` |
| `AUTH-LC-TOTP-001` | `S-SELF-API` | `M-TOTP` | `D-ORDINARY` |
| `AUTH-LC-TOTP-002` | `S-SELF-API` | `M-TOTP` | `D-ORDINARY` |
| `AUTH-LC-TOTP-003` | `S-PROTOCOL` | `M-TOTP` | `D-ORDINARY` |
| `AUTH-LC-TOTP-004` | `S-BLOCKED-SELF`/`S-BLOCKED-ADMIN` | `M-TOTP` | `D-ORDINARY` |
| `AUTH-LC-TOTP-005` | `S-BLOCKED-SELF`/`S-BLOCKED-ADMIN` | `M-TOTP` | `D-ORDINARY` |
| `AUTH-LC-TOTP-006` | `S-SELF-API` | `M-TOTP` | `D-ORDINARY` |
| `AUTH-LC-TOTP-007` | `S-SELF-API` | `M-TOTP` | `D-ORDINARY` |
| `AUTH-LC-RCV-001` | `S-SELF-API` | `M-RECOVERY` | `D-ORDINARY` |
| `AUTH-LC-RCV-002` | `S-PROTOCOL` | `M-RECOVERY` | `D-ORDINARY` |
| `AUTH-LC-RCV-003` | `S-SELF-API` | `M-RECOVERY` | `D-ORDINARY` |
| `AUTH-LC-RCV-004` | `S-NOT-VISIBLE` | `M-RECOVERY` | `D-ORDINARY` |
| `AUTH-LC-RCV-005` | `S-SELF-API` | `M-RECOVERY` | `D-ORDINARY` |
| `AUTH-LC-CHL-001` | `S-PROTOCOL` | `M-CHALLENGE` | `D-ORDINARY` |
| `AUTH-LC-CHL-002` | `S-PROTOCOL` | `M-CHALLENGE` | `D-ORDINARY` |
| `AUTH-LC-CHL-003` | `S-PROTOCOL` | `M-CHALLENGE` | `D-ORDINARY` |
| `AUTH-LC-CHL-004` | `S-PROTOCOL` | `M-CHALLENGE` | `D-ORDINARY` |
| `AUTH-LC-CHL-005` | `S-PROTOCOL` | `M-CHALLENGE` | `D-ORDINARY` |
| `AUTH-LC-CHL-006` | `S-BLOCKED-SELF` | `M-CHALLENGE` | `D-ORDINARY` |
| `AUTH-LC-CHL-007` | `S-PROTOCOL` | `M-CHALLENGE` | `D-ORDINARY` |
| `AUTH-LC-RST-001` | `S-NOT-VISIBLE` | `M-RESET` | `D-ORDINARY` |
| `AUTH-LC-RST-002` | `S-PUBLIC-API` | `M-RESET` | `D-ORDINARY` |
| `AUTH-LC-RST-003` | `S-PUBLIC-API` | `M-RESET` | `D-ORDINARY` |
| `AUTH-LC-RST-004` | `S-PUBLIC-API` | `M-RESET` | `D-ORDINARY` |
| `AUTH-LC-RST-005` | `S-NOT-VISIBLE` | `M-RESET` | `D-ORDINARY` |
| `AUTH-LC-INV-001` | `S-PUBLIC-API` | `M-INVITE` | `D-ORDINARY` |
| `AUTH-LC-INV-002` | `S-ADMIN-API` | `M-INVITE` | `D-ORDINARY` |
| `AUTH-LC-INV-003` | `S-ADMIN-API` | `M-INVITE` | `D-ORDINARY` |
| `AUTH-LC-INV-004` | `S-PROTOCOL` | `M-INVITE` | `D-ORDINARY` |
| `AUTH-LC-INV-005` | `S-PUBLIC-API` | `M-INVITE` | `D-INVITE-CLEANUP` |
| `AUTH-LC-INV-006` | `S-ADMIN-API` | `M-INVITE` | `D-ORDINARY` |
| `AUTH-LC-POL-001` | `S-BLOCKED-ADMIN` | `M-POLICY` | `D-ORDINARY` |
| `AUTH-LC-POL-002` | `S-ADMIN-API` | `M-POLICY` | `D-ORDINARY` |
| `AUTH-LC-AUD-001` | `S-NOT-VISIBLE` | `M-AUDIT` | `D-ORDINARY` |

## 6. Explicit Open Choices

Each choice is blocked until its named owner records a reviewed decision. A
current runtime fact is not approval to broaden or perpetuate unsafe behavior.

| Choice ID | Exact question and affected rows | Why current authority cannot answer | Safe blocked posture, owner/gate, downstream work |
| --- | --- | --- | --- |
| `AUTH-LC-CHOICE-001` | What exactly does account disable/re-enable do to sessions/families, outstanding MFA/passkey challenges, reset/invitation material, identities, password/factors, roles, notifications, and owner recovery? (`ACC-001/002`) | Schema and many consumers reject disabled accounts, but no transition service, atomic cascade, re-enable, or last-owner policy exists; anonymous TOTP/recovery challenge verification does not reload account availability after issuance. | Do not expose mutation. #788/#785/#394; manual owner-lockout/auth policy gate. Blocks server/contract/admin UI and #975 acceptance; acceptance must cover disable-between-challenge-and-verification races. |
| `AUTH-LC-CHOICE-002` | When may a password credential be disabled, re-enabled, or revoked, what happens to sessions, and when is verifier material erased? (`PWD-003/004`) | Verification states exist, but lifecycle runtime and terminal-material retention are absent. | Do not expose mutation; never retain verifier solely as history. #339/#788; auth/security, schema/privacy gates. |
| `AUTH-LC-CHOICE-003` | What proofs and remaining-sign-in-method checks permit unlink/relink, and what session response follows? (`ID-001`) | Only identity lookup plus `DisabledAtUtc` exists; OIDC runtime is absent. | No unlink UI/API. #787/#773/#785; provider, lockout, security, privacy gates. |
| `AUTH-LC-CHOICE-004` | How are product roles assigned, changed, or removed with last-owner, self-lockout, concurrency, current-claim/session and audit safety? (`ROL-*`) | Current rows lack general mutation/removal lifecycle; bootstrap/invitation insertion is not general role administration. | No general role mutation. #785/#464/#465; manual owner-lockout plus API/schema/UI gates. |
| `AUTH-LC-CHOICE-005` | What anti-lockout, policy-dependent step-up, completion-time policy revalidation, allowed source-state, concurrency/idempotency, session/challenge response, and terminal material-erasure rules apply to passkey/TOTP/recovery disable, re-enable, revoke, replace, use, expiry, and depletion? (`PKY-*`, `TOTP-*`, `RCV-*`, passkey `CHL-002`) | Current sequential revoke/replace/use works, but passkey sign-in completion does not recheck policy after options issuance, passkey/factor revoke accepts all non-revoked states, recovery revoke accepts and rewrites every owned batch state, concurrent TOTP starts can create multiple pending factors, factor/passkey/recovery mutations lack atomic guards, concurrent recovery generation/use is unsafe, and last-factor/session/terminal-secret policy is unproved. | Keep precise current behavior and classify policy-handoff, broad-state, repeat, and race outcomes partial; do not add disable/re-enable/admin reset/expiry runtime or claim secret disposition. #394/#775/#776/#465 and `REC-AUTH-PASSKEY-SESSION-001`; manual auth/recovery/secret/schema gate. |
| `AUTH-LC-CHOICE-006` | How are challenge terminal transitions made atomic, how long is safe metadata retained, and how is cleanup audited? (`CHL-*`) | Validity/attempt limits exist, but challenge completion uses ordinary tracked updates without a concurrency token/status-qualified consume; no retention clock, hold, cleanup, or copy-disposition rule exists. | Treat completion as sequentially implemented but concurrency-partial; terminal challenges stay unusable after commit; no purge authorization. #394 plus auth-retention follow-up; security/privacy/destructive gate. |
| `AUTH-LC-CHOICE-007` | How are password-reset issuance and consumption made atomic, what should dependency denial do to pending material, and what bounded retention/disposition applies to terminal rows and hashes, including replay evidence and `CleanupEligibleAtUtc`? (`RST-*`) | Concurrent issuance can leave multiple pending links; concurrent completion can read the same pending row without a status-qualified transition/concurrency token; dependency denial leaves a pending request reusable if the dependency recovers; the cleanup field exists but current service neither sets a cleanup time nor deletes/compacts rows. | Treat issuance/completion concurrency and denial disposition as partial; retain current rows; do not expose hashes or add cleanup. #339/#724; security/privacy/destructive gate. |
| `AUTH-LC-CHOICE-008` | What grace, idempotency/delivery, and cleanup-trigger authorization rules govern invitations, and should terminal cleanup hard-delete rows after 90 days or retain/compact row evidence with holds/dependency/copy proof? (`INV-*`, `POL-002`) | Disabled-plus-grace policy readout says public acceptance is enabled while the acceptance service requires capability `enabled`; each ready resend retry rotates again before delivery; and any well-formed anonymous acceptance request invokes global cleanup before abuse/policy/secret validation. Cleanup writes aggregate audit without proving trigger authority or aggregate evidence/holds/copies are sufficient. | Do not promise grace acceptance or retry idempotency, and do not broaden/treat the timer or public trigger as approved purge authority. Focused #784/#724 decision and later separate runtime task; manual provider/exposure/destructive/security/privacy gate. |
| `AUTH-LC-CHOICE-009` | What audit-event retention clock, duration, holds, authorized read/export and terminal disposition apply? (`AUD-001`) | Architecture says configurable/bounded but defines no value or runtime. | Retain; no ordinary removal or purge. #724/#774/#973; privacy/destructive/manual gate. |
| `AUTH-LC-CHOICE-010` | How long are expired/revoked session, family, and token-hash lineage records retained for replay/investigation, and when may sensitive lookup hashes be compacted? (`SES-*`, `REF-*`) | Validity is defined; post-terminal retention and copy disposition are not. | Keep unusable; no cleanup. #338/#1059/#724; security/privacy/destructive gate. |
| `AUTH-LC-CHOICE-011` | What mutation/version/effective-time/retention rules govern general security and invitation policy rows, and how do changes safely affect sessions/factors/owners? (`POL-001/002`) | Persisted shapes and invitation mutation exist; general security-policy mutation/lifecycle and complete cross-policy effects do not. | Use current safe read/default and bounded invitation mutation only. #394/#465/#784/#785; manual security/owner-lockout gate. |
| `AUTH-LC-CHOICE-012` | Which immediate responses may contain access/refresh issuance material, TOTP setup material, or recovery-code display-once material, and what no-redisplay proof is required? | Current runtime/contracts return them, while several canonical documents prohibit them in all API responses. Runtime evidence cannot resolve normative policy. | No behavior change here. `REC-AUTH-DOC-DRIFT-001`; manual auth/security policy gate, then separate runtime/contract/client tasks if the decision changes behavior. |
| `AUTH-LC-CHOICE-013` | Must account-wide session revocation query refresh families/credentials directly, and how should exclusion of the current session interact with a family shared by another selected session? What must “all sessions” promise? (`SES-003`, `PWD-001/002`) | `RevokeActiveSessionsForAccountAsync` filters access sessions by `ExpiresAtUtc > now` and derives family IDs only through credentials linked to those selected sessions. When password change excludes the current session, every family linked to it is removed from candidates even if another selected session shares that family. Current tests do not prove revocation of valid refresh authority linked only to an expired session or retained through that shared-family exclusion. | Describe current behavior as partial; do not promise universal refresh invalidation. Reuse #338/#339 in `auth-session-security`; manual auth/security gate before a focused runtime fix and later contract/client wording. |

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
| Account-wide refresh-family revocation completeness | #338/#339; `auth-session-security` | Resolve `AUTH-LC-CHOICE-013` so sign-out-all/change/reset wording matches exact lineage and current-session shared-family exclusion behavior; separate runtime first, then contract/client copy. Manual auth/security gate. |
| Account/credential/identity/role lifecycle decisions | #788/#785/#787/#339; `auth-session-security`, later split schema/contract/admin UI lanes | Resolve choices 001–004 with last-owner/recovery safety. Manual auth/owner-lockout gates. |
| Factor/passkey/recovery lifecycle and terminal material | #394/#775/#776/#465; `auth-session-security`, split schema/contract/client lanes | Resolve choice 005 without recreating merged runtime. Manual recovery/secret/security gates. |
| Challenge retention/abuse | `REC-AUTH-MFA-SIGNIN-001` and `REC-AUTH-ABUSE-001`; docs decision then split runtime/config lanes | Resolve binding, expiry/replay/attempt and cleanup choices. Manual security/proxy gates. |
| Passkey sign-in handoff | `REC-AUTH-PASSKEY-SESSION-001`; docs decision then split auth runtime and contract lanes | Keep completion-time policy revalidation, challenge atomicity, and credential/session handoff with the #965 owner; #721 adds lifecycle wording only. |
| Reset retention and atomicity | #339/#724; `auth-session-security` plus later retention-policy lane | Define atomic issuance/consume, dependency-denial disposition, bounded terminal row/hash disposition, and cleanup evidence. Manual security/privacy/destructive gates. |
| Invitation grace and retention cleanup | #784/#724; focused docs decision, then separate `auth-session-security` runtime if approved | Reconcile grace readout with acceptance enforcement and the anonymous pre-validation cleanup trigger; decide whether current 90-day hard delete preserves sufficient row evidence/holds and meets shared disposal gates. No automatic implementation issue is created. |
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

This document must retain exactly 54 unique `AUTH-LC-*` transition rows and 13
unique `AUTH-LC-CHOICE-*` records, all required record families, valid relative
links, exact source/test/symbol existence,
secret-material exclusions, one-path scope, no runtime diff, shared-template
field coverage, strong independent review, local auth/security factual review,
exact-head CI/GitHub review, and zero unresolved actionable threads. Any source
change invalidates earlier candidate-bound validation and both fresh reviews.
