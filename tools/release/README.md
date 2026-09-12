# Day 1 release identity tooling

`day1-release-identity-cli.mjs` assembles and independently validates
`settleora.day1-release-identity.v1` evidence. It is provenance tooling only:
it does not publish images, deploy, promote, apply migrations, mutate an
environment, or create release epochs.

The input is a bounded JSON evidence packet populated from read-only registry
resolution and exact-source local builds. Local paths are collector inputs and
are not copied into identity fields. Candidate manifests belong outside Git at
`/workspace/logs/settleora-release-candidates/<candidate-id>/`.
Assembly and validation require `gh` access to read the canonical GitHub Actions
publication-run URL, its job record, and its authenticated provider log. They
fail unless the exact index digest is both published for the exact-SHA tag and
reported as the successful build action output for the exact-source push run.
Authenticated provider and registry checks run before any dependency-controlled
web or Android build. The collector then replaces itself with a credential-free
bounded process, so build children cannot recover `GH_TOKEN` from a live parent.
Assembly resolves configured tags to establish the candidate; later validation
uses only the retained immutable index and platform digest references.

The identity digest is SHA-256 over canonical, recursively key-sorted JSON after
removing only `generatedAt` and `identityDigest`. Thus collection time may vary
without changing identity. All source, image, migration, web, Android, release
note, rollback and retention fields remain identity-relevant.

The published JSON Schema is structural validation only. A consumer must also
run the repository-owned `validateManifest` semantic validator (the `validate`
command does so) before accepting a manifest. In particular, JSON Schema cannot
express the declared bytewise migration-ID ordering or the source/digest and
cross-field relationships; schema success alone is never release-identity
certification.

For a standalone Android preflight, use a disposable path that is not the
canonical assembly destination:

```bash
install -d -m 700 /workspace/logs/settleora-android-preflight
node tools/release/day1-release-identity-cli.mjs collect-android \
  --flutter /trusted/flutter/bin/flutter \
  --android-sdk-root /trusted/Android/Sdk \
  --java-home /trusted/jdk \
  --debug-keystore /trusted/debug.keystore \
  --output /workspace/logs/settleora-android-preflight/<source-sha>
```

For the end-to-end candidate flow, start with no canonical `android/` directory;
create the candidate directory privately, then `assemble` creates the retained
evidence and performs both builds itself:

```bash
install -d -m 700 /workspace/logs/settleora-release-candidates/<candidate-id>
node tools/release/day1-release-identity-cli.mjs assemble \
  --input /workspace/logs/settleora-release-candidates/<candidate-id>/inputs.json \
  --output /workspace/logs/settleora-release-candidates/<candidate-id>/release-identity-manifest.json \
  --flutter /trusted/flutter/bin/flutter \
  --android-sdk-root /trusted/Android/Sdk \
  --java-home /trusted/jdk \
  --debug-keystore /trusted/debug.keystore

node tools/release/day1-release-identity-cli.mjs validate \
  --manifest /workspace/logs/settleora-release-candidates/<candidate-id>/release-identity-manifest.json \
  --input /workspace/logs/settleora-release-candidates/<candidate-id>/inputs.json \
  --flutter /trusted/flutter/bin/flutter \
  --android-sdk-root /trusted/Android/Sdk \
  --java-home /trusted/jdk \
  --debug-keystore /trusted/debug.keystore
```

Assembly also performs `npm ci` through the protected system npm installation and
the canonical user-web build with a bounded environment and private cache in a
disposable exact-source snapshot, then retains the R02 package manifest and `dist/` under
the candidate directory. Validation repeats that exact-source web build and
compares it with the retained identity, so caller-authored source claims are not
trusted. Executable source snapshots are materialized directly from committed
Git blobs so export attributes cannot omit or rewrite inputs. They reject tracked symlinks, and web artifact
walking is bounded by file, byte, directory-count, and directory-depth limits.

`collect-android` cleans generated state, invokes the two fixed release-build commands, and writes a
source/tree/artifact attestation. Assembly always performs that collection itself
inside the canonical candidate directory, so it cannot accept caller-selected
stale Android binaries. The collector captures the Flutter SDK's Dart executable
and Flutter tool snapshot, invokes both through held read-only descriptors, and
revalidates their device, inode, size, timestamps, and SHA-256 after every command.
Flutter and Android SDK content inventories are compared across the build, while
pub and Gradle use fresh private caches and a bounded environment. The committed
Gradle wrapper distribution SHA-256 prevents distribution substitution.
The stable-content inventories exclude only tool-owned runtime metadata (`.git`,
Flutter's lock, pre-existing top-level cache `.stamp`/`.realm` markers and
internal Gradle state, plus Android's `.knownPackages` marker), none of which
supplies build executables, libraries, packages, or platform content. New cache
markers are not silently excluded.
An independent inotify guard covers every non-excluded toolchain directory from
before the initial inventory through both builds and the final inventory; any
mutation or event-queue overflow fails closed. An explicitly supplied debug
keystore is copied into a private controlled user home and its SHA-256 is bound
to Android provenance without retaining the signing input itself.
Assembly and validation resolve `apksigner`
only below the separately supplied trusted SDK root and verify both the APK and
AAB debug certificate and rejects additional APK or AAB signers. Validation always recollects source, registry, web,
migration and retained Android evidence; digest-only validation is intentionally absent.
APK/AAB verification uses inherited read-only file descriptors and carries the
same captured byte identities into manifest collection. A Linux write-sealed
memory snapshot ensures hashing, signer verification and embedded-R8 inspection
all consume immutable identical bytes. Repository-backed Compose,
migration, web-lock and mobile-config reads are compared with the initially
captured source commit rather than a later movable `HEAD`.
Android collection is staged under the private candidate directory and removed
on assembly failure before promotion to canonical evidence. Validation accepts
only that candidate's canonical retained `release-identity-manifest.json` and
performs a second exact-source Android APK/AAB build before accepting retained
artifact identities. Both builds use the same commit-derived private workspace
path under `/workspace/logs`; this removes absolute temporary paths from Flutter
native outputs while an existing workspace fails closed instead of being reused.
APK, AAB, mapping, and output-metadata sizes are checked on stable descriptors
before retention. Output metadata is rejected if ambiguous, retained in unique
canonical JSON, and its full SHA-256 is bound through both Android provenance
and the manifest so the independent rebuild must match it. AAB preflight rejects
central or local ZIP extra fields because they are not signed payload identity.
It also binds ordered ZIP representation metadata and the exact compressed
spans of deterministic payload entries. The varying signed-control and R8
metadata entries must use their producer's fixed raw-DEFLATE settings. Thus an
exact-source rebuild rejects a repacked bundle with the same expanded signed
payload, including a same-method archive made with another compression level.
Local entry spans must also be mutually contiguous from byte zero through the
central directory, leaving no unbound interstitial archive bytes. The local
version-needed field must exactly match its bound central-directory counterpart.
Assembly also copies the bounded release-note input into canonical retained
`release-notes.md`; validation never depends on the caller's original path.

The migration section describes repository source only and deliberately never
claims that migrations are applied. A prior API artifact is availability
evidence only; it is never proof of database, schema, or file rollback safety.
Runtime migration IDs come from a freshly published local helper that asks the
exact API assembly's configured `SettleoraDbContext` `IMigrationsAssembly`; the
tooling compares that runtime inventory with deterministic repository migration
filenames and source hashes. The helper is built and run through a held descriptor
for the root-owned `/usr/lib/dotnet/dotnet` runtime, whose protected ancestor chain
and captured identity are verified. Restore uses committed NuGet lock files, a
repository-owned source configuration, a fresh private package cache, locked mode,
and a bounded environment; publish then uses `--no-restore`. Git, Docker, GitHub
CLI, and npm calls use explicit protected system executables. All provenance Git
reads disable replacement objects, and any
local `refs/replace/*` makes collection fail closed.
