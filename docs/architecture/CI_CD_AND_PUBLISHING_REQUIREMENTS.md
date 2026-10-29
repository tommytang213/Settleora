# CI/CD And Publishing Requirements

## Authority and current status

Apply the [canonical branching/immutable-RC contract](BRANCHING_AND_RELEASE_STRATEGY.md), approved in [#1315](https://github.com/tommytang213/Settleora/issues/1315), under [program/domain authority](../../PROGRAM_ARCHITECTURE.md). This October 29, 2026 reconciliation supersedes generic environment-rebuild and provider-build-number assumptions; it does not implement a release pipeline or grant publication authority.

GitHub Actions owns routine PR CI and exact-source RC qualification. Codemagic is manual mobile release infrastructure, not routine CI. Current workflow configuration and retained receipts remain evidence of what exists; requirements below are not claims that #1316–1322 are complete.

## Qualification and build handoff

- Ordinary PR CI is impact-based: formatting/lint, unit/integration tests, scanners, touched-component build checks, migration/contract/client checks and container checks where relevant. Docs-only changes retain the repository docs/scaffold profile.
- [#1318](https://github.com/tommytang213/Settleora/issues/1318) owns complete exact-tag/SHA/tree/manifest RC qualification, including full mobile release validation and Android+iOS 101-image OCR acceptance regardless of ordinary PR filters. Missing/skipped/failed required evidence cannot produce `READY_FOR_SIGNED_BUILD`.
- Bind one RC to release-state version/ordinal and fixed platform build identities ([#1316](https://github.com/tommytang213/Settleora/issues/1316), [#1317](https://github.com/tommytang213/Settleora/issues/1317)). Provider run counters must not allocate release identity.
- Build once per platform, record exact source, artifact digest/provenance, dependencies and applicable migration/configuration references, then validate that artifact in UAT. Qualification must not upload to stores or deploy production.

## Publication and promotion

- GHCR is the primary OCI registry; any optional mirror must preserve and verify immutable identity. Web artifacts require exact content/manifest identity. Floating `latest`, `main`, preview or environment tags may be conveniences, never UAT/production selection authority.
- SemVer RC tags are immutable. A stable tag may identify only the approved RC source and must not rebuild it. Release notes/metadata-only changes do not rebuild code artifacts.
- [#1319](https://github.com/tommytang213/Settleora/issues/1319) owns same-digest server/web UAT and production promotion; [#1320](https://github.com/tommytang213/Settleora/issues/1320) owns same App Store Connect build selection; [#1321](https://github.com/tommytang213/Settleora/issues/1321) owns same Play test-track AAB/release promotion. No promotion path may invoke build commands.
- Production promotion requires exact UAT evidence, `READY_FOR_PROD_APPROVAL`, explicit **human** `PROD_APPROVED` evidence and applicable platform/security gates. Upload or CI success is not production approval or acceptance.
- [#1322](https://github.com/tommytang213/Settleora/issues/1322) owns pre-effect intent and provider reconciliation. Accepted builds resume by identity; ambiguous outcomes block before retry/rebuild. Mobile rollback is not an assumed binary downgrade; prior server/web digests require migration/data/file compatibility proof.

## Environments, secrets and current gaps

Development, CI test, UAT/staging and production are deployments/evidence contexts, not permanent source branches. Keep production/non-production secrets separated in approved external stores; never commit credentials or signing material. Signing/integration changes, destructive migrations, public exposure, store actions and production deployment retain their explicit human gates.

[Codemagic setup](../workflow/CODEMAGIC_TESTFLIGHT_SETUP.md) documents the current manual upload-only configuration and its future #1320 requirements. Its `$BUILD_NUMBER` use is an unresolved implementation gap; this task does not change YAML, signing or integrations.

Current `.github/workflows/api-image-ghcr.yml` publishes on every `main` push and `v*` tag, with no docs-path exclusion. That automatic publication is not the future RC qualification/promotion contract. A docs-only merge can therefore publish an image; stop before merging this task unless that effect is separately authorized. Do not change the workflow to evade the gate. [Day 1 readiness](../deployment/DAY1_RELEASE_READINESS_AUDIT.md) records remaining owners, and #975 consumes final evidence.
