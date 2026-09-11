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

```bash
node tools/release/day1-release-identity-cli.mjs assemble \
  --input /workspace/logs/settleora-release-candidates/<candidate-id>/inputs.json \
  --output /workspace/logs/settleora-release-candidates/<candidate-id>/manifest.json

node tools/release/day1-release-identity-cli.mjs validate \
  --manifest /workspace/logs/settleora-release-candidates/<candidate-id>/manifest.json \
  --input /workspace/logs/settleora-release-candidates/<candidate-id>/inputs.json
```

The migration section describes repository source only and deliberately never
claims that migrations are applied. A prior API artifact is availability
evidence only; it is never proof of database, schema, or file rollback safety.
