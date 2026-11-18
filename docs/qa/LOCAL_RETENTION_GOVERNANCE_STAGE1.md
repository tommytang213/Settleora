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
- Blob: `6f44da97079c7a29fd5ce090bf20d60e5acb51dd`

The test is self-contained and does not require planner files. Its reviewed
source is available in the [dedicated PR review evidence comment](https://github.com/tommytang213/Settleora/pull/1368#issuecomment-6975628977) until a legitimate later test
PR can add it at that path. This avoids needing planner files merely to test
the governance mechanism.

The guard reads `docs/qa/LOCAL_RETENTION_REGRESSION_SCOPE_DECISION.json` from
the immutable comparison base, not the candidate branch or worktree. Its
canonical contents (modulo trailing JSON whitespace), exact scope and approved
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
   tests. Obtain the exact source from the dedicated evidence comment above,
   save only its fenced base64 text and decode it to
   `retention-governance-scope.test.mjs` (for example, `base64 --decode`). Then
   keep that decoded file outside the checkout and set `TEST_FILE` in the same
   shell to its absolute path. Run `git hash-object --no-filters -- "$TEST_FILE"`.
   Require equality with the decision record blob before execution. The hosting is editable; the
   content hash establishes immutable identity, not the URL. If missing or
   mismatched, stop and obtain the pinned bytes rather than changing the pin.
   Require both original main guard and proposed guard to pass this
   exact three-file diff, plus normal required repository checks.
2. Atlas has renewed approval of this exact test blob. Rerun
   both guards/tests and obtain fresh independent exact-head reviews and all
   required hosted checks before any separately authorized merge. Technical
   scope approval is not a bypass of CI, reviewer, or publication requirements.
   From the root of the clean reviewed checkout, run the already decoded file
   from Step 1 against this checkout's proposed guard, verifying its hash first:

   ```sh
   test "$(git hash-object --no-filters -- "${TEST_FILE:?Set TEST_FILE to the decoded Step 1 file}")" = "6f44da97079c7a29fd5ce090bf20d60e5acb51dd" &&
   RETENTION_SCOPE_GUARD="$PWD/scripts/ai/v3-scope-guard.mjs" \
     node --test "$TEST_FILE"
   ```

3. After approved governance is normally landed on the verified target base,
   a separate PR may add only the exact reviewed regression test. A test file
   edited since approval needs a new reviewed blob decision.
   Before committing, run `git ls-files --stage -- scripts/ai/test/retention-governance-scope.test.mjs`
   and require exactly the approved blob, mode `100644` and index stage `0`.
   Attributes can normalize bytes during staging, so the raw no-filters hash
   alone does not prove the staged blob. Stop before committing any mismatch.
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
93 cases; no real repository ref is moved by its synthetic race fixture.

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
with matching milestone files, explicitly supply it as `--head`, and supply
the independently verified target commit as `--base`. Run from
the repository root, or pass explicit `--state-file` and `--milestone-file`
paths when running elsewhere. The flag
selects the diff/blob tree but does not select legacy worktree milestone files. Workflow
checkout behavior is unchanged. Atlas renewed exact-blob approval after reviewing the two additional cases.

Present base metadata must be a regular Git blob (mode 100644 or 100755).
Directories, symlinks and submodules are rejected rather than parsed as text.
Atlas renewed approval for the expanded exact test blob after source/hash
inspection of the four new metadata-type cases.

Both present base metadata entries are validated before parser precedence is
applied, even when state already selects M15. Tree queries use root-relative
paths and diff output ignores relative-path configuration. NUL-delimited UTF-8 path strings are not trimmed for classification; diagnostics
JSON-escape paths and ref labels.
Atlas renewed technical approval of this exact blob after inspecting the seven
new regressions and the combined corrections.

Canonical approval comparison ignores only JSON whitespace (space, tab, CR, LF).
Non-JSON trailing Unicode whitespace remains invalid. Metadata parsing behavior
is unchanged. Atlas renewed exact-blob approval after reviewing the five new whitespace cases.

Known diagnostic limitation: invalid UTF-8 pathname bytes decode to replacement
characters, so distinct undecodable names can display alike. They cannot match
the ASCII-only approved test path; this does not widen the exact-path exception.
Byte-reversible display for such unsupported names is deferred rather than
adding a separate byte-path parser in this bounded governance change.

Path/ref diagnostics use ASCII-only quoted labels: non-ASCII code units,
including bidirectional and invisible controls, appear as Unicode escapes.
Original decoded strings still drive classification, not display labels.

Changed-path collection explicitly includes gitlink updates despite submodule
ignore configuration. Display labels escape `#`, `:` and `[` as well as
non-ASCII units so neither legacy nor modern runner command prefixes can occur
in path/ref labels. Classification uses the original strings. Atlas renewed exact-blob approval after inspecting these regressions.

Invalid ref resolution fails with a sanitized quoted ref label, without emitting
raw Git stderr or exception arguments.

Changed-path Git failures, including output-limit failures, also fail closed
with a static diagnostic rather than exposing captured path output.

Approval metadata is consulted only when the changed-path set includes the
exact regression-test path; unrelated changes keep their existing classification
without unnecessary metadata lookups.

The evidence source is base64-encoded solely to preserve literal escape
sequences through comment transport. The retrieved decoded bytes were verified
against the approved blob; do not hash the base64 text itself.

The base Markdown fallback recognizes exactly one current line-start `ID:`
field, either unmarked or prefixed specifically with a dash (`-`) list marker.
Asterisk (`*`), plus and other list markers are not recognized. Previous-milestone
prose is not a current field. Missing or
ambiguous current fields deny the exception when state has no usable milestone.
Legacy worktree milestone classification is unchanged.

Withdrawal is not authorized by this exact-blob add/update exception: deletion
has no matching head blob. It requires a separate reviewed governance decision
that explicitly covers removal, not merely another approved content blob. After
M15 closes, follow the then-active milestone and established technical approval
process to propose that decision; this record never supplies a future test-path
allowance or permits a milestone switch to evade the gate. Atlas renewed approval for the expanded exact test blob after inspecting the
four current-field regressions.

Base Markdown parsing counts all current ID fields before validating the sole
value, so malformed duplicate fields cannot be ignored. Fenced code and HTML
comments are not current metadata; unclosed fences/comments deny fallback.
Atlas renewed approval for the exact expanded test blob after inspecting the
five ambiguity/example regressions.

The narrow metadata dialect rejects nested HTML comments and backtick-fence
openers whose info text contains a backtick; malformed examples cannot hide
competing current ID fields. This is not a general Markdown renderer.

Raw backtick-fence info is validated before HTML comment masking, so a backtick
inside that original info cannot be hidden by a comment. Lines inside an
already open HTML comment remain comment content.

Follow-up boundary: legacy milestone selection and the executable guard still
come from the candidate checkout. That pre-existing trust model is not made a
security boundary by this narrow exception. Independently verified target/head,
matching milestone files and reviewed scope transitions remain required;
retargeting a candidate milestone is not authorized. Moving all classification
or guard execution to trusted-base governance needs a separate reviewed change,
not an expansion of this test-only decision.

Atlas root renewed exact-blob technical approval after independently inspecting
the raw-info correction and three added synthetic cases.

Base metadata content is passed untrimmed to its parsers. Fence info is literal
once an opener is recognized outside comments; HTML-looking info cannot alter
comment state. Closing fences use a fixed expression with exact consumed-length,
character-family and minimum-run checks. ID prefixes are counted before their
remaining values are validated, including malformed Unicode or lone-CR values;
only full-line allowed values qualify. This preserves fail-closed EOF behavior
instead of normalizing invalid trailing characters into valid metadata.

Atlas root renewed exact-blob approval after independently inspecting the raw
metadata, fixed fence matching and thirteen additional boundary regressions.

Fence and ID prefixes are recognized only on the original line outside an
already open comment. Masked comment text can validate an existing ID value but
cannot manufacture a new field or fence at a comment-closing boundary.

Atlas root renewed approval after independently inspecting the raw-prefix
simplification and exact four additional synthetic cases.

Base state accepts only a string milestone ID; non-string values defer to the
existing base Markdown fallback rather than being coerced to an ID. Legacy
worktree state classification is unchanged. An already matched ID field permits
horizontal spacing left by comment masking. Denial reporting sets exit status 1
without forced termination, allowing diagnostic pipes to drain; the success
message is in an exclusive branch and cannot run after denial.

Atlas root renewed exact-blob approval after independently inspecting the
base-only state typing, comment spacing, diagnostic drain and six new tests.

The built-in `origin/ai/integration` base (short or fully qualified spelling)
is read from the exact remote-tracking namespace with `git show-ref --verify`,
then pinned by returned object ID. Missing remote refs fail closed rather than
falling back to same-named tags. Explicit reviewed commit IDs remain supported.

Atlas root renewed exact-blob approval after inspecting the exact namespace
lookup and six new default/explicit ref shadow regressions.

The base-only authority dialect fails closed on inline code or backslash escapes
in prose outside fences and real HTML comments. It also rejects those characters
before a new comment opener in an ID value. This intentionally does not parse
CommonMark inline spans, including multiline spans: literal comment examples
cannot suppress a competing ID field. Exact backticked ID values and real HTML
comments remain supported; place a real comment before a backticked ID value or
on a separate line rather than after that value.

Atlas root renewed exact-blob approval after independently inspecting the seven
new inline-code/escape regressions and the narrow fail-closed guard changes.
The frozen external suite now contains 100 synthetic tests.
