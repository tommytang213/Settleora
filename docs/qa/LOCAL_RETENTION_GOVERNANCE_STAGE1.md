# Retention governance stage 1: regression-test scope proposal

Status: Atlas technical scope approval recorded on 2026-11-18; activation remains
pending independent exact-head review, required checks and normal reviewed landing.
The root technical lead explicitly approved only the bounded regression-test
scope below. This is a governance-only change on verified main base
`f0f54b081b37e48b1099a0379c3d444b08b0ea94`, not the combined planner branch.

## Exact scope

Only the existing M15-allowed guard and two docs/qa decision/proposal files
change. No test executable is tracked in docs or .ai. No planner, producer,
archive adapter, workflow, service, live driver or runtime installation changes.

The proposal permits one future synthetic regression-test file, and only its
reviewed regular mode-100644 blob:

- Path: `scripts/ai/test/retention-governance-scope.test.mjs`
- Blob: `aa8cb697fc3f539f1f11e8004e07bd4e00735ba8`

The test is self-contained and does not require planner files. Its reviewed
source is kept as external validation evidence until a legitimate later test
PR can add it at that path. This avoids needing planner files merely to test
the governance mechanism.

The guard reads `docs/qa/LOCAL_RETENTION_REGRESSION_SCOPE_DECISION.json` from
the immutable comparison base, not the candidate branch or worktree. Its
canonical contents (modulo trailing whitespace), exact scope and approved
decision must match. The candidate record now says **approved**, reflecting the actual Atlas root
technical decision. It cannot approve its own diff or activate from this
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
2. Atlas has made the specific technical decision. This revision records it
   by changing only the decision value and this factual documentation. Rerun
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
