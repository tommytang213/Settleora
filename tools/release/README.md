# Day 1 release identity tooling

`day1-release-identity-cli.mjs` assembles and independently validates
`settleora.day1-release-identity.v1` evidence. It is provenance tooling only:
it does not publish images, deploy, promote, apply migrations, mutate an
environment, or create release epochs.

The input is a bounded JSON evidence packet populated from read-only registry
resolution and exact-source local builds. Local paths are collector inputs and
are not copied into identity fields. Candidate manifests belong outside Git at
`/workspace/logs/settleora-release-candidates/<candidate-id>/`.

The identity digest is SHA-256 over canonical, recursively key-sorted JSON after
removing only `generatedAt` and `identityDigest`. Thus collection time may vary
without changing identity. All source, image, migration, web, Android, release
note, rollback and retention fields remain identity-relevant.

For a standalone Android preflight, use a disposable path that is not the
canonical assembly destination:

```bash
node tools/release/day1-release-identity-cli.mjs collect-android \
  --flutter /trusted/flutter/bin/flutter \
  --output /workspace/logs/settleora-android-preflight/<source-sha>
```

For the end-to-end candidate flow, start with no canonical `android/` directory;
`assemble` creates it and performs both builds itself:

```bash
node tools/release/day1-release-identity-cli.mjs assemble \
  --input /workspace/logs/settleora-release-candidates/<candidate-id>/inputs.json \
  --output /workspace/logs/settleora-release-candidates/<candidate-id>/release-identity-manifest.json \
  --flutter /trusted/flutter/bin/flutter \
  --android-sdk-root /trusted/Android/Sdk \
  --java-home /trusted/jdk

node tools/release/day1-release-identity-cli.mjs validate \
  --manifest /workspace/logs/settleora-release-candidates/<candidate-id>/release-identity-manifest.json \
  --input /workspace/logs/settleora-release-candidates/<candidate-id>/inputs.json \
  --android-sdk-root /trusted/Android/Sdk \
  --java-home /trusted/jdk
```

`collect-android` cleans generated state, invokes the two fixed release-build commands, and writes a
source/tree/artifact attestation. Assembly always performs that collection itself
inside the canonical candidate directory, so it cannot accept caller-selected
stale Android binaries. Assembly and validation resolve `apksigner`
only below the separately supplied trusted SDK root and verify both the APK and
AAB debug certificate. Validation always recollects source, registry, web,
migration and retained Android evidence; digest-only validation is intentionally absent.

The migration section describes repository source only and deliberately never
claims that migrations are applied. A prior API artifact is availability
evidence only; it is never proof of database, schema, or file rollback safety.
