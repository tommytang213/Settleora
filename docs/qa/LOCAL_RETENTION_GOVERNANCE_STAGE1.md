# Retention governance stage 1: regression-test scope proposal

Status: Atlas root renewed technical approval for the exact regression-test
blob below after independent inspection of the trusted-base milestone fix and
the added synthetic cases, including fail-closed base read errors. Activation still requires independent exact-head
reviews, all required checks and normal reviewed landing. Scope remains only
one future synthetic regression test, not planner or live cleanup authority.
This is a governance-only change on verified main base
`f0f54b081b37e48b1099a0379c3d444b08b0ea94`, not the combined planner branch.

## Exact scope

Only the existing M15-allowed guard and two docs/qa decision/proposal files
change. No test executable is tracked in docs or .ai. No planner, producer,
archive adapter, workflow, service, live driver or runtime installation changes.

The proposal permits one future synthetic regression-test file, and only its
reviewed regular mode-100644 blob:

- Path: `scripts/ai/test/retention-governance-scope.test.mjs`
- Blob: `f2b5081db4c798a59029be1a917c6ef91291cb5b`

The test is self-contained and does not require planner files. Its reviewed
source is kept as external validation evidence until a legitimate later test
PR can add it at that path. This avoids needing planner files merely to test
the governance mechanism.

The guard reads `docs/qa/LOCAL_RETENTION_REGRESSION_SCOPE_DECISION.json` from
the immutable comparison base, not the candidate branch or worktree. Its
canonical contents (modulo trailing whitespace), exact scope and approved
decision must match. The revised candidate record records actual Atlas root technical approval
for this exact expanded regression-test blob. It cannot approve its own diff or activate from this
candidate: the comparison base still lacks the record. Extra/duplicate fields, different mode/blob/path/authority,
symlink records, changed test bytes or executable/symlink tests fail closed.
Unrelated test files, tools and forbidden runtime paths remain disallowed.
M15 and existing forbidden-path precedence remain unchanged.

The base record is not a signature or independent source of permission.
Callers must verify the actual intended PR target and exact base/head under
existing repository rules; choosing an arbitrary approving local base is not
authorization. No candidate may approve itself.

## Legitimate staged sequence

1. Independently review this guard-and-docs-only proposal and external synthetic
   tests. Require both original main guard and proposed guard to pass this
   exact three-file diff, plus normal required repository checks.
2. Atlas has renewed approval of this exact test blob. Rerun
   both guards/tests and obtain fresh independent exact-head reviews and all
   required hosted checks before any separately authorized merge. Technical
   scope approval is not a bypass of CI, reviewer, or publication requirements.
3. After approved governance is normally landed on the verified target base,
   a separate PR may add only the exact reviewed regression test. A test file
   edited since approval needs a new reviewed blob decision.
4. The five-file planning artifact and its separate exact-blob mechanism remain
   outside scope. They require their own reviewed governance decisions and
   passing gates. This stage does not implicitly admit either.
5. Future producer/lease/archive integration and live adoption remain separate.
   No current owner or historical attempt is modified by this proposal.

This is not retargeting, a milestone switch, bootstrap-flag reuse, a generic
tools allowance, a skip of the current guard, or executable code hidden in
allowed documentation directories.

## Validation evidence and limitations

External synthetic tests execute the proposed guard against temporary Git
repositories. They test absent, proposed, candidate-only, worktree-only,
malformed, duplicate, broadened and symlink approval; exact approved blob;
content/mode/type drift; unrelated tests; planner rejection; forbidden paths;
and wrong milestone. Synthetic approvals confer no real authority.

Prepared planner remains at `49b3835eea7293ef7f04e34e1d7876a4c2cf0190`.
The prior combined governance proposal at
`99c0fd8eb9f3d1ad9882c6407cad5ff541c17c03` remains unpushed and blocked.
Stage 1 does not mark either branch mergeable or authorize any live cleanup.

No deployment, production, security/access, credential or settings changes.

## Hosted-review hardening

CodeRabbit identified three edge cases reproduced with four failing synthetic
cases: leading/trailing whitespace pathname aliasing, rename-source omission,
and a mutable HEAD changing between diff and blob lookup. Changed paths now
use NUL delimiters without trimming and disable rename detection so source
deletions remain classified. Base and head resolve once to immutable commits
used by both the diff and approval/blob checks. The expanded external test has
44 cases; no real repository ref is moved by its synthetic race fixture.

A later hosted-review finding showed that candidate/worktree milestone metadata
could select the exception on a non-M15 or unknown base. Three added cases
reproduced that issue. The exception now additionally resolves milestone from
the immutable base state/Markdown using existing fallback semantics; only base
M15 qualifies. Legacy classification outside this exception is unchanged.

Base metadata reads distinguish absent entries from failed reads. At the Git
read step, only an absent entry is treated as empty; output-limit and other read
failures deny the exception. After a successful read, existing parser semantics
still permit Markdown fallback when state has no usable milestone (such as `{}`).
The exact-blob decision applies to the supplied `--head` tree, default `HEAD`,
not an inferred GitHub PR head. Existing hosted checkout may supply a synthetic
merge tree; differing merged test bytes correctly fail closed. A caller seeking
a PR-head-only verdict must use a clean checkout of that verified commit,
with matching milestone files, and explicitly supply it as `--head`. The flag
selects the diff/blob tree but does not select legacy worktree milestone files. Workflow
checkout behavior is unchanged. Atlas renewed exact-blob approval after reviewing the two additional cases.

Present base metadata must be a regular Git blob (mode 100644 or 100755).
Directories, symlinks and submodules are rejected rather than parsed as text.
Atlas renewed approval for the expanded exact test blob after source/hash
inspection of the four new metadata-type cases.

Both present base metadata entries are validated before parser precedence is
applied, even when state already selects M15. Tree queries use root-relative
paths and diff output ignores relative-path configuration. Raw path bytes remain
unchanged for classification but diagnostics JSON-escape paths and ref labels.
Atlas renewed technical approval of this exact blob after inspecting the seven
new regressions and the combined corrections.
