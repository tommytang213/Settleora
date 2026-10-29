# Branching And Release Strategy

## Authority and implementation status

The September 24, 2026 owner decision in [#1315](https://github.com/tommytang213/Settleora/issues/1315) is the canonical Day 1 release contract. This October 29, 2026 reconciliation supersedes this document's former permanent `develop`/production-source-branch recommendation. It records approved requirements, not implemented release tooling or release acceptance. [Program architecture](../../PROGRAM_ARCHITECTURE.md) retains domain authority; [CI/CD requirements](CI_CD_AND_PUBLISHING_REQUIREMENTS.md) and [Codemagic setup](../workflow/CODEMAGIC_TESTFLIGHT_SETUP.md) apply this contract.

## Source and candidate identity

- `main` is the newest accepted development line. It is not necessarily the deployed production source or ready for release.
- Use short-lived task/feature/fix branches and normal reviewed PRs. Do not create permanent `develop`, `uat`, `staging` or `prod` source branches; environments deploy immutable artifact identities.
- Tommy initiates Day 1 RC creation under [#1317](https://github.com/tommytang213/Settleora/issues/1317). Cut short-lived `release/X.Y` from one exact accepted SHA/tree under a bounded release-cut boundary, then allow `main` development to continue. This document does not create a release branch or tag.
- Allocate SemVer plus an immutable RC ordinal, for example `1.2.0-rc.3`, tagged `v1.2.0-rc.3`. Tags never move or get overwritten. Rejected and superseded RCs remain recorded.
- Relevant source changes require the next RC and fresh qualification; never mutate an existing candidate. Fixes return through reviewed task PRs; no merge-back into a permanent `develop` branch exists.
- Release state allocates fixed, monotonically increasing iOS build numbers and Android versionCodes. CI/Codemagic run counters are execution evidence, never release identity. Retrying an RC reuses its allocated source and build identities.
- A later stable `vX.Y.Z` may identify only the exact source of the production-approved RC; creating it must not itself trigger a rebuild. Current workflows do not yet prove this invariant; implementation belongs to #1317/#1318 and their scoped follow-ups.
- Future logical routing `next -> main`, `candidate -> current release line`, `stable -> supported production line` is naming/architecture direction. Advanced multi-line routing, release epochs and forward-port automation remain Day 2 [#946](https://github.com/tommytang213/Settleora/issues/946), not Day 1 implementation claimed here.

## Authoritative release states

[#1316](https://github.com/tommytang213/Settleora/issues/1316) owns the repository-controlled state layer, consuming completed R03/[#1214](https://github.com/tommytang213/Settleora/issues/1214) identity primitives. Required progression:

```text
DEVELOPMENT -> ELIGIBLE_FOR_RC -> RC_CUT -> QUALIFYING
-> READY_FOR_SIGNED_BUILD -> RC_BUILT -> UAT_DEPLOYED
-> UAT_APPROVED -> READY_FOR_PROD_APPROVAL -> PROD_APPROVED
-> PROMOTING -> RELEASED
```

UAT may instead produce `UAT_REJECTED`; it must never advance to production approval. `SUPERSEDED` retains replaced candidates and `BLOCKED` records missing, stale, failed or ambiguous prerequisites. Rejected UAT requires a source fix, next immutable RC/build identity and fresh qualification/UAT, not reuse of failed evidence.

State binds source SHA/tree, version/RC/tag, fixed platform build identities, artifacts/digests, provider builds, UAT evidence, human approvals, environment/configuration references and rollback identities. Provider pages and run counts are evidence inputs, not competing readiness authorities. Missing external evidence remains missing. Neither upload success nor a documentation/CI pass establishes UAT or production readiness.

## Build once, validate, promote without rebuilding

- GitHub Actions owns routine impact-based PR CI and exact-source RC qualification ([#1318](https://github.com/tommytang213/Settleora/issues/1318)). Required skipped, failed or stale checks cannot qualify an RC. Full release qualification includes Android+iOS 101-image OCR acceptance regardless of ordinary PR path filters; it consumes rather than replaces #1247/#1301 evidence.
- Build once per platform for an RC, under its signing/build gate after qualification. Bind the resulting exact artifact digest/provider identity; an output artifact digest is measured after building, not invented in advance.
- UAT validates that exact artifact/provider build. Server/web consume immutable OCI/static identities ([#1319](https://github.com/tommytang213/Settleora/issues/1319)); floating tags are not promotion identity.
- iOS uses the same signed App Store Connect build for TestFlight UAT and later App Store selection/promotion ([#1320](https://github.com/tommytang213/Settleora/issues/1320)). Codemagic is manual mobile release infrastructure, not routine PR CI.
- Android uses one signed AAB through Play Internal Testing or Closed Testing, then promotes the same tested release/versionCode ([#1321](https://github.com/tommytang213/Settleora/issues/1321)). Internal App Sharing is not the canonical promotable RC lineage.
- Production requires explicit **HUMAN** approval of the exact UAT-approved candidate. `READY_FOR_PROD_APPROVAL` is not approval. Promotion selects the same tested artifact/provider build and contains no build commands; configuration/environment differences must be explicitly evidenced, not hidden in a rebuild.
- Metadata-only release updates do not rebuild code artifacts. A change to compiled/packaged source or build inputs is not metadata-only and requires the new-RC path.

## Failure, retry and rollback

[#1322](https://github.com/tommytang213/Settleora/issues/1322) owns restart-safe provider intent/reconciliation: persist intent before an effect and distinguish build, upload, processing, UAT assignment, production submission and release. After a timeout/session/network failure around a mutation, reconcile existing provider state before any retry. If accepted, continue from the existing build/release identity. If definitively not accepted and no artifact exists, retry only the same RC with its same allocated build identity. Ambiguous state fails closed as `BLOCKED`; never silently allocate another identity, rebuild or duplicate an accepted operation.

Mobile recovery means halt/disable, hotfix or a new approved build, not an assumed installed-binary downgrade. Server/web rollback may reuse a prior immutable digest only after schema, migration, data and file compatibility is established; otherwise block for an explicit recovery plan. Artifact availability alone does not prove rollback safety.

## Gates and evidence

All current repository/platform protections, independent reviews, exact-head tests/CI, task scope, signing/privacy/security and explicit human-only gates remain mandatory. No direct main coding/push, force push, automatic production approval or release/store action is authorized here. [Day 1 readiness](../deployment/DAY1_RELEASE_READINESS_AUDIT.md) maps #1315–1322 ownership; [#975](https://github.com/tommytang213/Settleora/issues/975) consumes final product, provider/device and operator evidence without manufacturing it.
