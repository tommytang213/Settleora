# Settleora Auto-Runner Tooling

## Authenticated terminal validation-retry projection

Deployment admission and targeted startup recovery share one read-only
projection for the narrow crash window where the immutable root recovery
remains at `checkpoint_validation_commit`, while the lifecycle controller,
report, and mutation authority plus the successor iteration state and runner
summary have already stopped fail-closed. The projection authenticates the
root recovery, lifecycle, latest successor state, exact runner summary, and
supervisor spec; binds their task, claim, charge, branch, candidate, and
no-effect identities in one digest; and changes only the in-memory effective
phase, stop reason, and next action.

The raw recovery file is never normalized or rewritten. A lifecycle recovery
operation with `status=pending` is intentional for the exact validation-retry
derivative reopen contract and is not treated as incomplete mutation authority
when the controller/report/authority posture and all successor evidence are
terminal. Missing, conflicting, later, unsafe, or mismatched evidence fails
closed. Normal terminalization writes the lifecycle before the root recovery;
a crash between those crash-safe writes is recovered by this projection,
while a completed sequence persists the terminal root normally.

## Production capability and canary lane admission

An owner-only external production profile may enable bounded follow-up issue
creation and review-fix mutation together only when normal trusted operation,
approved-domain auto-merge, a verified external runtime identity and manifest,
an external config path, and the existing review-fix hard bound are explicit.
Source-tree or arbitrary-path profiles cannot satisfy this production
capability approval. Stale-claim stealing and systemd
self-enablement remain incompatible with that production approval. Individual
issue contracts, lane policy, exact-head review/validation/check gates, and
follow-up deduplication still fail closed; enabling both capabilities does not
let one issue expand another issue's allowed paths or authority.

For a low-risk auto-merge canary, the active profile's
`autoMergePolicy.approvedLanes` is also an admission boundary. A historical
canary in another otherwise supported low-risk lane is rejected before
implementation. This lets a task-scoped `workflow-docs-tooling` profile coexist
with retained client-UI canary evidence without claiming or modifying it.

Reviewer secret metadata accepts the retained legacy owner-only reviewer
location and the fixed project namespace
`/workspace/logs/auto-runner/Settleora/secrets`. Both remain strict regular,
non-symlink, owner-only boundaries; arbitrary external secret roots are refused.

## External runtime and managed repository separation

The controller now has five explicit identities: `runtimeRoot`, `repoRoot`,
`logsRoot`, `projectId`, and `repositorySlug`. Development configs may set
`runtimeMode: "development"` and point `runtimeRoot` at this directory. A
trusted profile must set `runtimeMode: "external"` and is accepted only when
the executing module tree equals `runtimeRoot`, its versioned manifest and
digest verify, and runtime, repository, `.git`, and project logs are disjoint
canonical real paths, including a resolved linked-worktree or separate Git
common directory. Project Git commands continue to use `repoRoot`;
controller-owned children use absolute entries below `runtimeRoot`.
The first trusted non-observer preflight creates an owner-only
`.project-namespace.json` marker in `logsRoot`; every later process verifies
that marker before reading project state, so a logs directory cannot be
adopted by another repository that reuses the same project ID.

`deploy-runtime.mjs` is an explicit stopped-runner utility. It builds a sorted
generic-only manifest with per-file SHA-256/mode, a file-list digest, bundle
digest, source SHA, entry points, and Node constraint. It copies to a sibling
incoming directory, verifies the copied bundle, runs syntax/import smoke
checks there, and uses expected-old-digest protected atomic handoff with one
bounded rollback directory. It never writes a project profile or starts,
enables, reloads, or restarts a service.

Production entry points are imported through the stable sibling
`/workspace/auto-runner/.runtime.launcher.mjs`. The deployer creates that
verified launcher on first install. During an expected-old-digest protected,
quiescent upgrade, it may atomically replace the stable launcher only when the
installed launcher matches the launcher inside the verified old bundle; all
other mismatches fail closed. The old bundle's approval is refreshed after
that replacement so an interrupted upgrade remains safely retryable. Rollback
exchanges the verified runtime directories, then atomically restores the
launcher embedded in the newly installed bundle before writing its approval;
either crash gap therefore fails closed and can be adopted on retry without
pairing a retained bundle with another bundle's launcher.
Before importing any replaceable bundle module, the launcher checks the
deployment lock and records a PID plus process-start identity in the shared
consumer directory. It also evaluates the Node version against the constraint
from the already verified manifest bytes. The bounded grammar accepts only a
stable numeric version inside a strict `>=major <major` interval; missing,
malformed, contradictory, prerelease, or unsupported values fail before entry
evaluation. Production preflight applies the same approved `>=22 <23` rule.
Deployment reclaims only markers whose process-start
identity is stale and otherwise refuses the handoff. The deployment lock uses
the same PID-birth proof and an OS-released `flock` acquisition guard, so
concurrent stale-lock recovery stays serialized, guard ownership is released
on process exit, and a crashed deploy can be reclaimed safely before the
atomic exchange is reconciled. Repository
authority lock identities canonicalize GitHub slugs case-insensitively, so
separate clones or differently cased remote spellings cannot gain two owners.
Each authority lock stores both PID and process-birth identity. An owner-only
per-repository `flock` guard serializes inspection and replacement: a matching
live owner blocks, PID reuse is stale, and only a trusted owner-only regular
lock whose recorded owner is proven stale is replaced. Corrupt, partial,
symlinked, foreign-owned, or writable authority state fails closed. A crash
releases the OS guard, so unattended restart can retry without deleting lock
state manually or broadening task/branch authority.
Deployment `--dry-run` performs the source, manifest, quiescence, and consumer
inspection without creating locks, consumer directories, or other deployment
control state; its Git inspection disables optional index locks and repository
filesystem-monitor hooks. Trusted profile reads accept only a direct JSON
child of `/workspace/auto-runner/config` after verifying that fixed root and
each ancestor are canonical, runner- or system-owned, and not writable by
another principal. Manifest source verification disables local Git replacement
objects, and project namespace markers store the same case-normalized
repository slug used by repository locks and runtime identity.

Trusted deployment loads both the active external config and its approved
profile before quiescence inspection. The authenticated config supplies the
only project `logsRoot`; an explicit `--logs-root` is a compatibility assertion
and must equal it exactly. Repository, runtime, project ID, repository slug,
namespace marker, manifest, approval, launcher, and health-unit identities are
bound into one deterministic project-authority digest. A parent, ancestor,
sibling, symlink alias, namespace mismatch, containment mismatch, foreign
owner, or writable path fails before operational state can be described as
quiescent. `--development-unbound-project-root` is an explicit test/development
mode and refuses the trusted runtime and project-log namespaces.

A trusted first installation has a separate bounded bootstrap posture when the
configured runtime destination is absent. It authenticates the same external
config/profile, repository, project logs and namespace marker, destination
parent, and health unit; requires the source bundle digest to equal the config's
authenticated target digest; and refuses stale installed or transient runtime
state. Bootstrap admits only ordinary quiescent deployment: rollback,
preserved-recovery, semantic-incident evidence, and expected-old authority are
all unavailable. Once a runtime exists, the full installed manifest, approval,
launcher, and runtime identities are mandatory again.

Deployment remains fail-closed for every non-terminal recovery or pre-effect
intent by default. One preserved validation-recovery checkpoint may be
admitted only when the operator supplies the complete fixed
`--preserved-recovery-*` option set: repository, issue, full task key,
runner/supervisor IDs, claim, charge ID, branch, base/head/tree, changed-file
digest, bounded raw-diff digest, report/prompt basenames, and all four
logical-task counters. The raw-diff digest must match both persisted candidate
identities and the trusted base-to-head Git diff. Partial,
duplicate, unknown, contradictory, or extra options are rejected. The
read-only verifier requires one canonical recovery after the existing
provisional/full-key suppression rule, exact charge/lifecycle/candidate/commit
proof, terminal intents or an exact prepared comment with authoritative
absence/presence reconciliation, and no live owner. Its output is sanitized
structured evidence with a target-identity digest and reason code.

For the recognized validation-retry derivative, lifecycle admission is a
closed set. It accepts the exact terminal pre-adoption posture, the exact
ownerless `checkpoint_validation_commit` pending handoff created by
`validation_retry_derivative_reopened`, or the exact completed active
request-bound successor. Pending and active postures must retain the same
operation, completed-effect evidence, counters, report/candidate identity, and
one-generation handoff lineage. The active successor is recomputed from the
original run, recovery operation, and handoff request; a merely recorded
owner/successor is insufficient. The handoff request itself is recomputed from
the recovery operation and retired session. Every other active or nonterminal posture
remains deployment-ineligible.

Admission also proves the Git authority that the later resumed runner will
inherit, not only the sanitized deployment reads. Bare `git` must resolve to
trusted `/usr/bin/git`, and the canonical origin must use HTTPS because SSH
configuration can delegate to ambient executable helpers. Loader,
repository-redirection, and other
effect-bearing `GIT_*` and `SSH_ASKPASS*` environment variables are rejected. The
stable-launched supervisor rechecks the actual runner-child environment before
any recovery Git read, requires `GIT_NO_REPLACE_OBJECTS=1`, and passes that
exact inspected environment to the child. It also repeats the complete
repository/worktree/global/system Git configuration, hook, attribute, remote,
and transport-authority proof before that first read. Repository and
worktree config must contain no executable or transport override, recognized
default hooks must not be executable, and global/system config must match the
bounded installed GitHub credential-helper and inert standard Git-LFS shapes.
System Git-LFS definitions are accepted only when neither committed, local, nor
default user/system attribute files can select a filter. Any default attribute
artifact or other global/system entry fails closed.

One legacy compatibility case remains inside that same proof: an absent or
blank nested continuation repository field may be treated as omitted only
when the explicit target, claim, accepted-task charge, lifecycle, every
target-correlated intent, logs namespace, canonical repository root, and exact
fetch/push authority all identify the same repository. A non-empty
contradiction blocks, and deployment never rewrites the operational record.

Intent admission is target-partitioned. Unrelated `failed_closed` intents are
ignored only after trusted parsing, terminal-state proof, duplicate rejection,
and inactive-owner proof. Exact finalized target intents are completed
crash-window evidence rather than new authority. An exact prepared comment is
accepted only when paginated authoritative GitHub readback proves either
absence safe for later execution or one exact fingerprint match safe for
adoption. Inspection never transitions an intent. Before a generic nonzero
refusal, the CLI writes one bounded `deploymentQuiescence` JSON diagnostic to
stderr so an operator does not need to import a private verifier.
When a terminal-derivative projector denies the checkpoint, that diagnostic
keeps the compatibility `reasonCode` and also returns the finite nullable
`projectionFailureReasonCode` and `projectionFailureClass` fields. These fields
are propagated unchanged by deployment-quiescence inspection; they never
contain artifact paths, payloads, exception messages, or mutation authority.
Successful and ordinary non-overlay inspection returns both fields as `null`.

The exact missing-PR validation-retry derivative uses that same identity-first
reconciliation. Its finalized validation-failure label add/remove intents are
completed hygiene history, while its prepared validation-failure comment still
requires the authoritative absence-or-one-exact-match proof above. Finalized
push, PR, merge, closure, comment, or other history that contradicts the
derivative's exact no-remote/no-PR lifecycle blocks; prepared non-comment
effects also block. Completed hygiene never authorizes a new label mutation.

For a non-dry deployment, this proof is read initially, read again after the
deployment lock is acquired, and read a third time immediately before launcher
or runtime exchange. Runtime consumers and source bytes are also rechecked.
Any drift stops before installed-runtime exchange. The exception is never
available to rollback and never excuses a pending push, PR, merge, comment,
closure, label, hygiene, cleanup, or branch effect.

An authenticated overwrite incident has a separate deployment-only admission;
it is not converted into a legacy preserved recovery. The optional
`--semantic-deployment-evidence` argument names `deployment-evidence.json`
inside one canonical owner-controlled package directory directly beneath the
trusted external-profile root. The package has exactly ten members: that
document, one package manifest, and one distinct canonical projection for each
of the eight authority classes. Extra entries, nested paths, links, unsafe
modes/owners, noncanonical JSON, manifest drift, and final/incoming/retired
residue fail closed. It selects canonical read-only evidence stores whose eight
source classes, claim-owner matrix, verifier set, incident,
Git/task/run/counter identities, runtime artifacts, and no-effect posture all
agree with an exact target selector. Exactly one associated unresolved
recoverable state and no active operational owner are required. The result is
`semantic_incident_deployment_only_admitted` and binds deterministic document,
package/member manifest, aggregate, semantic manifest, and evidence digests
into every repeated quiescence proof.

`prepare-semantic-deployment-evidence.mjs` is the manual-only source-owned
preparer. `--plan` authenticates the external config/profile, installed
runtime, health unit, repository, exact incident, exact associated recovery,
all run roles, lifecycle, budget, Git candidate, and GitHub no-effect posture,
then prints one deterministic plan without creating a file, directory, lock,
or marker. Each class-specific extractor derives only matrix-owned claims from
its own fresh authenticated domain reread, including a fresh project-authority
load and direct artifact-byte authentication; no production extractor reuses
the orchestrator's collected context. The claim-owner matrix performs the only
cross-class merge and rejects drift between those independent reads. A complete
final equality reread is required immediately before package publication or
adoption.
Repository evidence additionally requires canonical clean
`main`/`origin/main`, a still-unmerged literal candidate ref, and clean linked
worktrees. Every Git command disables hooks and executable fsmonitor authority,
and final collection reauthenticates config and repository/worktree topology.
Intent evidence binds the exact prompt, report, finalized commit
intent, subject, tree, and paths. GitHub evidence uses the fixed trusted CLI
with a sanitized environment and fingerprints the exact issue-comment
checkpoint without persisting comment bodies. `--create-or-adopt` is a
separately authorized external operation:
it stages owner-only canonical members in the one fixed sibling `.incoming`
directory, fsyncs every file and the directory, and atomically renames the
whole directory, or adopts exact existing bytes idempotently. It never cleans
conflicting residue. Publication uses a no-clobber atomic directory move, and
authentication rereads every member after the complete aggregate read. The
staged manifest is a `0400` inert publication seal: a package moved through a
pathname substitution cannot authenticate at the final path. Only after the
moved directory and all retained member descriptors match does the preparer
commit that exact manifest descriptor to `0600` and fsync it. An exact crash-
published inert final is resumable only through a later explicit create-or-
adopt invocation. Final adoption fsyncs every member, the package directory,
and the config root before success. The preparer never reads a grant or creates
a successor.

Plan shape (replace selectors with authenticated exact values):

```bash
node tools/auto-runner/prepare-semantic-deployment-evidence.mjs --plan \
  --config /workspace/auto-runner/config/<project>.json \
  --approved-profile /workspace/auto-runner/config/<approved-profile>.json \
  --health-unit /absolute/path/to/<project>-auto-runner-health.service \
  --repo-root /absolute/path/to/repository \
  --runtime-root /workspace/auto-runner/runtime \
  --incident /absolute/project/logs/recovery/<incident>.json \
  --incident-sha256 <64-lowercase-hex> \
  --associated-recovery /absolute/project/logs/recovery/<associated>.json \
  --associated-recovery-sha256 <64-lowercase-hex> \
  --package-name settleora-semantic-deployment-evidence-<authorization-key>
```

Changing `--plan` to `--create-or-adopt` is the external mutation and requires
a future authorization naming the exact package root and planned members.

The overwrite incident and associated recovery remain two immutable read-only
authorities. The incident binds its own path/SHA and original task/run lineage;
the associated recovery binds a distinct path/SHA/state digest and must be the
single discoverable provisional predecessor. Their task-key prefix, issue,
claim, charge, branch/base, candidate head/tree/diff, original roles,
lifecycle generation, counters, phase/actions, creation lineage, and no-effect
posture must agree. Both artifacts must retain the complete canonical PR
object with every field null and must have null generated-work, feature-bundle,
and outage-resubmission authority. The associated state may contain only its exact
claim/charge/branch markers and must contain no continuation, generated work,
local evidence, comment/close marker, or other external-effect marker. Literal
path equality is forbidden, not required.

The descriptor-authenticated external document is the sole authority for this
deployment-only attestation. It must state the exact
`runtime_deployment_quiescence_only` scope and bind deterministic digests of
the target, all eight source descriptors, and all runtime/incident artifacts.
The eight owner-controlled source projections are mandatory corroboration;
their agreement is not represented as protected or operational provenance.
When the authenticated runtime config already has `postIncidentRecovery`, the
document's provenance and packet must equal that configured value exactly.
When it is absent, adding this owner document remains a separate external
owner action; repository code neither synthesizes nor installs it.

This verifier exposes only `runtime_deployment_quiescence_only`. It never reads
or consumes an operation grant, invokes a protected producer, calls successor
execution, constructs or persists a successor, creates a claim/charge/
submission, or grants product-task continuation. Unexpected grant-shaped files
or document fields cannot expand it. Rollback rejects semantic evidence.
The supervisor binds the already admitted canonical profile path and its
SHA-256 into the immutable run spec; the installed unit therefore contains no
hard-coded active-profile path, and the worker never reconstructs the profile
under `logsRoot`. Development profiles remain confined to their approved
project-log config roots, while an external profile remains confined to the
fixed `/workspace/auto-runner/config` root. The runner child receives the
spec's expected profile SHA-256 and refuses admission if the profile is
replaced between supervisor verification and child startup.

The reviewed supervisor unit source is a placeholder template, not an
installable singleton. Manual activation renders it for one admitted
`projectId`, `runtimeRoot`, and `logsRoot`, installs it as
`<projectId>-auto-runner@.service`, and retains the rendered bytes for
pre-start identity comparison. #912 completed this process for Settleora using
the legacy-compatible `settleora-auto-runner@.service` identity; a future AppB
profile would select `AppB-auto-runner@.service`. The rendered working
directory and every controller-owned executable remain runtime-bound.

Manual operator command shapes (not executed by issue #951; the Settleora
external posture was subsequently accepted by #912):

```bash
node /workspace/repos/Settleora/tools/auto-runner/deploy-runtime.mjs \
  --repo-root /workspace/repos/Settleora \
  --source-root /workspace/repos/Settleora/tools/auto-runner \
  --destination /workspace/auto-runner/runtime \
  --config /workspace/auto-runner/config/settleora.json \
  --approved-profile /workspace/auto-runner/config/<approved-profile>.json \
  --health-unit /home/<runner>/.config/systemd/user/settleora-auto-runner-health.service \
  --approved-sha <reviewed-40-character-sha> \
  --expected-old-digest <installed-bundle-digest> \
  --dry-run

node /workspace/repos/Settleora/tools/auto-runner/deploy-runtime.mjs \
  --repo-root /workspace/repos/Settleora \
  --destination /workspace/auto-runner/runtime \
  --config /workspace/auto-runner/config/settleora.json \
  --approved-profile /workspace/auto-runner/config/<approved-profile>.json \
  --health-unit /home/<runner>/.config/systemd/user/settleora-auto-runner-health.service \
  --rollback \
  --expected-old-digest <current-bundle-digest> \
  --expected-rollback-digest <retained-rollback-bundle-digest>

# MUTATING: starts the normal product queue. #912 proved this command only by
# dry-run; it was not executed. Run it only with explicit operator intent.
node /workspace/auto-runner/.runtime.launcher.mjs --runtime-root /workspace/auto-runner/runtime \
  --entry settleora-auto-runnerctl.mjs -- submit --mode trusted \
  --config /workspace/auto-runner/config/settleora.json \
  --max-tasks 500 --max-runtime 14d --json
node /workspace/auto-runner/.runtime.launcher.mjs --runtime-root /workspace/auto-runner/runtime \
  --entry settleora-auto-runner.mjs -- --status --json --config /workspace/auto-runner/config/settleora.json
node /workspace/auto-runner/.runtime.launcher.mjs --runtime-root /workspace/auto-runner/runtime \
  --entry settleora-auto-runner.mjs -- --stop-after-current --config /workspace/auto-runner/config/settleora.json
node /workspace/auto-runner/.runtime.launcher.mjs --runtime-root /workspace/auto-runner/runtime \
  --entry settleora-auto-runnerctl.mjs -- status --latest --json --config /workspace/auto-runner/config/settleora.json
```

Non-dry deploy and start/profile commands require an accepted project-specific
manual activation. Settleora has that #912 acceptance; future projects do not
inherit it. Rollback is a stopped-process atomic exchange of the retained
sibling `.runtime.rollback` after verifying its manifest and expected digest;
no automatic rollback or restart authority is granted.

### Pre-Node systemd environment contract

Every supported Node-launching repository unit starts with the root-owned
system `/usr/bin/env -i` and passes the canonical absolute Node executable as
its first command; it never uses `/usr/bin/env node` or a runtime-owned
pre-Node helper. Supervisor rendering binds and read-backs the exact argv.
Settleora's fixed health/notifier templates support `/usr/bin/node`; another
host must render and verify an equivalent canonical identity rather than
relying on `PATH`.

Supported activation requires systemd 235 or newer (the release that provides
final `UnsetEnvironment=` processing), Node 22, a root-owned non-symlink Node
binary whose root-owned canonical ancestor chain is not group/world writable,
and a canonical home directory owned by the service account beneath a
root-owned non-writable ancestor chain. `/usr/bin/env -i` constructs the child environment from nothing;
`UnsetEnvironment=` additionally removes documented Node startup/module/cache/
coverage/debug/OpenSSL controls plus dynamic-loader, shell-startup, Git, SSH,
and askpass controls as defense in depth. The unit supplies only:

- supervisor/runner/children: `HOME`, `USER`, `LOGNAME`, fixed `PATH`,
  `LANG`, `LC_ALL`, `TMPDIR`, systemd-derived `XDG_RUNTIME_DIR`, the matching
  fixed user-bus `DBUS_SESSION_BUS_ADDRESS`;
- health: the same non-secret base only; host, port, logs root, secret-file
  path, and config are fixed reviewed argv/config inputs;
- notifier: the same non-secret base only; config and owner-controlled
  notifier credential-file paths are reviewed inputs.

There is no service `EnvironmentFile=` compatibility path. Unknown, duplicate,
malformed, executable, or oversized environment-file entries therefore cannot
enter the process tree at all. Provider secrets are read only by the existing
bounded owner-controlled credential-file readers when needed; they are not
present in Node, Git, Codex, health, notifier, argv, unit readback, or reports.
Unsupported systemd/Node identities and drifted unit/drop-in/readback evidence
fail before activation. This contract does not claim protection from a
malicious kernel, root administrator, replaced systemd, or replaced trusted
system binaries.

Repository source review, reviewed runtime-bundle deployment, unit
installation/daemon reload, and service activation are separate trust
boundaries. A repository merge performs and authorizes none of the latter
three.

A rollback to a runtime generation whose controller predates this unit
contract cannot submit another unit: byte-for-byte readback fails closed.
Restore a boundary-aware runtime before further submissions; never reinstall
the legacy `/usr/bin/env node` unit as a compatibility downgrade.

## Final ephemeral cleanup

`ephemeral_cleanup_v1` requires positive ownership plus complete live merge,
ancestry, current-target acceptance, hygiene, dependency, active-state, ref,
and worktree proof. Remote absence is adopted, never repaired in this completed
state. Exact expected-old-SHA leased remote deletion, clean disposable
worktree removal, and ancestry-checked expected-old-SHA local-ref deletion are
checkpointed and read back. Failure reports
`cleanup_required` without changing merge success. Historical, protected,
release, manual, unowned, dirty, active, shared, symlinked, ambiguous, or
referenced state is never deleted.

## Recursive source-failure convergence

`source-failure-convergence.mjs` defines the versioned, bounded record used by
ordinary continuation for local validation, GitHub checks, CodeQL, Semgrep,
Trivy, Gemini, local Codex, and GitHub Codex findings. Records are sanitized,
exact-candidate bound, fingerprinted, frozen, and deduplicated; raw provider
payloads, logs, prompts, diffs, environment data, credentials, and scanner
artifacts are not persisted.

Only structured in-contract `source_fix_safe` batches enter the shared focused
source-fix handler. A new source identity invalidates prior evidence and
restarts full validation plus fresh independent and local Codex review before
push. Pending/transient failures wait or retry without mutation; auth, manual,
unsupported, out-of-contract, ambiguous, suppression/dismissal, and repeated
no-progress batches stop fail-closed. Existing two-loop counters and the one
accepted logical-task charge remain authoritative. Ordinary
`mobile-application` validation also runs the fixed trusted Android debug APK
build; unsupported platforms remain exact-head external proof.

Failed validation is authorized through a distinct source-failure mutation
decision; ordinary review-fix authorization still requires a passing
candidate. GitHub wait results retain a bounded final exact-head inspection so
a pending check that later fails can enter this classifier. GitHub finding
fingerprints remain prepared, not consumed, until a replacement commit is
confirmed; crash recovery resumes the same reserved epoch and adopts the
new-head effect before recertification.
Existing-PR prospective synthetic-merge validation failures use the same
canonical validation extractor after the checkout is restored to the exact
clean authenticated source branch/head and current-main authority is
reconfirmed. Exact merge-tree and synthetic-commit identity is required before
classification. Source-fixable diagnostics reserve the normal GitHub fix epoch;
transient, ambiguous, out-of-contract, or identity-drift evidence retains its
ordinary bounded retry or fail-closed result.
Historical recovery validates repository-local and linked-worktree Git
authority before fetching current `main`; that fetch uses the fixed Git binary
and a sanitized environment that disables system/global configuration,
credential helpers, hooks, executable diff/filter configuration, SSH command
overrides, replace refs, alternate objects, and local/ext transports. Existing
PR adoption additionally requires one exact completed push marker and one PR
marker plus their finalized canonical intents, the durable PR record,
current-main authority, and the remote-tracking branch to agree on the
repository/task/claim/charge, branch, PR URL/number/base, and exact head.
If a focused repair exposes another actionable validation defect, the new
candidate is committed and re-enters the same bounded classifier instead of
terminating after one round. Canonically named platform checks are translated
from the exact-head GitHub inspection, and scanner alert paths must satisfy
both the task contract and lane manifest before a fix epoch is authorized.

## Post-implementation continuation authorities

Ordinary post-implementation work uses one durable continuation authority from exact candidate reconciliation through validation, dual and structured review, convergence, push/PR recovery, GitHub gates, merge, and post-merge hygiene. Startup recovery re-enters that authority at the earliest incomplete exact-head phase; loading a large-review checkpoint is not a terminal success.

Historical initial-candidate reconstruction does not equate a task's recorded
base with today's `origin/main`. It accepts an advanced main only after one
shared verifier proves complete ungrafted Git ancestry from the authentic base,
the candidate's exact single-child topology and bytes, its literal branch ref,
the canonical repository/remote and trusted Git environment,
and the matching recovery/lifecycle/charge/checkpoint/finalized-commit-intent
authority with no later push, PR, merge, or replacement-candidate effect.
The only pre-PR exception is exact terminal validation-failure bookkeeping
from the authenticated original outcome: two finalized hygiene components
(add only `auto-failed`; remove only `auto-running` and `auto-claimed`) and one
prepared issue-comment intent whose canonical bounded body digest is read from
that unique authenticated intent rather than reconstructed from sanitized
summary text. Every identity,
lifecycle generation/session, charge, branch/base/candidate, terminal outcome,
and live label must agree, with no remote task branch, PR, push marker, or
other external effect. Admission performs no GitHub or durable-state mutation.
The two hygiene intents share the exact finalized candidate-commit
session/generation; the prepared comment is owned by the exact current terminal
generation and cites the immediately preceding retired generation. That
immediate predecessor must be the last retired session, while the recovery
session derived from the exact operation must remain present in retired
history across later handoffs. The predecessor must carry the
validated-successor handoff diagnostic into the request-bound successor. A
bounded, paginated live issue read must prove that zero or one comments match
the canonical body digest.
Missing, duplicated, differently fingerprinted, executing, finalized-comment,
failed-closed, payload-mismatched, label-contradictory, foreign-owner,
generation-drifted, later, or unreadable evidence fails closed. Authenticated
existing-PR recovery remains a separate authority and is not broadened.
The clean current-`main` control-plane checkout may remain in place. Recovery
reuses an exact linked task worktree only when its durable ownership marker
already matches, or materializes one for the already authenticated literal
branch through the canonical durable pre-effect intent executor and records
ownership only after exact effect readback. A restart between creation and the
ownership marker adopts only that deterministic intent-bound worktree. Before
the startup lifecycle collector, read-only preparation authenticates the exact
task ref and objects without creating a worktree or granting mutation authority: process,
lease, issue, charge, and checkpoint authority remain control-plane reads,
while the collector records distinct control-plane Git and task-workspace Git
evidence and compares candidate identity only with the latter. After lifecycle
takeover, the validation handler materializes the exact workspace and repeats
repository/common-dir/config/ref/head/cleanliness authentication from that
isolated workspace before validation resumes. It never rewrites the
preserved branch or creates a replacement branch. Post-merge cleanup restores
the admitted control-plane repository context before another task iteration.
An already committed pre-push source fix is resumable only as an exact
one-parent descendant chain whose every step has one matching finalized commit
intent and stays inside the original candidate path allowlist.
Incomplete, shallow, alternate, replaced, grafted, divergent, ambiguous, or
contradictory evidence has a stable fail-closed result.

Proven feature-bundle splits are materialized by the bundle authority from frozen checkpoint commit ranges. Each concrete file belongs to exactly one slice, branch and PR reuse is exact-head/base bound, dependent slices retain their parent-branch PR base, and verified split PRs are handed to the existing PR-stack executor. Ambiguous ownership, branch/PR conflicts, missing execution authority, or semantic-delta mismatch block before further mutation.

## Canonical mutation consumer contract

When session lifecycle authority is enabled, production mutation consumers use
one durable pre-effect contract for Git commits and pushes, PR creation and
transitions, exact-head merge, comments and review replies, issue closure, and
component-wise post-merge/docs hygiene. Each consumer persists its exact
intent before mutation, revalidates the active run/session/generation and
task-charge identity, reads authoritative Git or GitHub state, executes only
when the effect is safely absent, reads the exact result back, and then
atomically confirms or adopts it. An unavailable read or an uncertain command
result remains pending for later reconciliation; it is never converted into a
terminal marker that could hide a successful crash-window effect.

Ordinary implementation, feature-bundle, review-fix, existing-PR stack, and
docs-hygiene state may all carry the same lifecycle authority. Stack state
preserves that authority through retarget, ready, merge, and final hygiene.
Startup/supervisor recovery discovers only owner-trusted pending intent files
and recognizes the persisted identities for commit, push, PR transition,
merge, comment/reply, closure, hygiene, and branch retention. Duplicate-like,
wrong-head, wrong-base, wrong-issue/PR, or contradictory live candidates fail
closed. Legacy mutation markers remain compatibility projections and cannot
adopt a crash window.

This directory contains the DevBox-native unattended Codex auto-runner skeleton.
It is issue-label driven and writes all mutable runtime state under
`/workspace/logs/settleora-auto-runner/`.

Current end-state audit: #880 monitoring acceptance is complete, #887 through
#893 are completed foundation children, and PR #907 merged the final #889
high-risk lane correction from exact source head
`9472142f69b5db443d1d1693f4a68e38e491d96f` as merge SHA
`e58340855ab5f700342ce1bfa02d12d2e287b5b3`. PR #908 then merged the final
closure documentation from exact source head
`f12d3ad1721506d1b9fa3d72f78a1417d457ff85` as current-main merge SHA
`4cbb807d09eb732699fb82acc0336f985b94b617`. Final current-main validation,
GitHub checks, and code-scanning proof passed after that merge. #800, #894,
and #889 are closed completed. The current restrictive defaults are
fail-closed deployment defaults, not a permanent low-risk-only design. See
`docs/planning/AUTO_RUNNER_END_STATE_GAP_AUDIT.md` and
`docs/planning/AUTO_RUNNER_FINAL_ACCEPTANCE_894.md` for the current evidence
matrix. #902 remains the next separate post-foundation enhancement and is not
implemented yet. Completing the runner foundation does not mean the Settleora
product Day 1 milestone is complete. Genuine manual actions remain manual.

Approved-domain auto-merge remains default-off. Enabling `allowAutoMerge` is
not enough: external config must also set `autoMergePolicy.approvedLanes` to a
bounded list of supported canonical runnable lane IDs and keep required
CI/security check names explicit. All observed exact-head checks must pass; `SKIPPED` or
`NEUTRAL` conclusions pass only for explicitly allowlisted canonical check
names. The merge gate then still requires the issue contract to be
auto-merge eligible, no manual action or split requirement, exact contract and
lane path matches, exact-head validation evidence, independent external review,
Codex mechanics/security review, GitHub checks, code scanning, clear review
threads, open issue state, and unchanged base/head. Supported sensitive lanes
and high-risk lanes can be approved this way when their exact lane contract,
paths, validation, strong review, Codex review, CI, scanner, issue-state, and
final refresh gates pass. Genuine manual decisions and actions remain manual:
production deploys, mobile store/TestFlight/Play submission, destructive
migration or data execution, secret/auth credential or auth-config mutation,
public/admin/network exposure, branch cleanup, force-like history changes,
Day 1 scope cuts, architecture replacement, and unresolved product, policy,
authorization, privacy, security, or financial authority decisions.

Generated follow-up work remains default-off through
`allowFollowupIssueCreation=false`. When explicitly enabled for a trusted run,
the runner now uses the generated-work proposal pipeline rather than ad hoc
issue creation: it validates proposal schema, idempotency/correlation,
duplicate evidence, labels, paths, contracts, validation profiles, reviewer
tiers, and manual-decision classification before mutation. Sanitized intent
and result evidence is written under
`/workspace/logs/settleora-auto-runner/generated-work/`.

Post-merge issue hygiene is componentized. A successful exact-head merge stays
`merged` even if later closure, comments, label cleanup, parent progress,
project status, or ledger reconciliation partially fails. Narrow issues close
only when their explicit close rule is satisfied; umbrellas such as #800 and
partially complete issues stay open with evidence-backed progress comments.

Recovery and continuation state is centralized under
`/workspace/logs/settleora-auto-runner/recovery/`. The state is versioned,
sanitized, written by temporary file plus rename, and records issue/run/
supervisor/task correlation, branch/base/head, PR linkage, current phase,
first incomplete action, retry attempts by outcome class/fingerprint,
head-bound validation/review/CI/scanner evidence, bundle/generated-work
linkage, idempotent mutation markers, bounded stop reasons, and the next safe
action. Head-changing actions invalidate local validation, external review,
Codex mechanics/security review, CI, code-scanning, merge/final-refresh, and
post-merge expectation evidence tied to older heads. Startup checks this
recovery root before polling unrelated issues; with recovery capability
default-off it fails closed for operator review instead of adopting arbitrary
work.

Session rotation and reportless-interruption decisions use the coordinated
version-1 authority in `lib/session-lifecycle.mjs`, persisted under
`/workspace/logs/settleora-auto-runner/session-lifecycle/`. It preserves the
same logical-task charge, claim, branch/PR/candidate identity, convergence
counters, findings, reservations, evidence, pending checks, report
correlation, phase, and next action. Rotation first retires the old session
and leaves mutation authority ownerless; only a validated successor handoff
can acquire the next authority generation.

Recovery successors are derived from the durable recovery operation and the
exact pending handoff request, not from the recovery operation alone. This
keeps repeated startup idempotent for one completed handoff while ensuring a
later handoff under the same recovery operation cannot propose an identity
that an earlier generation already retired. Recorded completed successors are
adopted exactly; retired identities remain permanently denied mutation
authority.

The default context policy checkpoints at 60 percent, requires rotation at 75
percent, and treats 90 percent or failed compaction as emergency pressure.
Reported provider telemetry is combined with bounded deterministic byte-based
estimation and a conservative fallback window. Missing optional telemetry
therefore schedules checkpoints at long phase boundaries rather than
disabling rotation. A two-turn cooldown prevents ordinary rotation loops;
emergency rotation may bypass it only after a complete checkpoint. An
unjournaled mutation always blocks rotation.

Reportless recovery distinguishes remote compaction failure, provider stream
disconnect, main-process exit without a trusted terminal report,
wrapper/supervisor interruption, host restart/process loss, partial
report/checkpoint write, and ambiguous/contradictory state. Process and lease
readback outrank a stale `IN_PROGRESS` report. A live owner blocks takeover;
dead-owner recovery validates the checkpoint and exact identities, marks the
old session retired, and resumes from the earliest safe incomplete phase.
Observed commit, push, merge, comment, and reservation effects are never
replayed. Corrupt, mismatched, unsupported, or contradictory state stops
fail-closed.

Startup and supervisor recovery share one versioned authoritative-evidence
adapter. Production reads come from the runner-lock PID, durable supervisor
heartbeat lease, clean local Git state, remote branch head, and exact live
GitHub issue/PR/check/comment state. Process/lease disagreement, partial reads,
dirty Git, or marker/live-effect drift fails closed. Canonical evidence is
bounded and sanitized; callers cannot supply synthetic liveness conclusions.

Review convergence has one durable two-loop counter authority in that task/PR
lineage. `localSourceChangingRoundsPerEpoch` blocks at 50 and increments only
when one bounded local fix produces a new exact head;
`githubTriggeredFixEpochsPerPr` blocks at 50 and increments once per frozen,
deduplicated actionable GitHub finding batch that starts a new local epoch;
`lifetimeLocalSourceChangingRounds` is monotonic telemetry and never blocks.
Polling, pending checks, provider retries, unchanged reruns, restarts, and
session rotation consume no nested counter. A GitHub-triggered epoch resets
only the per-epoch local counter and must complete validation plus fresh Gemini
and local Codex reviews on the same candidate identity before push.
The production existing-PR stack adapter journals each unpushed cumulative
candidate, freezes and deduplicates combined local reviewer findings, applies
one bounded batch, invalidates stale evidence, and repeats all three gates.
Restart after finding freeze, local fix, candidate commit, reservation, or push
does not replay the completed effect.

`sourceChangingCycle` and stack `sourceCycles` remain labeled compatibility
projections only. `two_loop_v1.localSourceChangingRoundsPerEpoch` is the sole
blocking reservation count; a later GitHub epoch is not blocked by cumulative
legacy history. A reservation may consume the complete cumulative candidate's
bounded local commit chain exactly once, while lifetime telemetry and logical-
task charges remain independent.

Accepted logical-task accounting is separate under
`logical-task-budget/<budget-scope-digest>.json`. After claim labels are
authoritatively reread, the runner atomically writes an idempotent charge bound
to repository, issue, task lineage, claim identity, and accepted-at evidence
before source mutation. Candidate search/skip activity, internal convergence,
polling, retries, recovery, and session rotation do not charge. Corrupt or
contradictory durable state fails closed.

Bounded outage resubmission is a separate supervisor-side recovery controller
and remains default-off. It is not an immortal mutation worker and does not
poll unrelated issues before recovery state is reconciled. When explicitly
enabled by later external configuration, it may consider only exact
task/run/supervisor/issue/branch/base/head/PR-correlated terminal or proven
inactive source runs whose failure is a recognized prolonged transient outage:
GitHub API/Actions rate-limit, 5xx, timeout, or transport evidence; Codex,
independent reviewer, or scanner provider 429/5xx/timeout/transport evidence;
or explicit DevBox DNS/routing/TLS/connection failures. It refuses 401,
ordinary 403 without trusted rate-limit headers, 404, missing secrets/config,
dirty worktrees, corrupt state, stale evidence, identity drift, merge
conflict, failed tests/validation, code defects, review or scanner findings,
policy/manual/destructive gates, unsupported sources, unknown failures, and
terminal application failures.

The controller uses a configured minimum outage age, bounded exponential
backoff, deterministic-testable jitter, maximum attempts, maximum wall-clock
deadline, and provider/global circuit breaker. State lives under the recovery
root in sanitized owner-only JSON written by temp file plus rename. Dedicated
`outage_resubmission` markers move through `planned`,
`submission_uncertain`, `submitted`, `confirmed_running`, `recovered`,
`exhausted`, or `blocked` and are keyed from exact correlation, attempt, and
spec digest. Uncertain, submitted, confirmed-running, and planned-with-child
markers are reconciled against existing local supervisor state before source
recovery continuation or any new child planning can run. Child specs persist
the task key, current head SHA, and paired PR number/head SHA needed for later
disk-only reconciliation, and reject malformed, unpaired, or unknown outage
metadata. Outage children are explicitly recovery-only: the immutable spec
must include an exact target derived from validated recovery/source evidence,
the worker launches fixed scalar recovery-only arguments, and the runner exits
fail-closed instead of polling eligible issues when the exact target is
missing, mismatched, completed, unsafe, ambiguous, stale, or capability
disabled. The owner CLI can also produce the exceptional no-PR terminal
validation-retry derivative spec by passing
`--terminal-validation-retry-derivative` together with every exact
`--target-*` task, issue, branch, base, head, runner-run, and supervisor-run
identity. That form stores no PR or outage-resubmission identity, forces one
task, requires trusted mode, and is independently reauthenticated by targeted
startup discovery before work can resume. Use `submit --dry-run --json` to
inspect this exact spec and fixed runner argv without writing supervisor
artifacts or starting a unit. Attempt and wall-clock exhaustion persist a terminal `exhausted`
marker when operator controls allow evaluation, so status and health stop
reporting an active source run and repeated controller passes become stable
terminal no-ops. A profile config digest mismatch blocks child planning before
any submission. Head/base/PR drift invalidates old exact-head evidence instead
of reusing it. Pause/stop and manual gates always win. The dry-run fixture path
reports intended child specs and mutation-call counters only. #912 completed
the separate Settleora activation; other project activations remain manual.

Preflight diagnostics:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --preflight
node tools/auto-runner/settleora-auto-runner.mjs --readiness
```

External reviewer package validation is non-mutating and requires an explicit
task-scoped config path:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --review-package /workspace/logs/settleora-auto-runner/reviews/package.json --config /workspace/logs/settleora-auto-runner/reviewer-validation/<task-key>/config.json
```

Security findings ingestion is default-off. The explicit non-mutating dry-run
requires a task-scoped config. It reads enabled sources, normalizes sanitized
records, derives correlation and idempotency keys, checks duplicate evidence,
and may persist sanitized state under
`/workspace/logs/settleora-auto-runner/security-findings/`. Checkpoint 2 can
also opt in to deterministic classification and proposal planning with
`allowSecurityFindingClassification` and
`allowSecurityFindingProposalPlanning`; issue creation still requires both the
global follow-up capability and `allowSecurityFindingIssueCreation`, and the
dry-run path forces previews only. It does not create issues, edit PRs, change
labels, dismiss alerts, close findings, update dependencies, push branches,
open PRs, merge, or mutate product code.

GitHub-backed security sources use explicit bounded pagination. Dependabot
alerts use GitHub's cursor pagination (`after` plus `Link: rel="next"`), while
Dependabot-authored PRs use repository pull-request page pagination. Each source
advances one page at a time until an empty/partial page or missing next cursor
proves exhaustion. A full final configured page is reported as truncated, an
item cap is reported as bounded, and provider or parser failures on later pages
fail the source instead of converting it into zero findings. Only fully complete
source reads can feed classification, disposition, proposal, or completion
planning by default.

Authoritative duplicate evidence is handled before any new-work path. Exactly
one active authoritative issue, PR, report, or durable-state match routes to
`reuse_existing_work`, increments duplicate/reuse counts, and cannot build a
proposal, call the issue mutation pipeline, evaluate false-positive
disposition readiness, schedule retry work, or advance linked issue
completion. Completed/merged duplicate evidence while the finding remains
current open blocks as ambiguous until reconciled. Ledger-only evidence stays
supporting and does not suppress new work.

False-positive disposition readiness is also default-off and fail-closed.
`allowFalsePositiveEvidence` only enables bounded packet/readiness evaluation
inside the non-mutating security-finding dry-run. A live disposition would
require separate trusted real-run approval plus
`allowSecurityFindingDisposition`,
`allowProvenFalsePositiveDisposition`, and exact source-specific supported
reasons. Repository defaults and this example keep those capabilities false,
`dispositionDryRunOnly=true`, `maxDispositionsPerRun=1`, short packet TTLs,
exact reread/precondition checks, strong/Codex/tie-breaker review gates, and
post-disposition reconciliation before linked issue completion hygiene.
Semgrep and Trivy artifact findings have no assumed mutable alert endpoint.

```bash
node tools/auto-runner/settleora-auto-runner.mjs --security-findings-dry-run --config /workspace/logs/settleora-auto-runner/security-findings/<task-key>/config.json --json
node tools/auto-runner/settleora-auto-runner.mjs --security-findings-disposition-dry-run --config /workspace/logs/settleora-auto-runner/security-findings/<task-key>/config.json --json
```

Dependent-PR stack execution is a separate default-off production entry. It is
not normal issue polling and has no fallback to issue claiming, generated issue
creation, canary mutation, supervisor/systemd launch, production deploy,
branch deletion, force-like history, direct `main` push, or product authority
changes.

```bash
node tools/auto-runner/settleora-auto-runner.mjs \
  --run-pr-stack \
  --config /workspace/logs/settleora-auto-runner/live-stack-acceptance/<task-key>/config.json \
  --stack-plan /workspace/logs/settleora-auto-runner/live-stack-acceptance/<task-key>/plan.json
```

Both paths must be absolute, owner-only, and under the configured logs root.
The config must set `prStackExecution.enabled=true`,
`prStackExecution.allowRun=true`, keep
`prStackExecution.productionProfileActive=false`, and explicitly enable only
the stack capabilities for existing PR convergence, exact-head review
requests, CI/scanner polling, exact-head merge, base retarget, ready
transition, semantic proof, and final hygiene. Forbidden capabilities remain
false. Plans are immutable stack identities with repository, stack ID, issue
IDs, and 1-4 ordered PR entries including expected bases, branches, heads,
parent relationship, and own-delta evidence. Read-only fixture plans,
repository mismatches, duplicate PRs, invalid relationships, PR #917, missing
evidence, stale heads, corrupt state, and production-profile activation fail
closed before mutation.

Durable stack state is written atomically under the same logs-root stack
directory with owner-only permissions. It records schema version, immutable PR
identity, active PR/action, source cycles per PR, exact heads/bases, findings,
review request dedupe, mutation markers, merge/current-main/own-delta/ready/
hygiene proof, timestamps, and bounded terminal or wait reasons. Restart reads
that state instead of replaying mutations; duplicate converge, merge, retarget,
ready, comment, closure, ledger, or hygiene actions are skipped by markers.
External waits are resumable as `github_codex_result_wait`,
`ci_check_completion_wait`, `scanner_result_wait`, and
`merge_state_refresh_wait`; wait retries do not consume source-changing cycles.

The action sequence is controlled by `nextStackAction(...)`: converge/gate the
parent, merge with exact-head protection, prove current `main`, retarget the
child to `main`, prove semantic own-delta preservation, ready draft children,
converge/gate/merge the child, then run final hygiene only after every merge
proof exists. The first live #919 -> #920 acceptance may resume its existing
durable state only after the corrective PR adding this entry merges; this
repository default does not activate that run.

The package reviewer routes to `cheap_independent`, `strong_independent`, or
`block_split_or_escalate` from lane metadata plus changed-file and size
evidence. Lane-required strong review is never downgraded. Evidence records
the reviewed head, base SHA when supplied, exact sorted changed files, changed
file digest, package digest, route/tier, provider profile/model, bounded
pricing, attempts, budget/accounting, sanitized evidence path, and a bounded
verdict schema. Provider keys must come only from the approved owner-only
secret file boundary or process environment and are sent in headers, never URL
query strings. This package mode only creates review evidence; approved-lane
auto-merge still requires explicit external profile configuration and all
exact-head gates.

Local status and control:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --status
node tools/auto-runner/settleora-auto-runner.mjs --status --json
node tools/auto-runner/settleora-auto-runner.mjs --list-runs
node tools/auto-runner/settleora-auto-runner.mjs --list-events --run run-2026-07-10T100439Z
node tools/auto-runner/settleora-auto-runner.mjs --stop-after-current
node tools/auto-runner/settleora-auto-runner.mjs --pause
node tools/auto-runner/settleora-auto-runner.mjs --extend --max-iterations +5
node tools/auto-runner/settleora-auto-runner.mjs --extend --max-prs +5
node tools/auto-runner/settleora-auto-runner.mjs --extend --max-runtime +12h
```

Status and health readouts include a sanitized outage-recovery summary:
enabled/default-off posture, active source run, attempt budget, next eligible
time, deadline, circuit state, last reason, child run ID, terminal outcome,
inventory read status, total record count, valid record count, invalid record
count, and whether operator action is required. Canonical corrupt,
schema-invalid, symlinked, group/world-writable, or otherwise untrusted outage
state is never reported as zero records; health returns fail-closed HTTP 503
with bounded `malformed_state` or `untrusted_state` reason evidence. They
never expose raw provider bodies, raw JSON, parse text, prompts, arbitrary
config paths, shell commands, secrets, issue bodies, or full diffs, and they do
not trigger resubmission or repair state.

Detached supervisor foundation:

```bash
node tools/auto-runner/settleora-auto-runnerctl.mjs submit --dry-run --profile default --max-tasks 8 --max-runtime 8h --json
node tools/auto-runner/settleora-auto-runnerctl.mjs status --latest
node tools/auto-runner/settleora-auto-runnerctl.mjs report --latest
node tools/auto-runner/settleora-auto-runnerctl.mjs health --run <supervisor-run-id>
node tools/auto-runner/settleora-auto-runnerctl.mjs pause --run <supervisor-run-id>
node tools/auto-runner/settleora-auto-runnerctl.mjs stop-after-current --run <supervisor-run-id>
node tools/auto-runner/settleora-auto-runnerctl.mjs extend --run <supervisor-run-id> --max-tasks +2
```

Windows wrapper operator evidence:

When a Windows wrapper submission is accepted, save both the supervisor run ID
and the proof JSON returned by the start wrapper. After an operator restart,
use the packaged status and report wrappers with that saved run ID/proof JSON
to retrieve the DevBox status and mapped report. The local Windows files are
operator evidence only; the DevBox supervisor state, health/status/report
output, mapped JSON/Markdown summaries, systemd state, and GitHub issue/PR
state are the source of truth for acceptance.

If Windows blocks the local signed or downloaded wrapper, use execution-policy
bypass only for that PowerShell process invocation. Do not weaken machine-wide
or user-wide execution policy as the documented path.

The supervisor is an additive wrapper around the existing runner. It writes
immutable run specs and state under
`/workspace/logs/settleora-auto-runner/supervisor/`, using SHA-256 storage keys
for filesystem directories while keeping logical run/profile IDs in JSON
content. Run specs store a logical `profile` and `runnerConfigSha256`, not an
arbitrary config path, and monitoring events are written only to local
owner-only `monitoring-events.jsonl` files. The supervisor starts a
later-installed systemd user-unit instance by validated run ID and exits after
the service is accepted/running. It does not approve broader lanes, install
units, enable linger, deploy monitoring, send outbound webhooks, or run
automatically after reboot. Future TrueNAS monitoring is a Uptime Kuma HTTP
pull-health model against a separate read-only DevBox health service; SSH
remains an operator diagnostic path. See
`docs/workflow/AUTONOMOUS_CODEX_RUNNER_SUPERVISOR.md` and
`docs/workflow/AUTONOMOUS_CODEX_RUNNER_MONITORING.md`.

Read-only health service foundation:

```bash
node /workspace/auto-runner/.runtime.launcher.mjs --runtime-root /workspace/auto-runner/runtime \
  --entry settleora-auto-runner-health-service.mjs -- \
  --config /workspace/auto-runner/config/settleora.json \
  --host 127.0.0.1 --port 8787
curl -fsS http://127.0.0.1:8787/health/auto-runner
```

The service exposes only `GET /health/auto-runner`, returns bounded sanitized
JSON with `Cache-Control: no-store`, binds loopback by default, and has no
runner control, GitHub, branch, lock deletion, retry, resume, PR, merge,
notification-provider, or Uptime Kuma private-API authority. Health reads do
not write notifier dedupe state or other runtime state. Any non-loopback bind
requires explicit deployment configuration plus an external request-secret file
under `/workspace/logs/settleora-auto-runner/secrets/`; no live secret is
created or configured by the repository.

The repository user-unit template is
`tools/auto-runner/systemd/settleora-auto-runner-health.service`. It uses
`Restart=on-failure` only for this read-only monitor service and includes
`[Install] WantedBy=default.target` for normal user-scope
`systemctl --user enable --now` semantics. #912 installed and enabled the
Settleora project-bound loopback service; other installations and any
non-loopback exposure remain separate manual deployment gates. The mutation
supervisor template remains `Restart=no`.

The Node-based health service intentionally does not use
`MemoryDenyWriteExecute=yes`. The `20260712-1609` deployment attempt proved
Node/V8 can crash under that directive before the service starts listening.
The template keeps the remaining hardening controls: `NoNewPrivileges=yes`,
`PrivateTmp=yes`, `ProtectSystem=strict`, `ProtectHome=read-only`, fixed
read/write path allowlists, `RestrictSUIDSGID=yes`, `LockPersonality=yes`,
`UMask=0077`, and loopback binding by default.

Terminal ntfy activity notifier foundation:

```bash
node /workspace/auto-runner/.runtime.launcher.mjs --runtime-root /workspace/auto-runner/runtime \
  --entry settleora-auto-runner-terminal-notifier.mjs -- \
  --config /workspace/auto-runner/config/settleora.json
```

The notifier is a separate one-shot command installed for Settleora under the
#912 accepted user timer. It reads the trusted health/supervisor state model,
selects only newly observed healthy terminal supervised runs, sends one
sanitized activity notification for `completed`, `no-eligible-work`, or
successful budget exhaustion, and records local delivery only after confirmed
ntfy `2xx` response. It does not start, stop, resume, retry, pause, extend,
repair, relabel, branch, comment, merge, delete locks, mutate supervisor or
runner state, call GitHub, or run from the health endpoint.

The accepted Settleora ntfy configuration is fixed at
`/workspace/logs/auto-runner/Settleora/secrets/ntfy-notifier.json`. The CLI
does not accept base URL, topic, token, config path, or shell-command
arguments. The config file must be owner-only under the approved secrets root,
use a strict schema, and contain deployment-owned values. #912 adopted the
existing approved provider choice without creating, rotating, or disclosing
credentials. Tests use only local HTTP stubs; repository validation does not
make live ntfy calls.

Repository-only templates:

- `tools/auto-runner/systemd/settleora-auto-runner-terminal-notifier.service`
- `tools/auto-runner/systemd/settleora-auto-runner-terminal-notifier.timer`

They use `Type=oneshot`, `UMask=0077`, a fixed working directory and entry
point, and a roughly 60-second timer cadence. #912 installed the exact
project-bound templates and enabled the Settleora timer after safe prerequisite
proof; repository implementation alone still grants no installation authority.

The Node-based notifier service intentionally omits
`MemoryDenyWriteExecute=yes` for the same Node/V8 runtime compatibility reason
as the health service. It remains timer-owned, one-shot, `Restart=no`, and
confined to the existing read-only/read-write path boundaries. External secret
files remain deployment-owned; do not read, print, rotate, delete, or replace
them through repository-only work. #912 accepted only the existing private
provider path. TrueNAS, Uptime Kuma, a new ntfy server/topic/token, Cloudflare,
router, firewall, or other live publication changes remain manual and outside
that acceptance.

Supervised runs pass a validated `--supervisor-run-id` into the runner. The
runner writes it as sanitized summary metadata, and supervisor status/report/
health use only that exact correlation to resolve the runner JSON/Markdown
summary pair. The supervisor does not choose reports by newest summary time.
If a successful child exits without one unique trusted correlated report, the
supervisor terminal state fails closed and the process exits nonzero.

Clean `main` and clean named non-main checkouts are valid real-run
launch/control-plane states. Detached or unnamed real-run launch fails closed.
Clean launch lets the runner acquire the lock, capture exact `origin/main`,
poll work, and complete a no-work summary from `main`. `main` is not a task
mutation branch. Fresh implementation work must first create the generated
task branch from exact `origin/main` and pass the mutation guard before task
prompt generation or Codex implementation. That guard rejects `main`, detached
or unnamed checkout state, the wrong branch, dirty state, changed
`origin/main`, or a task branch whose `HEAD` is not the expected base.

Supervisor control commands are selected-run controls. Before writing the
global runner control file, `settleora-auto-runnerctl` requires the selected
supervisor run to be controllable and the active runner's sanitized
`supervisorRunId` to exactly equal that selected run ID. Terminal supervisor
runs reject `pause`, `stop-after-current`, and `extend` without mutating the
supervisor state file, heartbeat, report mapping, monitoring evidence, or
`runner-control.json`. Foreground runners with no supervisor correlation and
other supervised runners cannot be controlled through an unrelated supervisor
run. Accepted controls keep the primary lifecycle state unchanged and record
only bounded `lastControl` metadata such as command, request timestamp,
accepted/failed status, extension deltas, and sanitized correlation IDs.

Status reads the runner lock, active-run state, latest summaries, and local
control file under `/workspace/logs/settleora-auto-runner/`. It reports the
active run id when known, mode/config path, start time, elapsed/max/remaining
runtime, PR/iteration budget and remaining count, completed/merged/failed/
blocked/skipped counts, current or latest issue/PR with head SHA where known,
terminal outcome or stop reason, last event time, summary/log/control paths,
and active control flags. `--json` emits the same sanitized data as JSON,
including `maxPrs`/`completedPrs` aliases for the iteration budget used by
current canary/trusted runner loops. The status surface does not print
environment variables, provider payloads, API keys, authorization headers,
`.env` values, raw Gemini output, raw Codex mechanics output, selected
response payloads, or provider request bodies. New run summaries,
iteration-state JSON, active-run JSON, recent summaries, Markdown summaries,
and list/status/event surfaces persist sanitized metadata and evidence paths
only. Supervised summaries include `supervisorRunId`; existing unsupervised
summaries remain readable without backfill. Raw model output, prompts, stdout/stderr, full diffs, and provider
payloads remain in dedicated local evidence files under
`/workspace/logs/settleora-auto-runner/`. Historical local summary/state files
are not automatically rewritten; readback surfaces sanitize old local files
before displaying or rolling them up.

`--list-runs` reads recent run summaries from
`/workspace/logs/settleora-auto-runner/summaries/`. `--list-events --run
<run-id>` reconstructs ordered issue, branch, PR, review, checks, merge, and
outcome evidence from the existing summary and iteration state where present.
Text and JSON output include branch names, issue/PR numbers, PR head SHAs,
review verdicts, independent AI provider/tier/verdict, local validation
commands, check-wait attempts, merge SHAs, and final outcomes where available.
Missing or partially written evidence is reported as unknown rather than
fabricated.

Control commands write an atomic local control file under
`/workspace/logs/settleora-auto-runner/state/runner-control.json`; this file is
runtime state and must not be committed. The active runner reads it only at
safe boundaries before selecting the next issue. `--pause` and
`--stop-after-current` therefore do not interrupt a mid-commit, mid-review,
mid-check, or mid-merge step. Extensions require explicit bounded syntax:
`--max-iterations +N` and its operator alias `--max-prs +N` accept `+1`
through `+500`, and `--max-runtime +12h` accepts `+1m` through `+14d`.
Extension requests increase only the bounded runner loop budgets at the next
safe boundary before selecting new work; they do not override lane safety,
manual gates, provider budget hard stops, independent-review gates, danger
gates, changed-file policy, checks, code scanning, secrets policy, stop
labels, or max-frequency/safety policy. If no active runner exists, control
commands return a clear non-zero no-active-runner response instead of creating
misleading pending control state.

Operator command card for a future manually approved long run:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --status
node tools/auto-runner/settleora-auto-runner.mjs --status --json
node tools/auto-runner/settleora-auto-runner.mjs --list-runs
node tools/auto-runner/settleora-auto-runner.mjs --list-events --run <run-id>
node tools/auto-runner/settleora-auto-runner.mjs --pause
node tools/auto-runner/settleora-auto-runner.mjs --stop-after-current
node tools/auto-runner/settleora-auto-runner.mjs --extend --max-prs +5
node tools/auto-runner/settleora-auto-runner.mjs --extend --max-runtime +12h
```

`--pause` and `--stop-after-current` are safe-boundary controls only. The
active runner observes them before selecting new work, not mid-PR mutation,
mid-review, mid-check wait, or mid-merge. A `99 PR / 240h` run remains manually
gated and is not approved by this tooling surface.

Preflight/readiness is report-only. `--readiness` is the preferred command
when preparing for a future overnight approval review. It prints a concise
pass/warn/fail summary to stderr, prints the full machine-readable JSON to
stdout, and writes both JSON and Markdown reports under:

```text
/workspace/logs/settleora-auto-runner/readiness/
```

The readiness report includes timestamp, repository, current branch and `HEAD`,
config path, pass/warn/fail totals, remaining manual gates, repo-root and clean
worktree checks, `origin/main` reachability, local `HEAD` relation to
`origin/main`, `gh auth status`, repository reachability, #910 open state,
#805 closed state, eligible issue search health using simple per-label
queries, trusted real-run refusal state, separate canary approval state,
risky gate defaults, reviewer tier/budget policy, active/stale claim label
readouts, active `auto-pr-opened` issue readouts, open auto-runner PR
readouts, Codex command resolution without invocation, Node version, log-write
sanity, and disk-space sanity.

`pass` means the checked condition matches conservative readiness
expectations. `warn` means inspect before trusting unattended operation.
`fail` means the state is not suitable for unattended operation. Enabling
`allowAutoMerge`, `allowFollowupIssueCreation`, `allowStaleClaimSteal`,
`allowReviewFixMutation`, or `allowSystemdEnablement` reports `fail` unless
the config matches the explicitly documented bounded low-risk auto-merge
canary approval path.

Reviewer budget and routing are a report-only policy foundation. External
reviewer tiers are disabled and unconfigured by default:
`cheap_independent`, `strong_independent`, and `tie_breaker`.
`codex_mechanics` remains available for the existing Codex-backed mechanics
review path. Readiness reports provider profile names, model names, token
prices, and whether a command is configured; it does not print command strings
or secrets. Defaults assume USD 80/month normal reviewer budget, USD 95/month
reviewer hard stop, USD 200/month Codex subscription budget, USD 300/month
total automation ceiling, and an 80% warning threshold. Cost estimates are
local token-price arithmetic only and do not call external provider APIs.

The approved independent reviewer provider direction is Google-only for now.
`cheap_independent` may be configured to use a supported Gemini Flash or
Flash-Lite class model. `strong_independent` and any enabled `tie_breaker`
profile should use a specific stable Gemini model, currently
`gemini-3.5-flash`, rather than a moving `latest` alias. Provider lifecycle
changes such as an unavailable configured model are operational blockers, not
review verdicts, and the runner must not silently fall back to weaker, preview,
or alias models. Model changes require official model/deprecation/pricing
verification, explicit endpoint support, token-price updates, a bounded smoke
or integrated provider proof, and exact-head rereview. Claude and OpenAI
reviewer provider wiring is intentionally absent.

Gemini provider configuration is disabled by default in
`runner-config.example.json`. Model names, token prices, and provider profile
names are configurable, but API keys must stay outside the repository. The
runner first reads `GEMINI_API_KEY` from the process environment. An external
env file can be configured only by explicit path under:

```text
/workspace/logs/settleora-auto-runner/secrets/
```

For example, an operator may create
`/workspace/logs/settleora-auto-runner/secrets/reviewer.env` containing
`GEMINI_API_KEY=...` and point the local, uncommitted runner config at that
path. Do not commit live config files from `/workspace/logs/**`, API keys,
`.env` files, authorization headers, or credentials.

Gemini reviewer smoke-test mode is standalone and non-mutating:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --reviewer-smoke-test --config /workspace/logs/settleora-auto-runner/local-gemini-reviewer-config.json
node tools/auto-runner/settleora-auto-runner.mjs --reviewer-smoke-test --live-external-reviewer-calls --config /workspace/logs/settleora-auto-runner/local-gemini-reviewer-config.json
```

The first command performs config, key, budget, tier, and reporting checks
without opting into a live external reviewer call. The second command may make
one tiny Gemini `generateContent` call only when the configured Gemini tier is
enabled, the API key is available from the approved boundary, projected
reviewer spend is below the hard stop, and the estimated smoke cost is below
the tiny smoke cap, defaulting to USD 0.05. The payload is synthetic and asks
for strict JSON only. Output reports provider, model, estimated tokens/cost,
actual usage if returned by Gemini, verdict, elapsed time, and a sanitized
response summary under `/workspace/logs/settleora-auto-runner/reviews/smoke-tests/`.
Missing keys produce `blocked_for_live_smoke_test_key_missing`; that is an
operator setup blocker, not a repo implementation failure.

Integrated Gemini pre-PR review is now wired into the normal runner review
flow before branch push or PR creation. It remains disabled by default because
the built-in `cheap_independent` tier is disabled. When an external,
uncommitted config under `/workspace/logs/settleora-auto-runner/` enables the
Gemini `cheap_independent` tier, the runner requires a passing Gemini verdict
for the first approved low-risk lanes only:

- `workflow-docs-tooling` with changed files under `tools/auto-runner/**`,
  `docs/workflow/**`, or `scripts/ai/**`.
- `docs-planning` with changed files under `docs/planning/**` or
  `docs/qa/**`.
- `client-ui-low-risk` with changed files under `apps/mobile/lib/ui/**` or
  `apps/mobile/test/ui/**`.

Strong-review routes, huge/cross-domain routes, unsupported models, missing
keys, malformed verdicts, provider failures, budget failures, accounting
failures, and secret-boundary violations fail closed before PR creation. The
integrated Gemini reviewer writes only
sanitized local evidence under
`/workspace/logs/settleora-auto-runner/reviews/integrated/` and sanitized
accounting under
`/workspace/logs/settleora-auto-runner/state/reviewer-accounting.json`. It
does not create GitHub comments, labels, issues, branches, commits, pushes, or
PRs.

Large-bundle review approval is a separate default-off review-routing
capability. It can only be enabled by an explicit external config that binds
one coherent workflow/tooling bundle to exact issue, repository, lane, base,
head, changed-file digest, raw diff digest, provider-bound digest, true diff
stats, normalized domain set, task key or expiry, manual-merge-required
contract, auto-merge-ineligible contract, validation evidence, and clear
secret-boundary evidence. A passing approval may convert only a size-based
`block_split_or_escalate` route to `strong_independent`. Its merge flags must
exactly match the candidate task contract: coherent operator-authorized bundles
may remain auto-merge eligible, while genuine manual/danger contracts remain
manual. The approval does not itself enable auto-merge, trusted real runs,
issue creation, review-fix mutation, existing-PR mutation, stale-claim
stealing, systemd, CI/security waivers, or Codex review waivers.

External config activation example:

```json
{
  "reviewerTiers": {
    "cheap_independent": {
      "enabled": true,
      "provider": "gemini",
      "providerProfile": "gemini-cheap",
      "command": null,
      "model": "gemini-2.5-flash-lite",
      "inputUsdPerMillionTokens": 0.1,
      "outputUsdPerMillionTokens": 0.4
    }
  },
  "reviewerProviderProfiles": {
    "gemini-cheap": {
      "provider": "gemini",
      "apiKeyEnv": "GEMINI_API_KEY",
      "envFilePath": "/workspace/logs/settleora-auto-runner/secrets/reviewer.env",
      "defaultModel": "gemini-2.5-flash-lite"
    }
  }
}
```

The readiness command does not approve trusted overnight operation, normal
trusted real-run, canary real-run, auto-merge lanes, stale-claim stealing,
follow-up issue creation, review-fix mutation, or systemd enablement. It does
not run Codex implementation or review prompts, change labels, comment on
issues, create/update/merge PRs, create branches, commit, push, request
auto-merge, install/enable systemd units, steal stale claims, or create
follow-up issues.

Low-risk auto-merge foundation:

Auto-merge remains disabled in built-in defaults and in the example config.
The low-risk lane candidates are `workflow-docs-tooling`, `docs-planning`,
and the default-off real-code canary lane `client-ui-low-risk`. A merge can be
considered only when an external, uncommitted config sets `allowAutoMerge:
true` and the issue contract sets `autoMergeEligible: true` plus
`manualMergeRequired: false`.

Even then, the runner fails closed unless the changed files exactly match the
issue contract and lane allowlists, Codex mechanics review approved, local
validation passed, the PR is
open/non-draft/mergeable/clean against `main`, the PR head is the
runner-created commit, the expected `origin/main` base still matches, all
required checks passed on the exact head, review threads are resolved, the PR
ref has no open code-scanning alerts, no blocking comment/review/manual-gate
markers exist, and the issue is still open without stop labels. The merge
method is normal GitHub merge commit only. Sanitized auto-merge evidence is
written under `/workspace/logs/settleora-auto-runner/auto-merge/`.

After a successful normal auto-merge, the runner re-reads the linked issue's
current labels and removes only present transient lifecycle labels from this
fixed allowlist: `auto-running`, `auto-claimed`, `auto-pr-opened`, and
`auto-failed`. Durable labels such as area labels, `workflow`, `canary`,
`auto-canary-ready`, priority, day-scope, and project labels are preserved.
Merge success remains authoritative if label cleanup, issue closure, or
post-merge comments fail; cleanup status and failure reasons are recorded in
auto-merge evidence, summaries, and event listings for operator follow-up.
The same merged issue also remains excluded by the current run's attempted set
before the next selection boundary, regardless of cleanup or closure status.
Dry-run mode previews the exact transient labels without mutating GitHub.

Fresh implementation ordering is exact-head-first. After Codex implementation
and local validation, the runner creates a normal local commit containing the
validated files and does not push it. Gemini and Codex mechanics review then
run against that committed `origin/main...HEAD` diff and record the reviewed
head SHA plus the exact changed-file set. Push and PR creation use the same
reviewed commit SHA. If an approved review-fix mode changes files, it creates a
new normal local follow-up commit and reruns exact-head reviews for that new
head; stale evidence from the prior head is not accepted.

For the real-code `client-ui-low-risk` lane, auto-merge additionally requires
a passing independent Gemini review for the exact head and changed-file set.
Runner PR bodies, PR comments, issue comments, summaries, and event listings
use explicit wording such as:

```text
Independent AI review: required; provider/tier: Gemini cheap_independent; verdict: pass; exact head: <sha>; evidence: <sanitized local path>
```

Disabled, skipped, missing, malformed, stale-head, mismatched-file,
provider-failed, or non-pass independent review evidence is reported as
blocked/fail-closed, not as optional or merely unconfigured. Codex mechanics
review is still required but does not replace the independent real-code review
gate. Existing-PR recovery for this lane requires both independent Gemini
evidence and Codex mechanics evidence on the exact PR head.

Codex mechanics review capture is file-backed and attempt-oriented. Each
attempt stores separate sanitized stdout, stderr, prompt, and combined log
metadata; summaries report attempt count, process status/signal, selected
response boundary, parse or contract failure category, final reason, and final
verdict when available. Stdout is primary. Stderr fallback is allowed only when
stdout is empty and stderr contains exactly one valid verdict object.
Contract-distinct verdict objects across stdout/stderr are ambiguous and fail
closed. One normalized verdict repeated with the same contract meaning in the
diagnostic stderr transcript is treated as one contract verdict; the selected
stdout payload must still contain exactly one valid verdict object. The bounded
retry cap is two total attempts, and retry is limited to process/transport
failures such as missing selected payload or output-transport failure. Valid
`changes_requested`, `needs_tommy`, `danger_gate`, substantive
`unable_to_review`, malformed/ambiguous contract output, scope failures, and
manual/security blockers are not retried into approval.

Auto-merge mergeability is rechecked through a bounded wait loop before
failing closed for refreshable GitHub states. If checks are still pending, or
GitHub reports a refreshable merge state such as `BLOCKED` or `UNKNOWN`, the
runner re-reads PR metadata, exact head SHA, base branch, mergeability, merge
state, checks, review threads, code scanning, issue state, and blocking
comments/reviews before deciding. The default wait is 60 attempts with a
30-second bucketed delay, and config values are normalized to strict safe
bounds rather than passed directly into timers. Wait evidence records attempts,
elapsed wait, pending check names, and whether pending counts decreased. It
still merges only after every existing gate passes on the exact PR head. Stale
heads, wrong bases, failed or cancelled checks, unresolved threads, open
alerts, stop labels, broad changed files, manual markers, or timeout all block
with sanitized evidence.

Integrated Gemini retry is limited to transient provider/transport failures:
HTTP `429`, HTTP `503`/`UNAVAILABLE`, fetch/network failures, and timeout-like
errors. Budget hard stops, per-call caps, missing keys, unsupported models,
malformed verdicts, and non-pass verdicts are terminal and are not retried.
The default is one retry after the initial attempt, with sanitized attempt
evidence in the integrated review report.

Existing-PR recovery is default-off through `allowExistingPrRecovery: false`.
When a future explicit external config enables it for a specific issue/PR, the
runner can evaluate an already-open auto-runner PR instead of creating a new
branch. Recovery requires the low-risk canary contract, an open non-draft PR on
`main`, current PR title/body metadata with exact `#<issue>` linkage, exact
changed files within the issue contract, exact-head validation evidence,
exact-head Gemini and/or Codex mechanics evidence, current successful checks,
clean mergeability, resolved review threads, no PR-ref code-scanning alerts,
no stop labels, no blocking comments/reviews, and the unchanged expected PR
head. Linkage is checked by deterministic text scanning with numeric boundary
safety, so near-misses such as `#8250` or `#0825` do not match `#825`.
Sanitized evidence records which PR text sources were evaluated and matched.
Missing or stale evidence fails closed. If all evidence and terminal gates pass
and only checks are pending or mergeability is refreshable, recovery uses the
same bounded wait loop as normal auto-merge and re-reads PR head, base,
mergeability, checks, review threads, code scanning, issue state, labels,
blocking comments/reviews, and changed-file scope before each attempt.

Dry-run diagnostics:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --dry-run --once
node tools/auto-runner/settleora-auto-runner.mjs --dry-run --max-iterations 3
node tools/auto-runner/settleora-auto-runner.mjs --dry-run --once --require-pre-pr-review
node tools/auto-runner/settleora-auto-runner.mjs --dry-run --max-iterations 3 --fixture-issues tools/auto-runner/test/fixtures/issues.safe.json
node tools/auto-runner/settleora-auto-runner.mjs --dry-run --canary --max-iterations 2 --fixture-issues tools/auto-runner/test/fixtures/issues.safe.json
```

`--fixture-issues <json>` is dry-run only. It uses local issue objects to prove
multi-iteration behavior without calling `gh issue edit`, `gh issue comment`,
`gh issue create`, creating branches, pushing, opening PRs, running real Codex,
or enabling auto-merge. Stop labels such as `auto-pr-opened` are honored.
Canary dry-run writes evidence under
`/workspace/logs/settleora-auto-runner/canary/` without live GitHub mutation.

Eligible labels are polled with one simple GitHub issue search per label, for
example `repo:tommytang213/Settleora is:issue is:open label:auto-ready`.
Multiple label searches are aggregated and deduplicated by issue number. A
dedicated canary config can set `eligibleLabels` to only
`auto-canary-ready`; the issue body contract still decides whether any selected
issue may be implemented.

Issue search is advisory only. Before claim or implementation, the runner
live-refreshes each bounded candidate by exact issue number, excludes issue
numbers already attempted in the same run, requires current open/eligible/
non-stopped state, and re-parses the live body contract. Stale or ineligible
candidates are skipped with sanitized events and the next distinct candidate is
considered. The run-scoped attempted set is persisted in active state,
iteration state, summaries, status, and event readbacks; it prevents same-run
reselection after merged, PR-opened, blocked, danger-gated, validation-failed,
review-failed, no-change, or auto-failed outcomes, even when GitHub indexing or
post-merge hygiene lags.

After claim labels are added, the runner re-reads the exact issue and requires
it to remain open, retain the expected current-run claim labels, and not gain a
stop/manual/danger label before branch creation, task generation, or Codex
launch.

Startup continuation uses the same claim-authority model in a distinct
`preserved_recovery_claim` mode. It does not recreate active claim labels.
Before lifecycle takeover or task-workspace materialization it requires the
issue to remain open and currently eligible, reconciles any transient claim
label with an exact live owner, binds terminal labels to the recorded prior
outcome, and verifies the single completed claim marker, accepted-task charge,
lifecycle, recovery, candidate, intent, report/prompt, counter, no-owner, and
no-later-effect lineage. The sanitized decision is persisted in recovery
state. A contradiction stops with its precise reason and does not fall back to
polling or create replacement work.

Issue contracts:

`auto-ready` and `auto-bundle` only make an issue eligible for selection. They
do not authorize implementation. Real-run and dry-run implementation require a
body-level contract:

````markdown
## Auto-runner contract

```json
{
  "contractVersion": 1,
  "lane": "workflow-docs-tooling",
  "allowedPaths": [
    "tools/auto-runner/**",
    "docs/workflow/**"
  ],
  "validationProfile": "workflow-tooling",
  "manualMergeRequired": true,
  "autoMergeEligible": false,
  "requiredReading": [
    "PROGRAM_ARCHITECTURE.md",
    "docs/workflow/CODEX_TASK_GUIDE.md",
    "docs/workflow/AUTONOMOUS_CODEX_RUNNER.md"
  ]
}
```
````

Contracts are parsed from the issue body only. Missing contracts, malformed
JSON, missing fields, unknown fields, unsupported versions, unsupported lanes,
unknown validation profiles, and `allowedPaths` outside the lane manifest all
fail closed as safe blocked outcomes. Issue text never supplies shell
commands; it only names a validation profile defined in
`tools/auto-runner/lib/lane-policy.mjs`.

Feature bundles:

`auto-bundle` additionally requires a validated contract `bundle` object with
`bundleVersion: 1`, `strategy: "feature-bundle"`, and exactly two to four
ordered slices. Slice IDs are stable bounded identifiers, each slice has a
non-empty title/objective, slice paths must be subsets of the parent contract
and lane manifest, slice validation profiles must be supported by the parent
lane, and required-reading paths must be bounded repo-relative paths. Shell
commands and executable-looking text are rejected from issue-provided bundle
metadata.

The runner executes a feature bundle as one branch and one final PR. It writes
one generated prompt/report per slice, validates and commits each completed
slice with explicit paths only, persists sanitized checkpoint state under
`/workspace/logs/settleora-auto-runner/bundles/`, runs one aggregate final
validation, builds one review package, requires strong independent external
review plus separate Codex mechanics/security review, pushes once, opens or
updates one PR, waits for exact-head checks, and then applies the existing
conditional auto-merge policy only when the issue and config permit it.
Manual-merge-required bundles leave the approved PR open.

Recovery loads the bundle state by validated issue/bundle identity and checks
schema version, plan digest, issue, branch, exact base, current head, clean
worktree, completed checkpoint commits, completed reports, and validation
evidence. Completed slices are never rerun. The first incomplete slice may
restart only from the exact last checkpoint head. Corrupt, partial, missing,
stale, mismatched, or ambiguous state fails closed.

For eligible auto-runner issues, the classifier parses and validates the
contract before applying broad danger-word heuristics. Explicit exclusion
sections such as `## Non-goals`, `## Out of scope`, and
`## Prohibited actions` are treated as negative scope, not implementation
requests. Positive scope text, the title, dangerous contract `allowedPaths`,
malformed contracts, disabled lanes, and genuine manual-action requests still
fail closed with the normal danger/manual gate outcomes.

Positive-scope scanning remains fail-closed. The only context-aware exception
is for validated `client-ui-low-risk` contracts using the exact
`mobile-ui-low-risk` profile, with every contracted path under
`apps/mobile/lib/ui/**` or `apps/mobile/test/ui/**`, when the only detected
danger reason is `money_settlement`. In that case, presentation-only proof
such as accessibility, semantics, visible display text, UI copy, layout/style
only, or read-only shared-widget rendering may suppress the active gate for
financial display nouns such as amount, currency, MoneyText, Payment, or
Balance. The lane decision records bounded evidence with detected danger
reasons, matched presentation proof, matched authority/mutation signals, and
whether the exception was applied; it does not include the full issue body.

The exception does not apply to any other danger category, invalid or missing
contracts, non-`client-ui-low-risk` lanes, broad paths, dangerous path names,
or ambiguous financial-authority wording. Calculation, rounding policy,
currency conversion, exchange-rate/FX behavior, amount entry or persistence,
payment/settlement/refund transitions, split/allocation math, amount-derived
authorization/policy, API/domain/database/storage writes, and settlement,
payment, or billing behavior continue to block as `money_settlement` or the
more specific danger category. Changed-file enforcement, independent review,
CI, security, and auto-merge gates are unchanged.

Implementation lane matrix:

| Lane | Sensitivity | Branch strategy | Reviewer tier | Validation profile | Current posture |
| --- | --- | --- | --- | --- | --- |
| `workflow-docs-tooling` | low | normal | cheap | `workflow-tooling` / `runner-tests` | implementation, PR, and existing low-risk auto-merge gates when explicitly configured |
| `docs-planning` | low | normal | cheap | `docs-only` | implementation, PR, and existing low-risk auto-merge gates when explicitly configured |
| `client-ui-low-risk` | low | normal | cheap | `mobile-ui-low-risk` | narrow protected canary lane preserved |
| `mobile-application` | standard | normal | cheap | `mobile` | implementation and PR creation only |
| `mobile-build-config` | high | focused | strong | `mobile-build-config` | checked-in Flutter/native build inputs may auto-merge only after stronger exact gates; signing, release, generated output, and credentials remain manual/forbidden |
| `web-user-ui` | standard | normal | cheap | `web-ui` | implementation and PR creation only |
| `web-admin-ui` | sensitive | focused | strong | `web-ui` | implementation and PR creation only |
| `api-domain-runtime` | sensitive | focused | strong | `api-domain` | implementation and PR creation only |
| `auth-session-security` | high | focused | strong | `api-security` | code PR auto-merge eligible only after stronger exact gates; unresolved security policy and credential/auth-config mutation remain manual |
| `storage-file-privacy-authz` | high | focused | strong | `api-storage` | code PR auto-merge eligible only after stronger exact gates; unresolved privacy/authorization authority remains manual |
| `money-settlement-payment` | high | focused | strong | `api-money` | code PR auto-merge eligible only after stronger exact gates; unresolved financial semantics remain manual |
| `schema-migrations` | high | focused | strong | `api-migrations` | migration code may auto-merge after gates; destructive application remains manual |
| `openapi-generated-clients` | high | focused | strong | `openapi-generated-clients` | contract plus generated clients may auto-merge only through repo generation/validation gates |
| `sync-import-export-restore` | high | focused | strong | `sync-import-export` | code PR auto-merge eligible only under API/domain-authoritative acceptance; live restore/import/export mutation remains manual |
| `docker-compose-ci-deployment` | high | focused | strong | `compose-ci` | repo code may auto-merge after gates; live deployment/env/network/secret mutation remains manual |
| `cross-domain` | split | split-required | split/escalate | none | blocked until future bundle/split policy |

Compatibility aliases map `security-runtime`, `storage-privacy`,
`money-settlement`, and `deployment-ci-env` to their focused sensitive lanes.
`product-runtime` remains a disabled placeholder until an issue selects a
narrower domain lane.

High-risk lanes are not categorically PR-only. #888 operationalized external
reviewer tiers, and #889 plus the #907 correction implement exact-head
auto-merge expansion for supported canonical runnable domains. Reviewer
providers and approved lanes remain disabled by default until an external
profile explicitly enables them.

Genuine manual actions remain blocked even when related code lanes are
runnable: production deploy/promotion, mobile store/TestFlight/Play
submission, destructive migrations/data operations, secret or credential
creation/rotation/disclosure/mutation, public/admin exposure or network/TLS/
DNS/proxy/router/firewall changes, architecture replacement, force-like
history rewrites, branch deletion/cleanup, Day 1 scope cuts, and unresolved
product/policy/authority/financial semantics.

The `client-ui-low-risk` lane still does not allow auth/session/security,
storage/privacy/authz, money/settlement/payment/bill calculation authority,
schema/migration, OpenAPI/generated-client, sync/import/export, OCR runtime,
Docker/CI/deployment/env, mobile release/signing, public/admin exposure, broad
`apps/mobile/**`, or generated files.

`mobile-build-config` is separate from `mobile-application`.
`mobile-application` remains for Flutter product code under
`apps/mobile/lib/**` and tests under `apps/mobile/test/**`. The build-config
lane is for focused changes to checked-in project inputs such as
`apps/mobile/pubspec.yaml`, `apps/mobile/pubspec.lock`, tracked
`apps/mobile/assets/**` or `apps/mobile/l10n/**` when present, and native
platform project files under `android/`, `ios/`, `macos/`, `linux/`,
`windows/`, and `web/`. The lane does not permit generated output, caches,
signing/provisioning files, keystores, private keys, `.env` files, provider or
store credentials, TestFlight/App Store/Play publication, live release
actions, generated OpenAPI Dart clients, CI/deployment workflows, or unrelated
mobile product/runtime files. Ordinary non-secret manifests, plist files,
Gradle files, Xcode project metadata, non-secret entitlements, `Podfile`, and
checked-in platform source/resources are not manual merely because they are
native inputs.

The base `mobile-build-config` validation profile is fixed in runner source as:
`git status --short`, `git diff --name-only`, `git diff --check`,
`PATH=/opt/flutter/bin:$PATH npm run doctor:mobile`, Flutter `pub get`,
Flutter `analyze`, and full Flutter `test` from `apps/mobile` using
`/opt/flutter/bin/flutter`. The validation planner appends platform build
proof from actual changed files. Android native/project changes append
`flutter build apk --debug`,
`./gradlew :app:dependencies --configuration debugRuntimeClasspath`, and
`./gradlew :app:assembleDebug`. Web project changes append
`flutter build web`.

Linux, iOS, macOS, and Windows project changes fail closed for auto-merge
unless exact external platform evidence is present. Current Linux DevBox proof
cannot complete `flutter build linux` because the host lacks
`libsecret-1>=0.18.4`, required by `flutter_secure_storage_linux`; Linux
changes therefore require `mobile-build:linux:external-ci` until the runner
host supports that build. iOS/macOS/Windows require
`mobile-build:ios:external-ci`, `mobile-build:macos:external-ci`, or
`mobile-build:windows:external-ci`. External evidence must match the exact
head SHA, base SHA, changed-file digest, inferred platform set, and canonical
check identifier; missing, skipped, neutral, stale, wrong-digest, or similarly
named checks block. `pubspec.yaml`, `pubspec.lock`, tracked assets, and
localizations are cross-platform build/dependency inputs and receive this
native/build posture rather than Dart-only proof. This lane does not activate
#912 external production profiles and does not claim Day 1 product completion.
Built-in/default profiles keep auto-merge, stale-claim stealing, follow-up
creation, review-fix mutation, trusted real runs, and systemd enablement
disabled/gated. The accepted external Settleora profile selectively enables
only its documented bounded capabilities. Review-fix mutation remains
default-off outside that explicit profile.

Normal real-run is refused by default. A plain `--run` requires
`trustedRealRunApproved: true` in config and still refuses unsafe mutation
toggles. This repository does not currently approve overnight trusted
operation.

```bash
node tools/auto-runner/settleora-auto-runner.mjs --run --max-iterations 20
node tools/auto-runner/settleora-auto-runner.mjs --run --max-runtime 8h
```

Trusted real-run canary mode is a separate, narrower gate. A canary real-run
requires both CLI intent and config approval:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --run --canary --max-iterations 1 --config /workspace/logs/settleora-auto-runner/canary-approved-config.json
```

The config used for that command must set `trustedRealRunCanaryApproved: true`.
Canary mode only accepts contracted `workflow-docs-tooling`, `docs-planning`,
and `client-ui-low-risk` lanes, caps iterations to
`trustedRealRunCanaryMaxIterations` (default `2`), writes evidence under
`/workspace/logs/settleora-auto-runner/canary/`, and keeps PRs human-review
and human-merge only unless the separate bounded auto-merge canary approval
below is active.

Normal canary mode refuses contracts with `autoMergeEligible: true`, requires
`manualMergeRequired: true`, and refuses auto-merge, follow-up issue creation,
stale-claim stealing, review-fix mutation, and systemd enablement. It does not
approve overnight operation and does not install or enable systemd.

Bounded low-risk auto-merge canary mode is narrower than normal canary
approval and requires all of these at once:

- CLI intent: `--run --canary`.
- External, uncommitted config path under the operator-controlled log area.
- `trustedRealRunCanaryApproved: true`.
- `trustedRealRunApproved: false`.
- `lowRiskAutoMergeCanaryApproved: true`.
- `allowAutoMerge: true`.
- `maxIterations` no greater than `2`.
- No stale-claim stealing, follow-up issue creation, or systemd enablement.
- Review-fix mutation remains off unless a separate explicit low-risk
  approval also sets `allowReviewFixMutation: true` with a positive
  `maxReviewFixCycles`.

The only accepted auto-merge canary issue contracts are non-empty safe subsets
of the approved low-risk prefixes: `workflow-docs-tooling` may use
`tools/auto-runner/**` or `docs/workflow/**`, `docs-planning` may use
`docs/planning/**` or `docs/qa/**`, and `client-ui-low-risk` may use only
`apps/mobile/lib/ui/**` or `apps/mobile/test/ui/**`. Contracts do not need to
list every approved prefix; least-privilege single-file contracts are
preferred for live canaries. They must still set `autoMergeEligible: true`
and `manualMergeRequired: false`. Broad root paths, `**`, `docs/**`,
`apps/mobile/**`, `scripts/ai/**`, generated clients, product/security/
storage/money/schema/OpenAPI/generated-client/Docker/deployment/env/secret/
public/admin scope, stop labels, missing required independent AI review pass,
missing Codex mechanics
approval, missing independent Gemini pass for `client-ui-low-risk`, failing checks, unresolved review threads, PR-ref code-scanning
alerts, stale PR heads, base mismatch, dirty worktrees, and issue-state
mismatches remain blocking gates. This max-2 path exists only to prove the
live auto-merge gates on two bounded low-risk issues after a separate explicit
task creates and runs that canary.

The `client-ui-low-risk` validation profile is fixed in runner source as:
`git status --short`, `git diff --name-only`, `git diff --check`, Flutter
`pub get`, Flutter `analyze`, and
`flutter test test/ui/settleora_component_guardrail_test.dart` from
`apps/mobile`. Issue contracts cannot provide shell commands.

Bounded review-fix convergence:

Review-fix mutation is still disabled by default and still requires an
external config with `allowReviewFixMutation: true`. When enabled, the default
and hard maximum source-changing budget is 50 cycles per PR per convergence
epoch. Lower explicit values are honored, zero disables mutation, malformed or
negative values fail closed, and values above 50 are clamped to the hard
maximum with the requested, normalized, and hard maximum values reported.
Provider/network/review/CI polling retries, scanner retries, process restart,
unchanged reruns, and waiting do not consume this budget. A cycle is consumed
only after a fix produces a source-changing committed/pushed exact head.

Mutation eligibility is contract-based instead of permanently low-risk-only.
The issue contract, allowed paths, lane `allowedToImplement`,
manual-decision classification, validation profile, reviewer tier, merge
policy, danger/manual separation, exact head, and stack state decide whether a
fix can run. Workflow/docs and normal runtime lanes may self-fix when the
contract allows them. Auth/security, storage/privacy/authz, money/settlement,
schema/migrations, OpenAPI/generated clients, Docker/CI/deployment, and other
sensitive lanes may self-fix only with stronger validation, strong independent
review, Codex mechanics/security review, and exact-head merge gates. A
sensitive folder name alone is not an operator interrupt. Production deploys,
store releases, destructive operations, secret/auth config mutation,
public/admin exposure, Day 1 scope cuts, architecture replacement, force-like
history changes, branch deletion, and unresolved product/policy choices remain
manual. Generated clients are changed only through the authoritative contract
or generator path.

Every new exact head invalidates validation, review, CI, scanner, and merge
evidence. Review requests are deduped by PR, exact head, reviewer purpose, and
tier. Old-head no-finding results are never reused. Material findings are
fingerprinted without secrets or raw provider payloads, frozen as a complete
inventory, and fixed as one focused batch. Duplicate and non-material findings
do not trigger mutation; manual findings stop with one bounded operator
notification.

The convergence controller detects repeated identical material finding sets,
findings that return after a claimed fix, candidate tree or patch-id
oscillation including A/B and short periodic loops, and lack of source
progress despite provider wording changes. The no-progress threshold defaults
to at least three source-changing cycles. Terminal reasons are:
`REVIEW_CONVERGED`, `MANUAL_DECISION_REQUIRED`, `NO_PROGRESS`,
`REVIEW_OSCILLATION`, `CYCLE_BUDGET_EXHAUSTED`, `VALIDATION_BLOCKED`,
`REVIEW_PROVIDER_BLOCKED`, `CI_OR_SCANNER_BLOCKED`, and
`UNSAFE_SCOPE_CHANGE`. Round 50 is admissible; reservation of source-changing
round 51 is refused. A diagnostic review may explain exhaustion, but cannot
authorize another source mutation.

The trigger must be structured and actionable: integrated Gemini must return a
bounded strict-JSON blocking finding, or Codex mechanics review must return
`changes_requested` with `recommended_next_action: "run_safe_fix_cycle"` and
blocking findings. Malformed review output, provider/accounting/key failures,
unsupported models, budget hard stops, non-actionable findings, code scanning,
GitHub checks, unresolved review threads, manual blocker comments, dirty or
stale branch/base/head state, and dangerous paths fail closed without a fix.

When a fix attempt is allowed, the prompt includes only sanitized finding
summaries and the issue contract authority, restricts Codex to the current
branch and exact `allowedPaths`, and prohibits unrelated cleanup, broad
refactors, generated-client edits, secrets/env files, product/runtime/security/
money/schema/OpenAPI changes, pushes, PR updates, GitHub comments, merges,
branch deletion, and live provider calls. After the attempt, the runner reruns
changed-file policy checks, local validation, integrated Gemini when
configured, and Codex mechanics review. Evidence is written only under
`/workspace/logs/settleora-auto-runner/review-fix/`.

For the post-fix Codex mechanics review, the runner writes a dedicated
`post-review-fix-mechanics` review package. That package marks the initial
implementation report as `pre_fix_report` and stale background, includes the
structured finding that triggered the fix, the review-fix decision, changed
files before/after, post-fix validation results, and the final integrated
review or fixture pass status. The runner fails closed before mechanics review
if that post-fix evidence is missing, malformed, or not tied to the current
issue, head, or changed-file list.

Review-fix canary fixture:

A deterministic review-fix canary fixture exists only for a future one-issue
live canary. It is disabled by default and has no effect on normal Gemini or
Codex mechanics review. To use it, an external uncommitted config must enable
`reviewFixCanaryFixture.enabled`, provide a bounded single-line `marker` such
as `review-fix-cycle: completed`, and invoke the runner with the same
`--run --canary`, low-risk auto-merge canary, and review-fix mutation approval
shape above.

In fixture mode, the runner does not call Gemini for the integrated review
source. It checks only the changed low-risk issue-contract files for the exact
configured marker, writes sanitized evidence under
`/workspace/logs/settleora-auto-runner/review-fix/`, returns a structured
actionable finding when the marker is absent, and returns pass only after the
marker is present. The fixture still refuses broad paths, missing validation,
non-auto-merge contracts, non-canary real-runs, and disabled review-fix
mutation.

Dependent PR stack execution:

The stack controller stores an ordered stack ID, expected parent/base
relationships, exact heads, merge policy, required checks, own-delta evidence,
active PR, completed/remaining entries, and mutation markers under the
external logs/state root. Startup recovery resumes the active PR before
unrelated polling. The automatic sequence is: converge the parent, complete
validation/review/CI/scanner gates, merge with expected-head protection, prove
current `main`, retarget the dependent PR, prove its semantic own delta is
preserved, converge and gate the child, merge the child, and perform issue,
umbrella, ledger, and project hygiene exactly once. Own-delta proof uses file
set, diffstat/numstat, stable patch ID, normalized patch comparison, and
forward/reverse patch-to-tree proof; raw diff hashes are evidence but not the
sole semantic identity. The first live acceptance stack after this
implementation merges is #919 -> #920, planned read-only by this task.

Summary mode:

```bash
node tools/auto-runner/settleora-auto-runner.mjs --write-summary --since 24h
```

Real-run mutation and PR creation stay gated by lane policy, local validation,
unexpected pre-review GitHub mutation checks, and the mandatory pre-PR AI
review verdict. Implementation Codex is instructed to implement locally,
validate locally, write the local report only, and not push, open/update PRs,
merge, or mutate GitHub labels/issues/comments. The runner owns explicit-path
staging, commit, push, PR creation/update, CI watching, and issue outcome
labels/comments after an approved review verdict.

After implementation Codex exits, the runner treats local checkout state as the
source of changed-file truth. It collects unstaged tracked paths from
`git diff --name-only`, staged paths from `git diff --cached --name-only`, and
untracked paths from `git ls-files --others --exclude-standard`, then
deduplicates and sorts the combined set. That post-Codex set drives
contract/lane allowlist checks, validation planning, review-package evidence,
canary/summaries, and explicit-path staging. `no_changes` is used only when the
post-Codex working tree, index, and untracked-file set are clean. If any
changed path is outside the contract or lane allowlist, the runner fails closed
and leaves the checkout for operator inspection instead of silently restoring
or discarding implementation changes.

Before review, the runner checks for a remote task branch or PR for the task
branch and fails closed if either exists unexpectedly.

The reviewer subprocess boundary is channel-separated. The runner selects the
reviewer process `stdout` stream as the primary machine-parseable response
payload and writes the full raw review log, including `stderr` and diagnostic
session transcript material, for human inspection. When stdout is empty,
stderr may be selected only if it has exactly one valid verdict. Combined
stdout/stderr candidates are parsed separately only to reject contract-distinct
cross-stream verdicts or recognize one contract-identical diagnostic echo;
combined raw-log text is never selected as the verdict payload. Missing or
invalid selected payload fails closed.

Within the selected response payload, the review verdict parser extracts JSON
object candidates from raw JSON, fenced `json`, or JSON surrounded by
prose/tool output, validates each object against the strict verdict schema, and
accepts only when exactly one schema-valid verdict object exists. Invalid
schema/example candidates, including placeholder enum strings such as
`approve | changes_requested | needs_tommy | danger_gate | unable_to_review`,
are counted and ignored only when there is exactly one valid verdict object.
Malformed JSON candidates, oversized candidates, non-object raw JSON,
missing-field, unknown-field, out-of-enum without a valid verdict, zero valid
verdicts, or multiple valid verdicts fail closed as `unable_to_review`.
Review results, canary evidence, and summaries include diagnostics for the
selected response payload boundary, raw review log path, selected-payload valid
and invalid candidate counts, raw-log candidate counts when useful, selected
JSON source when present, and failure reason when review cannot be accepted.
Auto-merge is disabled by default.

`auto-claimed` and `auto-running` are active claim labels. Terminal real-run
outcomes remove both labels. PR-opened outcomes add `auto-pr-opened`,
blocked/manual outcomes add `needs-tommy`, danger outcomes add `danger-gate`,
and validation/review/runner failure outcomes add `auto-failed`. `no_changes`
removes both active labels, comments the outcome, and leaves the issue open.
Successful auto-merge performs the post-merge transient-label cleanup above;
it does not remove stop/manual labels before merge to bypass gates.
# Large-candidate review routing

Coherent large candidates automatically select strong cumulative review; the
legacy exact large-bundle approval is compatibility/exception evidence, not a
routine prerequisite. `lib/large-candidate-review-routing.mjs` owns versioned
route state, the immutable coverage manifest, dual-review section and final-
integration proof, deterministic split-or-block planning, context-limit
packets, exact-candidate invalidation, and atomic recovery state. Route state is
separate from reviewer verdict: required, in-progress, split, context-blocked,
coverage-incomplete, malformed, partial, or stale state can never pass review
or merge gates.

# Canonical operational status export

The control CLI provides one bounded, read-only handoff model in JSON or
Markdown. Both formats are generated from the same `operational_status_v1`
normalized model:

```bash
node tools/auto-runner/settleora-auto-runnerctl.mjs export-status --json
node tools/auto-runner/settleora-auto-runnerctl.mjs export-status --markdown
```

The export reads repository, GitHub, trusted owner-only operational state, and
the derived ledger through separate adapters. Repository/GitHub readback wins;
local state explains in-flight phase, counters, recovery, session, review,
split, stack, and effect posture but cannot override a changed live identity.
Contradictory repository/PR/head identity, multiple active local authorities,
or unreadable state produces bounded fail-closed reason codes. Reading never
repairs locks, advances recovery, schedules work, writes dedupe markers, or
performs GitHub/repository mutations.

The positive allowlist excludes raw prompts/provider responses, logs, diffs,
OCR/user content, secrets, environment/config values, endpoints, and absolute
storage paths. Arrays, strings, evidence references, and the complete output
are bounded; `lifetimeLocalSourceChangingRounds` is labeled telemetry-only and
is never a gate. The repository ledger is always labeled derived and has no
authority over selection, completion, closure, recovery, merge, or duplicate
suppression.

Operational state remains atomic versioned JSON/JSONL under the owner-only log
root. The inventory has correlation-scoped single writers and file-oriented
immutable evidence, with no cross-record transaction or indexed-query need;
SQLite/WAL is therefore not justified.

Ledger hygiene is milestone/batched only: implementation merge, material issue
or umbrella posture, manual/activation gate posture, major acceptance, or an
explicit scheduled reconciliation. Wait, retry, heartbeat, check polling,
source cycles, session rotation, and control transitions never request a
ledger-only PR.

# Historical push/PR recovery reconciliation

Preserved existing-PR admission uses one shared authenticated projection. A
contiguous matched PR-checkpoint prefix may be followed by zero through 49
finalized push-only heads, bounded by the existing 50-round convergence limit.
Each head must have one exact task-scoped push intent and descend from its
predecessor; the unique live branch and open non-draft PR must end at the last
head. PR intents in the unmatched suffix, gaps, duplicates, reordered or forked
heads, multiple PRs, and live-head disagreement are rejected.

The projection atomically replaces a stale persisted PR head before startup
interruption planning and carries its own live-read/evidence digest,
task/run/supervisor/claim/charge/lifecycle identity, continuation phase, and
recovery provenance. Historical effect-time main remains immutable in ordinary
continuation targets. Fresh current main is stored separately only after
proving original-base to effect-time-main to current-main ancestry. Downstream
recovery consumes both values and never substitutes current main for the
historical effect identity.

# Post-incident semantic successor authority

An authenticated recovery overwrite incident is quarantined read-only.
Ordinary startup recovery may neither advance it nor write its storage key.
When former bytes are unavailable, a future separately authorized operation
may construct a distinct successor only through the versioned generic contract
in `lib/post-incident-successor-recovery.mjs`.

The contract requires source-owned repository/Git, lifecycle, logical-task
budget, intent-lineage, projection/deployment, supervisor/child-run,
incident-report, and GitHub no-effect verifiers. The closed verifier registry,
verifier IDs/versions, accepted store contract for each class, and verifier-set
digest live in `lib/semantic-recovery-authority.mjs`; JSON configuration cannot
provide a verifier, parser, class, provenance identity, claim, or store
authority. A source descriptor only selects one store. The selected source-
owned verifier authenticates its canonical bounded store and derives the
normalized result. Its provenance identity is derived from the authenticated
producer/store/path/digest identity rather than copied from an evidence
envelope. A runner-owned worktree cannot independently authenticate
repository/Git provenance because the runner user can replace its Git metadata.
The source-owned offline native producer in
`semantic-recovery-native-producer.mjs` therefore performs a fresh domain read
for each class and plans eight distinct root-owned snapshots. Those snapshots
become production authority only after a later root-invoked installation
reruns the closed readers, publishes the exact plan, and passes protected
readback; bytes emitted by an unprivileged planning run have no authority.
Ordinary launch and
later safety-critical Git calls use a fixed executable, pinned Git directory,
common directory, worktree and index identities, and a closed Git environment.
The complete admitted tuple is retained for both control-plane and adopted task
worktrees; replacement of any admitted Git entry or directory fails closed.
Legacy grafts, object alternates, HTTP alternates, and shallow metadata are not
accepted as neutral repository state. Remote operations select the
authenticated literal URL rather than a mutable remote name. A runner-owned
Git directory cannot protect that URL from a same-UID `insteadOf` or
`pushInsteadOf` spawn race, even when its mode removes owner write bits.
Production external `fetch`, `push`, and `ls-remote` therefore fail closed
before spawning Git until a separately deployed protected transport producer
provides a kernel-enforced or privileged immutable execution boundary. Local
file transport remains an explicit test-only adapter and supplies no production
authority. Repository and linked-worktree metadata are still rechecked around
local Git reads.
Recovery evidence double-reads the exact ref, index tree, status, and path
sets around an immutable-OID commit read before it can be marked complete.
Launch
cleanliness compares raw tracked bytes to index objects without invoking
filters and rejects unsafe Git-dir attributes, active Git-dir excludes, non-
allowlisted configuration, and hidden index flags. Lifecycle and logical-task-
budget files and local Git objects remain domain inputs, but same-UID stores are
not independent authority. The native producer authenticates them together
with source-owned cross-domain invariants and freezes each projection beneath
a different fixed protected path. Repository Git is reread from the clean
canonical repository plus remote/default-branch evidence; lifecycle, budget,
intent, supervisor, and incident readers each bind their own task, claim,
charge, run-role, counter, and effect records; projection/deployment binds the
installed runtime, profile, approval, launcher, health, and incident posture;
GitHub no-effect uses authenticated paginated exact-target readback and a
bounded freshness window. Each output retains the existing verifier
ID/version/store kind and only matrix-owned claims. Equal bytes, reused
provenance, request/bundle/expiry disagreement, foreign claims, or cross-owner
contradiction fail closed.

The fixed future layout contains `producer/` for the root-owned executable,
immutable module bundle and canonical policy; exactly eight
`stores/<authority-class>.json` snapshots; one exact
`grants/<operation-id>.json`; `successors/`, `successors/incoming/`,
`successors/provenance/`, and `successors/commits/`; and
`install-manifest.json` for exact plan-versus-install readback. Every ancestor
and directory must be canonical, root:root, non-symlinked, and not group/world
writable. Protected files are bounded immutable producer bytes or canonical
JSON, root:root, one-link, and exact mode `0444` (`0555` only for the producer
entry point). Extra or missing store names, link or realpath changes,
ownership/mode drift, a future-dated capture, and byte/digest drift fail closed.
The eight stores are immutable installation-time captures, not short-lived
operation grants: their `capturedAt` is retained indefinitely so the no-clobber
producer installation remains usable. Every later grant/successor operation is
still separately gated and freshly reauthenticates the exact GitHub no-effect
state; installation never creates that grant.

The installed producer has five canonical-stdin, non-mutating modes:
`--plan-install`, `--verify-install-plan`, `--plan-grant`,
`--verify-grant-plan`, and `--verify-installed`. Canonical machine JSON goes to
stdout and a bounded high-level summary goes to stderr. The closed install
request selects one authenticated deployment-evidence document and digest,
repository, validity interval of at most 15 minutes, exact installed-runtime
tuple, and the sole operation `install_native_semantic_recovery_producer`.
Unknown fields and alternate operations, commands, paths, environment, or
output roots are rejected. The plan derives subordinate digests, enumerates
future files and directories, reports zero service effects, and keeps producer
installation, grant installation, and successor execution distinct.
Producer executable/support bytes are selected only from an authenticated
GitHub HTTPS fetch into a unique root-owned `0700` checkout at the exact
canonical `refs/heads/main` commit, never from the source-UID-writable worktree
or its object database. The owner commit is only an expected scalar: root
fetches `main`, refuses a mismatch, and later requires the same SHA from the
fresh repository candidate and GitHub no-effect authority.
`semantic-recovery-native-install.mjs` rereads the raw
commit, every reachable tree, and every reachable blob from that private Git
object database and locally recomputes each Git object ID. It walks trees one
object at a time, so recursive-API truncation or pagination cannot be mistaken
for a complete repository. Duplicate, conflicting, escaping, symlink, missing,
extra, or ambiguous support members fail before materialization. The closed
bootstrap/producer dependency closure is then copied to a second unique
root-owned private directory, each member is fsynced and reread by Git blob ID,
SHA-256, owner, group, mode, link count, and relative realpath immediately
before the root-authoritative producer path runs. The selected main SHA is
frozen in the plan and policy, and a final independent full authority-context
reread must match immediately before publication.
Grant planning is available only through the exact installed root-owned
producer. Its closed request supplies the previously verified install package,
one exact operation selector, and the semantic evidence packet; the producer
reauthenticates the installed tree and all eight protected stores, derives the
operation manifest in its closed-environment real/effective source-UID/GID
child, and only then emits the fixed-path grant bytes from the root parent. A
caller-supplied manifest, self-digested substitute package, or installed-tree
drift cannot produce a grant plan.
The production repository path is resolved only inside live source modes, so
import-safe helpers and verification tests do not depend on the DevBox checkout
location. Grant derivation and each persistence authentication freshly rerun
the authenticated paginated GitHub exact-target no-effect read and require its
digest to equal the protected source claim. The final pre-write read emits a
canonical source-owned snapshot bound to the exact repository, issue, branch,
manifest, request, and operation, with an exact 30-second validity interval.
This explicit point-in-time snapshot replaces any false claim that a remote
GitHub state and a local filesystem commit can participate in one atomic CAS.
The root parent authenticates snapshot freshness before publication and again
immediately before the no-clobber commit marker, then binds the complete
snapshot and digest into provenance and commit readback. Expiry leaves only
non-adoptable partial state; an exact retry can resume that snapshot only while
it remains fresh, or adopt an already exact committed successor after a new
complete authority authentication.

## Root-authoritative first-install protocol

The source-owned first-install controller is
`semantic-recovery-native-install.mjs`. Its unprivileged interface accepts only
the versioned repository/source/bootstrap-blob/correlation hint and can prepare,
run exactly one interactive-sudo handoff, or inspect the owner journal. It
accepts no plan, manifest, store bytes, verifier result, helper digest, path
list, command, environment, or effect. Arming durably advances the owner-only
journal to `sudo_started` and then invokes the one fixed bootstrap argv on
`/dev/tty`, so cancellation, EOF, timeout, or process loss cannot silently
authorize a second sudo attempt.

The later owner-authorized bootstrap is the reviewed source at
`semantic-recovery-native-install-bootstrap.sh`. Before the handoff can be run,
those exact bytes must already have been installed as root:root, one-link mode
`0555` at
`/usr/libexec/settleora-semantic-recovery-native-install-bootstrap` through a
separate authenticated OS/administrator channel. Installing that prerequisite
is not part of this protocol and is not performed by this source task. The
fixed root-owned path—not a checkout, clipboard, shell literal, stdin program,
or caller-selected executable—is the first root-executed code. Sudo receives
only the exact commit/blob/correlation/operation and owner-journal digest
scalars. The bootstrap verifies its own Git blob OID and metadata before any
network access, freezes the exact armed owner journal inside one atomically
published root-owned receipt,
and then uses absolute system-tool paths, a sanitized environment, HTTPS origin
`https://github.com/tommytang213/Settleora.git`, disabled redirects and
credentials, strict object fsck, a unique root-owned `0700` temporary checkout,
and the remote canonical-main ref. Before Node starts, the embedded trusted
materializer walks the complete tree listing, rejects symlinks, gitlinks and
all other non-regular members, recomputes every blob ID from raw bytes, and
materializes the auto-runner tree exclusively from those blobs. It verifies
that the fetched bootstrap is the selected tree member and byte-identical to
the fixed installed bootstrap before executing any fetched repository byte.
Root state ancestors are opened/created descriptor-relatively with no-follow
checks and fsynced before a receipt is published. A later separately authorized prerequisite-install task must
bind the helper to the exact merged head; the handoff must present the full
scalar-only argv for owner review. Sudo stdin is reserved for the real TTY/PAM
exchange and never contains program bytes. Piping or typing a bootstrap, using
`bash -c`, accepting a local helper hash, or using `sudo node /mutable/path` is
prohibited.

Inside root, the controller independently authenticates the complete raw Git
object closure, materializes the exact support closure, freshly derives the
closed production request from the fixed deployment-evidence document and
current runtime/profile/approval/launcher/health/incident/recovery/GitHub
state. Two separately spawned real/effective-root readers execute the same
authenticated root-owned read-only materialization: one runs the planner and
the other independently reconstructs every request, projection, byte,
metadata, layout and forbidden-effect field without importing the planner.
Each root process applies the fixed production source UID/GID only as the
expected-owner policy used by the existing artifact validators; it never drops
to that UID, inherits its process authority, or accepts its process output.
The fixed, authenticated repository path is supplied to Git only as the exact
command-scoped `safe.directory`, so Git's different-owner defense remains
closed while real-root readers can traverse that one already-verified path.
Root requires their complete encoded packages to be byte-identical. The
same two-reader comparison is mandatory again at the publication/adoption edge;
the original decoded package is canonically re-encoded before comparison.
GitHub no-effect reads use a fixed source-owned Python TLS client bound to
`api.github.com`, closed repository/issue/routes, system trust roots, no
redirects, bounded response bytes, and no `HOME`, CLI configuration, token,
credential, argv route, or environment authority. Each reader caches only its
own internally consistent page set across request and package/projection
derivation; the separately spawned reader and later edge pass obtain independent
fresh sets. Every response must carry an authenticated public rate-limit header
at or above the phase-specific floor. Initial planning reserves the complete
edge-plus-readback budget, the edge reserves one complete readback, and recovery
consumes only its reserved final budget. Any full 100-record REST page blocks
before publication because proving another page would exceed that fixed
six-request-per-reader reservation. The
unprivileged plan is never an input. Live publication is reachable only in this root/private-source mode;
fixture publication uses an injected in-memory filesystem and never selects a
path.

New installation uses one root-only `0700` staging container with a sealed child
on the same filesystem, exact plan-listed members, exclusive/no-follow
creation, exact metadata, file fsync, every descendant directory fsync, staged
readback, a new complete two-reader root-authority derivation at the publication
edge, a second staged readback, and the source-owned Python
`renameat2(RENAME_NOREPLACE)` helper. It then fsyncs the protected parent and
ancestor and performs complete final readback. The helper fsyncs both source
and destination directories around the cross-directory rename and admits only the
fixed final root and the correlation-bound child. A normal rename removes the
empty private container before completion. If transport is lost and either the
child or container remains, even an exact final readback stays
`publication_ambiguous`; the protocol neither reports success nor cleans the
residue. An exact existing final
tree is adopted without rewrite only after every installed file, descendant
directory, protected parent and ancestor is fsynced and a second complete
readback succeeds, followed by the same fresh root-authority derivation and a
final edge readback; partial, extra, stale, or conflicting state is left
untouched. Grants and all successor subdirectories must be empty.

Owner-only and root-only canonical journals use atomic temporary write, file
fsync, rename, directory fsync, and an exclusive immutable transition claim
bound to the exact previous digest and next sequence. The root bootstrap writes
one root-owned atomic receipt containing the frozen owner journal before source acquisition;
the privileged journal binds the exact owner `sudo_started` transition digest.
Both journal names are
bound to repository/source/operation—not the caller-selected correlation—so a
fresh correlation cannot reset the one-shot sudo/publication counters. States are `prepared`,
`awaiting_interactive_sudo`, `sudo_started`, `root_authority_rederived`,
`root_plan_verified`, `publication_intent_durable`, `publication_started`,
`publication_ambiguous`, `installed_verified`, `adopted_verified`, `blocked`,
and `completed`. Before publication, root also persists the complete verified
package in the root-only journal directory. Restart reconstruction uses that
original request timestamp/package and freshly rereads all authorities to
corroborate the exact bytes; it never creates a time-varying replacement plan.
A crash or lost transport after publication starts permits only that exact
package plus durable installed-state readback, never replay. A root-owned,
owner-readable append-only sanitized result sequence is keyed by the journal
sequence and digest. Result records use an atomic same-directory hard link from
the authenticated `0444` temporary to the journal-derived final name, followed
by directory fsync, inode/link-count readback, temporary unlink, another fsync,
and canonical final readback. This provides no-clobber publication without a
second interpreter boundary; the Python `renameat2` helper remains exclusive to
the protected directory publication. If result transport fails after a
temporary is durable, retry authenticates and reuses it. Fully authenticated,
byte-identical duplicates are coalesced with a directory fsync after each
unlink; conflicting temporaries remain untouched and block publication.
Readback-only owner resume may inspect one exact authenticated stranded result
temporary only to report its bounded state/reason. A blocked temporary is never
promoted to installation success, while any non-blocked temporary requires a
separate manual recovery gate. Temporaries for every other operation remain
untouched. If the durable journal has advanced beyond one exact stranded
earlier result, the earlier record is first published to its own identity and
read back before the later append proceeds.
Journal, snapshot, claim, and recognized result-temporary names are linked only
from fully written, metadata-finalized, fsynced files in an ignored staging
namespace. An exact crash between the no-clobber link and staging unlink is
finished by inode-bound readback; partial staging bytes never occupy a canonical
reader-visible name. Readback-only recovery recreates the original bounded
request at its authenticated snapshot time, freshly rereads current authorities,
and compares the exact historical package without reopening publication.
The sequence lets the unprivileged coordinator durably complete its journal
after verified root completion. Once installation
or adoption is verified, `blocked` is no longer a legal transition: failure of
the final journal or result publication reopens only frozen-package readback,
completion, and idempotent exact-result adoption. Contradiction or
private-stage residue remains a bounded blocker. Process output is
represented only by byte counts and SHA-256 digests. Health tokens,
authorization headers, credentials, raw evidence, logs, and provider payloads
never enter argv, environment, journals, summaries, or exceptions.

The source-owned handoff fragments are rendered only through
`node tools/auto-runner/render-semantic-recovery-native-install-handoff.mjs`
with either `--windows-ssh-coordinator` or `--remote-controller-flow`. The
Windows OpenSSH fragment keeps the environment sanitized but restores the
independently canonicalized `ProgramData` directory required by Windows
OpenSSH. Preflight redirects and closes stdin immediately after process start
so a forced TTY cannot echo queued console input into canonical JSON; execute
keeps stdin attached to the real TTY for the one PAM password exchange. The
remote flow accepts both
`native_install_interactive_handoff_completed` and
`native_install_interactive_handoff_requires_readback` from the one arm call,
then always enters `--resume` without another sudo attempt. Unexpected reason
codes remain fail-closed.

Root subprocess failures cross process boundaries only as fixed allowlisted
`native_install_root_*` reason codes. Public GitHub transport can therefore
distinguish bounded rate-budget, response, timeout, route, and process classes
without retaining traceback text, paths, credentials, headers, payloads, or raw
stdout/stderr. A durably blocked root result is returned through successful
controller transport as `native_install_root_result_blocked`; transport success
never changes the blocked installation outcome.

If the first interactive transport is lost after `sudo_started`, `--resume`
remains readback-only and never repeats sudo. The controller, bootstrap, and
sudo-argv builders expose no recovery-sudo mode: once `sudoAttemptCount` reaches
one, every later automatic or source-owned path has `sudoAllowed: false`.
Absent, temporary, blocked, or publication-ambiguous root results therefore
stop at a separate manual recovery gate rather than replaying privilege.

This offline root-invoked model is the smallest privilege boundary because it
adds no listener, service, socket, timer, sudoers rule, credential, arbitrary
copy, command passthrough, or generic JSON-signing surface. A later authorized
installer runs the authenticated temporary root producer, rederives the
snapshots from fresh domain sources, verifies the exact plan, publishes without
clobber, and verifies the installed tree. Root planning directly from a
runner-writable checkout is rejected. Copying the planner's projected bytes
without root rederivation is insufficient. The
unprivileged runner can only read installed root-owned snapshots and, after a
separately installed grant and root-executed persistence operation,
authenticate a committed successor; it cannot invoke a privileged mutation.
Only the installed exact root-owned executable additionally admits
`--persist-successor` and `--readback-successor`. Both take the closed semantic
packet plus exact 64-hex operation ID; the mutating mode refuses any invocation
outside the fixed installed path or without real/effective UID 0. Its shebang
and child launch both name the root-owned canonical `/usr/bin/node` directly,
so PATH is never consulted before the installed-path guard. For fresh
runner-owned artifact reads, the root process starts a closed-environment child
with real/effective UID and GID set to the authenticated external-config owner;
an effective-UID-only transition is insufficient and is rejected. The root
parent compares the stable authority/construction portion of two canonical
child results, uses the second child's fresh exact-operation GitHub snapshot,
reauthenticates the fixed protected stores and real grant immediately before
the write, and alone calls the bounded persistence core. No path, command,
environment, or output selector crosses that boundary.

Claim ownership is also source-owned and immutable. The versioned matrix and
its deterministic digest name every required domain owner. Repository identity
requires repository/Git plus GitHub no-effect authority; candidate Git
identities require repository/Git plus projection/deployment; task, claim,
charge, and counters require lifecycle and logical-task budget owners; run
identities require lifecycle plus supervisor/child-run; incident identities
require projection/deployment plus incident-report; GitHub effects require
GitHub no-effect plus incident-report; and successor phase/eligibility require
lifecycle plus projection/deployment. Optional corroborators cannot replace a
required owner. An unknown claim/class, missing owner, owner disagreement, or
present corroborator disagreement fails closed. There is no arbitrary two-
class rule, majority vote, config override, or grant-defined ownership.

The canonical manifest binds the unavailable predecessor hash with
`bytesAvailable=false`, immutable incident path/hash, task/candidate and
original/failed/consumed run identities, installed runtime/profile/approval/
launcher/health identities, bounded artifact digests, exact claim-owner and
verifier-set bindings, no-effect proof, and one-shot exhaustion. The manifest
is computed first; production then derives the request, 64-hex operation ID,
and distinct successor key, avoiding a digest cycle.

Operation authority exists only at the fixed canonical protected-control root
`/etc/settleora-auto-runner/semantic-recovery-authority`. One operation selects
only the exact direct child
`grants/<64-lowercase-hex-operation-id>.json`. The filename, body operation ID,
derived request, and allowed action
`create_or_adopt_semantic_recovery_successor` must agree. Production inspects
the lexical and canonical chain from `/etc` through the grant without accepting
symlinks. Directories must be root-owned and not group/world writable; the
grant must be a root-owned regular one-link file with exact mode `0444`, stable
bounded canonical-JSON bytes, and one exact digest. Missing, malformed,
ambiguous, redirected, changed, or mismatched grants fail before persistence.
An owner-only runner file, config selector, alternate root, `latest` file, or
caller-created authorization object has zero authority.

The root-owned grant exactly binds the manifest, matrix and verifier digests,
every evidence source path/role/digest/provenance identity, bound artifact and
run identity, predecessor and incident, PR evidence, runtime identities,
counters, one-shot/no-effect posture, lifecycle generation, forbidden writes,
request/action, and the successor key plus exact successor, prepared-provenance,
and final-commit paths under the fixed protected successor root. Startup discovery and authoritative reload
use the same registry. Immediately before persistence, production
reauthenticates all sources, bound artifacts, runtime claims, manifest, and the
same exact grant. Persistence additionally requires a fresh source-owned
reauthentication of all eight stores, bound artifacts, runtime tuple, grant,
and GitHub no-effect snapshot immediately before the complete root-executed
operation. Any effect observed by that final read, source drift, snapshot
identity mismatch, or expiry therefore fails closed. The successor cannot
alias the predecessor/incident key. The runner accepts no persistence callback
and contains no semantic-successor pathname writer; its ordinary recovery
writer refuses every write while the incident contract is configured. The
installed producer owns only descriptor-relative operations under the fixed
protected `successors` destination. It stages canonical bytes, fsyncs each
record, publishes without clobber, fsyncs parent directories, and writes the
commit marker last. Prepared provenance and successor files
become accepted only through a final immutable commit marker binding both
digests. A crash-retained incoming/final hard-link pair is reconciled only when
both canonical names prove the same root-owned inode, exact two-link metadata,
and expected bytes; both publication directories are fsynced around link and
unlink. If the exact commit final link was already durably published, fresh
current authority authentication may remove only its authenticated second name
and adopt the historical committed bytes even after snapshot expiry; every
genuinely pre-commit prefix still requires a fresh snapshot. Every pre-commit
crash point is inert and exact-repeat resumable, while a commit without both
exact prepared records is rejected as torn. The created
successor remains non-executable pending its later separately authorized
handoff.

Repository source defines this contract only. It does not create the `/etc`
root, install a grant, deploy a producer/runtime, or execute a live successor.
Those are separate manual operations. Native producer installation is also a
separate deployment gate. The required sequence is source merge, separate
producer/root installation authorization and verified install, separate exact
grant/successor authorization, root-executed persistence and authenticated
readback, then another explicit decision about Issue #959 continuation.
Persistence returns `authorizedToContinue=false`; it never submits work or
changes the incident, predecessor, lifecycle, budget, intent, or Issue #959.
The runner-side production registry cannot label protected readback adopted;
fresh adoption is available only through the installed root producer, which
repeats the complete source and GitHub authentication first.
Without the installed producer root and real grant, production remains
unreachable before successor persistence.
Tests use synthetic metadata adapters and never inspect or mutate the live
`/etc` root.

For an exact authenticated terminal-validation-retry projection, the reloaded
projection digest directly authorizes bounded lifecycle reopen. The legacy raw
retry predicate remains only for non-projected compatibility. An unexpected
terminal planner result in projected posture blocks before any recovery write.

## Inactive trusted SSH entry boundary

Issue #1012's trusted SSH entry boundary is defined by
`docs/architecture/TRUSTED_SSH_ENTRY_BOUNDARY.md` and source under
`tools/auto-runner/trusted-ssh-boundary/`. It is not installed or activated by
the runner. It exists because OpenSSH invokes `ForceCommand` and authorized-key
commands through the configured login shell with `-c`; client-side `env -i`
cannot prevent a Bash startup hook from running before that point.

The selected future boundary uses a dedicated account whose login shell is the
freestanding statically linked `settleora-trusted-ssh-entry` ELF. Its `_start`
uses syscalls directly, so libc tunables or other libc startup processing cannot
precede its validation. `ForceCommand
settleora-handoff-v1` normalizes shell/command/subsystem requests but is not the
pre-shell trust boundary. The native shell accepts only the exact installed
OpenSSH `shell -c` argv shape and the version-1 `preflight` or `execute`
identity grammar, clears the complete environment, and executes the fixed
root-owned dispatcher closure. Execute requires and preserves the PTY needed
for one password-requiring sudo gate.

The source-owned generator is generation-only:

```bash
/usr/bin/node tools/auto-runner/trusted-ssh-boundary/generate-trusted-ssh-boundary-plan.mjs \
  --output-root /absolute/owner-private/fixture-root \
  --source-commit <exact-40-hex-commit> \
  --source-tree <exact-40-hex-tree> \
  --repository-root /absolute/clean/Settleora-checkout \
  --native-shell /absolute/private/build/settleora-trusted-ssh-entry \
  --dispatcher-module /absolute/source/settleora-trusted-ssh-dispatcher.mjs \
  --fd-exec /absolute/private/build/settleora-trusted-ssh-fd-exec \
  --pam-preauth /absolute/private/build/settleora-sudo-preauth \
  --pam-preauth-module /absolute/source/settleora-trusted-ssh-pam-preauth.mjs \
  --root-gate /absolute/private/build/settleora-root-gate \
  --root-gate-module /absolute/source/settleora-trusted-ssh-root-gate.mjs \
  --root-bootstrap-module /absolute/source/settleora-authenticated-root-bootstrap.mjs \
  --support-library /absolute/source/lib/trusted-ssh-boundary.mjs \
  --operator-key-fingerprint SHA256:<owner-supplied-fingerprint> \
  --generated-at <injected-UTC-second>
```

The generator independently reads `HEAD` and `HEAD^{tree}` from that clean
checkout, authenticates JavaScript inputs as exact Git blobs, rebuilds native
inputs from exact Git blobs with fixed compiler arguments, and rejects caller
identities or artifacts that differ. It writes only beneath the existing
owner-private output root. It does not run
account, password, SSH, sudo, sshd, PAM, service, deployment, native-install,
runner, or handoff operations. The emitted authorized-key content is a
placeholder template and contains no key bytes. Before later publication, the
read-only realized-key validator requires one exact `restrict,pty` allowed-key
line and verifies its SHA-256 fingerprint. The Match contract also requires
effective `AuthorizedKeysCommand none`, preventing a global alternate key
provider from bypassing that one-key boundary; certificate and principal
authority are also explicitly disabled. The PAM pre-auth helper authenticates the
installed root-bootstrap module against the root-owned artifact manifest before
claim consumption; the post-auth root gate atomically moves that receipt to a
root-only entered state exactly once, and the bootstrap reauthenticates the package and entered
receipt before exposing the fixed later PR #1048 integration envelope. The plan validator is also fixture/
private-root-only in source-development tasks:

```bash
/usr/bin/node tools/auto-runner/trusted-ssh-boundary/validate-trusted-ssh-boundary.mjs \
  /absolute/owner-private/fixture-root/trusted-ssh-boundary-plan-v1
```

This boundary specifically requires fixed `/usr/bin/node` `>=22.15.0 <23.0.0`
with `process.execve`, even though other runner surfaces retain the broader
approved Node 22 range. The generated plan and read-only validator bind this
floor; PAM pre-auth and the root gate verify it before consuming or entering
the one-shot receipt.
The installed sudo authority collector rejects every unmodeled includedir
entry, sudo alias, numeric UID/GID binding, and run-as group instead of silently
excluding authority that sudo would load. Defaults and rule-user binding shapes
are validated before applicability, so command scopes and netgroups also fail
closed. Include directives with valid trailing comments are captured, while
malformed directive-like lines are rejected before conversion.

The password prompt is bounded before authentication, not merely after the
sudo command starts. A root-owned freestanding PAM pre-auth helper consumes the
one-shot claim before the dedicated service includes `common-auth`, and the
sudoers contract sets `passwd_tries=1`. Replay therefore fails before a second
prompt. The private fixtures also carry a closed normalized effective-sudo
projection and its structured source observation. The source-owned collector
requires a caller-private snapshot containing the complete sudoers include
tree, passwd/group/shadow/NSS inputs, and transitive PAM include tree; it binds every
source's ownership, mode, link count, size, and approved digest plus the exact
installed `cvtsudoers` digest. Later installation must derive the policy from
that closed source set and reject any extra source, group match, exempt group,
PAM setting, password-owner flag, timestamp setting, security-default drift, or
command rule. NSS accepts exactly one local-files source for each passwd,
group, shadow, sudoers, and initgroups database. PAM include/substack lines may
carry trailing comments, but every directive-like line outside the closed
grammar fails rather than disappearing from the captured closure. Live
snapshot collection and PAM/sudoers installation remains a separate explicit
owner gate.

The stable future integration envelope is
`settleora_trusted_ssh_handoff_package_v1`. Draft PR #1048 must remain
unmerged and unchanged until this boundary source separately merges, is later
installed under an explicit manual security gate, and its installed
sshd/account/shell/sudo/PTY behavior is verified. Only then may PR #1048 adapt
its authenticated package producer to this envelope and reconverge. Retained
handoff `20260804-1825` is never an input or reusable identity.
