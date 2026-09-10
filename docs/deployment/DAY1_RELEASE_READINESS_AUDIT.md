# Day 1 Release Readiness Audit

Issue: [#974](https://github.com/tommytang213/Settleora/issues/974)

Parent: [#380](https://github.com/tommytang213/Settleora/issues/380)

Task key: `20260910-2119`

Source baseline: `origin/main` `f350e5f3ba6ff737cc38781dbc3348db68d45055`, tree `9d280ffff7385c7fd253aaf09a5108d192c9386f`

## 1. Scope, method, and conclusion

This is a source-of-truth inventory, not a release. It reconciles the current
repository, exact-head GitHub evidence, completed planning/evidence issues, and
explicit external gaps. It changes no build, workflow, package, runtime,
deployment, schema, environment, secret, signing, or release configuration.

Day 1 release readiness is **partial and not ready for production or store
release**. Automatic pull-request routing is implemented and credited to
[#1185](https://github.com/tommytang213/Settleora/issues/1185). The API can be
built and is published to GHCR on `main`; source-build and image-based LAN
Compose packages exist; a historical maintainer-run TrueNAS SCALE `25.10.4`
custom-app check passed bounded migration, liveness, and readiness checks. The
user web produces a Vite `dist` build locally, and Android produces a debug APK.

Those facts do not close the release gate. The Android release build currently
fails in R8 on missing ML Kit recognizer classes. Android still has a placeholder
application ID and debug release signing. User-web build/package validation is
not in automatic GitHub CI and no web serving/deployment package exists. Admin
web has no application package. The TrueNAS catalog, automated install/upgrade,
backup-before-upgrade, and tested restore/rollback paths do not exist. iOS
signing, App Store Connect processing, TestFlight availability/install, current
TrueNAS install/upgrade/restore, and production/staging exposure remain external
or manual gates.

Method:

1. Reconciled current source and all required repository documents.
2. Read live issues, merged PR identities, comments, rulesets, default CodeQL
   setup, representative exact-head check runs, and the latest `main` GHCR run.
3. Searched all open and closed issues and merged PRs for release, build,
   package, TrueNAS, web, mobile, backup, rollback, and store ownership.
4. Ran bounded local build evidence without deployment or publication.
5. Assigned every non-complete capability to one owner or one narrow
   recommendation in section 11.

### Evidence hierarchy

From strongest to weakest: (1) current source/config plus a successful build or
test on the exact source; (2) exact-head GitHub check/run evidence; (3) a
maintainer/provider artifact or live-platform record bound to an identity; (4)
current runbook/planning text; (5) issue statements. Lower evidence cannot
upgrade a higher-level gap: a script is not CI, CI is not deployment, an upload
configuration is not an upload, and a checklist remains unable to boot a
container.

### Status vocabulary

- `implemented`: current source plus proportionate runnable evidence exists.
- `partial`: useful implementation/evidence exists, but the Day 1 close rule is
  incomplete.
- `documentation-only`: current material describes a future action but does not
  implement or execute it.
- `externally-gated`: repository preparation exists, but the required provider,
  host, device, credential, or human evidence is absent.
- `unavailable`: no current implementation or supported artifact path exists.
- `blocked`: a concrete failure or prerequisite prevents completion.
- `superseded`: historical wording/ownership was replaced and must not be used.
- `later-day`: intentionally outside Day 1.

## 2. Current architecture summary

- The ASP.NET Core API in `services/api/` owns server-mode writes, money,
  authorization, status, storage access, and audit. PostgreSQL, RabbitMQ, and
  local file storage are its current self-host dependencies.
- `services/api/Dockerfile` is the only production-shaped server image input.
  `infra/docker-compose.yml` is development-oriented;
  `infra/docker-compose.truenas-lan.yml` and
  `infra/docker-compose.truenas-lan.image.yml` are the trusted-LAN packages.
- `apps/mobile/` is Flutter. `apps/web-user/` is a real React/Vite codebase but
  remains product-incomplete and normally enters protected features without a
  credential. `apps/web-admin/` contains only a README.
- `packages/contracts/openapi/settleora.v1.yaml` feeds the generated TypeScript
  and Dart clients through `tools/generate-clients.mjs`; generated clients are
  build inputs, not release artifacts.
- GitHub Actions owns automatic PR validation. Codemagic remains manual-only
  supplementary validation/visual evidence and a manual signed internal iOS
  upload path.

## 3. Capability matrix

The `Owner` column imports the lane, validation profile, reviewer tier, gate,
close rule, and dependency order from section 11. `Local / automatic / artifact
/ external` deliberately keeps the four evidence classes separate.

| ID | Day 1 capability / reference | Status | Current source | Local / automatic GitHub CI / artifact / external evidence | Owner and exact gap |
| --- | --- | --- | --- | --- | --- |
| A01 | Every PR to `main` is classified; docs-only stays lightweight | `implemented` | `.github/workflows/scaffold-validation.yml`; `tools/ci/scaffold-validation-changes.mjs` | Local `node --test tools/ci/test/*.test.mjs`; automatic classifier has no PR path filter; [PR #1187](https://github.com/tommytang213/Settleora/pull/1187) proves docs-only full/mobile/iOS skips | Completed #1185; no gap |
| A02 | Stable required aggregate and branch enforcement | `implemented` | `scaffold-validation.yml` job `aggregate` | Ruleset `17875790` is active for `main`/`prod`, requires only `Validate scaffold`, permits merge commits, blocks deletion/non-fast-forward, and has no bypass actor | Completed #1185/#382; no ruleset mutation required |
| A03 | Non-doc OpenAPI, generated-client, API, Compose, API-Docker validation | `implemented` | `scaffold-validation.yml`; root `package.json` | `validate:openapi`, `validate:clients`, `validate:api`, `validate:compose`, `validate:api-docker`; all succeeded on [PR #1186](https://github.com/tommytang213/Settleora/pull/1186) | Completed #1185; no gap |
| A04 | Mobile `pub get`, fatal analyze, and tests through one root authority | `implemented` | `package.json` exact `validate:mobile` script | Runs doctor, `flutter pub get`, `flutter analyze`, `flutter test`; no continue-on-error; automatic on `apps/mobile/**` or `packages/client-dart/**`; passed PR #1186 | Completed #1185; no gap |
| A05 | GitHub-hosted iOS simulator compile | `implemented` | `.github/workflows/mobile-ios-validation.yml` | Reusable exact-head macOS job runs pub get, pods, `flutter build ios --debug --simulator`; passed PR #1186 | Completed #1185; simulator output is CI evidence, not a signed release artifact |
| A06 | CI self-change and unknown-proof fail closed | `implemented` | classifier exact-path sets and `aggregateGateDecision`; `tools/ci/test/ci-workflow-policy.test.mjs` | CI/config/tool changes route mobile+iOS; invalid SHA/history/diff or missing result requires the expensive lanes/fails aggregate | Completed #1185; no gap |
| A07 | Action pinning and fork/permission posture | `implemented` | all `.github/workflows/*.yml` | Policy test requires full action SHAs. Workflows use least-scope `contents: read`; SARIF upload is suppressed for forks/Dependabot while scans still run; no `pull_request_target` | #1185/#382; required enforcement remains A02 only |
| A08 | Semgrep | `partial` | `.github/workflows/security-semgrep.yml` | PR/push/schedule scan and SARIF exist; workflow intentionally continues after scanner findings if SARIF exists, so it is evidence/scanning, not a blocking required context | #380; findings remain security-triage evidence, not waived |
| A09 | Trivy | `partial` | `.github/workflows/security-trivy.yml` | PR/push/schedule repository scan exists; `exit-code: "0"` makes findings non-blocking; current-main run `34480120189` succeeded | #380; same enforcement distinction as A08 |
| A10 | Default CodeQL | `implemented` | GitHub default setup, not a repository workflow file | Live API: configured/default suite, weekly, standard runner, languages actions/C/C++/C#/JS/TS/Python/TypeScript; PR #1186 and #1187 analyses passed | GitHub/security settings; not the required ruleset context |
| A11 | AI integration scope guard | `implemented` | `.github/workflows/ai-integration-scope-guard.yml` | Automatic only for PRs to `ai/integration`; exact script authority is `scripts/ai/v3-scope-guard.mjs`; does not protect `main` | Existing AI workflow program; main protection remains A02 |
| A12 | Dependency alerts and build-toolchain audit | `partial` | Dependabot plus `apps/web-user/package-lock.json` | Live alerts #32/#34-#36 cover development-scope `browserslist`, `baseline-browser-mapping`, `@vitest/mocker`, and `vitest`: one high and three medium alerts. Baseline `npm audit` reports two high/three moderate advisories; this is build/test-toolchain risk, not proof that vulnerable code ships in the browser bundle | R10; triage before R02 publishes a web artifact |
| B01 | API container image can build | `implemented` | `services/api/Dockerfile`; `validate:api-docker` | Automatic non-doc PR build validation; local Compose build command exists; image filesystem is the artifact | #1185/#380; build is not deployment |
| B02 | GHCR publication and tags | `implemented` | `.github/workflows/api-image-ghcr.yml` | `main`, `v*`, and dispatch publish `sha-<40-sha>` plus `main`, tag, or input tag. Run [34480120543](https://github.com/tommytang213/Settleora/actions/runs/34480120543) published baseline SHA and digest `sha256:7052b043cb13698ef8aa638d78b6b18288ccd33fa5a81efc951026f0409c3b1f` | #380; `main` is floating and publication is not promotion/deployment |
| B03 | Local development Compose package | `implemented` | `infra/docker-compose.yml`; `infra/env/.env.example` | `validate:compose` is automatic for non-doc PRs; builds API plus PostgreSQL/RabbitMQ, but exposes dependency ports and is explicitly development-only | #380; not a supported production package |
| B04 | TrueNAS/LAN source-build package | `partial` | `infra/docker-compose.truenas-lan.yml`; `.env.truenas-lan.example` | Compose config validation exists; package builds `migrate`/`api`, privately wires PostgreSQL/RabbitMQ/storage, publishes only API. Historical #483 live evidence is not current-head install proof | R04/R05 |
| B05 | TrueNAS/LAN image package | `partial` | `infra/docker-compose.truenas-lan.image.yml` | Config validates; defaults to floating `ghcr.io/tommytang213/settleora-api:main`, while operators may set an exact SHA tag/digest | R03/R04; pinning/release identity is not enforced |
| B06 | User-web production build artifact | `partial` | `apps/web-user/package.json`; `vite.config.ts` | `npm run build --prefix apps/web-user` passed on baseline and produced `apps/web-user/dist/`; no automatic CI, upload, retention, checksum, or serving package | R02; product completeness stays #373 |
| B07 | Admin-web artifact | `unavailable` | `apps/web-admin/README.md` only | No package, build command, runtime, tests, or artifact path | #964/#376/#378/#463; packaging waits for runtime |
| B08 | Android debug artifact | `implemented` | `apps/mobile/android/`; `apps/mobile/pubspec.yaml` | `flutter build apk --debug` passed on baseline; artifact `apps/mobile/build/app/outputs/flutter-apk/app-debug.apk`; not automatic CI or releasable | R01 for release build; #975 for later platform acceptance |
| B09 | Android release APK/AAB | `blocked` | `apps/mobile/android/app/build.gradle.kts` | `flutter build apk --release` failed on baseline in `:app:minifyReleaseWithR8`: missing ML Kit Chinese/Japanese/Korean/Devanagari recognizer option classes. No valid AAB evidence | R01 first; R07 after compile succeeds |
| B10 | iOS simulator artifact evidence | `implemented` | mobile iOS project; GitHub macOS workflow | Exact-head simulator compile passed PR #1186; output is an unsigned simulator `.app` inside CI workspace and is not uploaded/retained by the workflow | Completed #1185; #975 consumes physical-platform evidence later |
| B11 | Signed iOS IPA/archive | `externally-gated` | `codemagic.yaml` `mobile-ios-testflight-internal` | Configured paths: `build/ios/ipa/*.ipa`, `build/ios/archive/*.xcarchive`; no current observable cloud artifact/run | R06 |
| B12 | Signed Android/store artifact | `unavailable` | Android release currently uses debug signing and `com.example.mobile` | No production keystore config, signed release identity, Play publishing block, upload, or console evidence; secrets must remain external | R07 |
| B13 | Generated contracts/clients as inputs | `implemented` | OpenAPI plus `packages/client-web/src/generated/` and `packages/client-dart/lib/generated/` | `validate:clients` regenerates to temp and hashes current files; automatic non-doc CI. These are source inputs, not deployable artifacts | #1185; no release-artifact claim |
| B14 | Checksums/digests/version identity across artifacts | `partial` | GHCR labels/tags/digest; mobile `1.0.0+1`; Codemagic build number | API has exact SHA/digest evidence. Web/Android outputs have no published checksum/provenance; mobile version is static; no unified Day 1 release manifest | R03 |
| C01 | Supported self-host targets | `partial` | deployment docs and LAN Compose files | Trusted LAN/TrueNAS custom-app is the only exercised target; production/public and polished catalog are not supported/accepted | R04/R05/R09 |
| C02 | Environment example and secret boundary | `partial` | `infra/env/.env.truenas-lan.example` | Required variables and placeholders are documented; real values remain operator-managed. No catalog form, secret generation, rotation, or validation UI exists | R04; secret mutation is manual-gated |
| C03 | PostgreSQL/RabbitMQ/storage persistence | `implemented` | both LAN Compose files | Private services, bind-mounted datasets, and local storage mount are wired; #483 observed all three ready on TrueNAS `25.10.4` | #483 evidence; R05 for current backup/restore acceptance |
| C04 | Health/readiness/bootstrap checks | `implemented` | API `/health`, `/health/ready`, bootstrap endpoint; LAN guide | #483 recorded HTTP 200 liveness/readiness with postgres/rabbitmq/storage `ok`; bootstrap/sign-in was intentionally not exercised | #483 closed bounded evidence; #975 owns final app smoke |
| C05 | First install and migration ordering | `partial` | LAN Compose `migrate` one-shot plus `service_completed_successfully`; install guide | Runner supports managed/safe/manual/check/validate/danger modes. Commands are manual; no catalog hook or polished installer exists | R04 |
| C06 | Upgrade orchestration | `documentation-only` | `SELF_HOSTED_INSTALL_UPGRADE_ORCHESTRATION.md` | Ordering, image identity, backup prerequisite, stop conditions, and health checks are plans only | R05 |
| C07 | Rollback/recovery | `documentation-only` | install/upgrade and backup/restore docs | Limits are truthful: image-only rollback may be incompatible after schema/file changes; no automatic rollback or rehearsal evidence | R05 |
| C08 | Backup/restore consistency | `documentation-only` | `TRUENAS_BACKUP_RESTORE_RUNBOOK.md` | PostgreSQL/files/RabbitMQ/config consistency and restore order are documented; no backup automation or maintainer-run restore proof | R05 |
| C09 | Private/public/admin exposure posture | `documentation-only` | `SELF_HOSTING_EXPOSURE_GUARDRAILS.md`; LAN Compose | LAN package keeps dependencies private, but proxy/TLS/DNS/allowed-host/public/admin implementation and proof are absent | R09 |
| C10 | Current live self-host acceptance | `externally-gated` | issue #483 comments | Historical accepted proof is limited to TrueNAS SCALE `25.10.4`, custom app `1.0.0`, 21 migrations/0 pending, API/dependencies ready; it predates this baseline and omitted bootstrap/sign-in | #380/#975; R05 for current install/upgrade/rollback proof |
| D01 | Safe promotion order | `partial` | migration runner, LAN Compose, install/upgrade plan | Intended order: backup/quiesce -> exact image -> private dependencies -> migration gate -> API -> readiness -> compatible-client smoke. Only Compose start ordering is implemented | R05/R03 |
| D02 | Migration safety/destructive gate | `implemented` | `services/api/src/Settleora.Api/Persistence/MigrationRunner/`; LAN migration service | Production API startup does not migrate. Managed/apply-safe blocks classified destructive work; `force-allow-destructive` remains an explicit dangerous manual gate | Schema/migration owner for future changes; no production run authorized |
| D03 | Client compatibility gate | `partial` | versioned `/api/v1`, OpenAPI, generated-client validation | Contract drift is tested, but no release manifest binds API compatibility, mobile/web versions, migrations, and artifact digests | R03 |
| D04 | Backend rollback point | `documentation-only` | backup/restore and install/upgrade docs | Pre-upgrade consistency set and previous exact image are required; no proven rollback after current migrations/file interpretation | R05 |
| E01 | User-web serving/deployment readiness | `blocked` | real Vite source and `dist` build; user-web audit | Build exists, but protected routes lack a normal credential lifecycle; no container/static host config, deploy workflow, env injection contract, exposure proof, or smoke evidence | #373 for product/auth; R02 for build package; R08 for serving after prerequisites |
| E02 | Admin-web serving/deployment readiness | `blocked` | `apps/web-admin/README.md`; #964/#376 | No runtime/build exists. Admin exposure must remain private/protected and separately reviewed | #964 first, then #376/#378/#463; R08 only after runtime |
| F01 | Automatic Linux mobile validation and macOS simulator compile | `implemented` | A04/A05 | Exact #1186 head ran both; this is validation, not signing/upload/install | Completed #1185; do not redo |
| F02 | Android package readiness | `blocked` | B08/B09/B12 | Debug APK works; release R8 fails; app ID/signing/store path is absent | R01 -> R07 |
| F03 | iOS project/signing configuration | `partial` | bundle ID in Xcode project and Codemagic App Store signing integration reference | Repository identifiers and selection exist; credentials/profiles/certificates are external and unverified | R06 |
| F04 | Codemagic trigger posture | `implemented` | `codemagic.yaml`; CI policy tests | No workflow has `triggering`; GitHub Actions invokes no Codemagic API/webhook. A provider webhook may observe events but does not select/start these YAML workflows | Completed #1185/#383; dashboard/account state remains external |
| F05 | Manual internal-TestFlight workflow | `partial` | `mobile-ios-testflight-internal` | Uses `testFlightInternalTestingOnly`, `FLUTTER_BUILD_NAME=1.0.0`, Codemagic `$BUILD_NUMBER`, signed IPA build, and IPA/archive artifact declarations | R06 |
| F06 | App Store Connect publishing semantics | `partial` | Codemagic publishing block | Integration auth uploads the IPA to App Store Connect; `submit_to_testflight: false`, `submit_to_app_store: false`, no beta groups. Upload configuration is not upload evidence | R06 |
| F07 | Internal tester/device/store acceptance | `externally-gated` | `CODEMAGIC_TESTFLIGHT_SETUP.md` | Missing current cloud run, signing success, upload/processing, internal tester availability, real-device install, server-mode smoke, and Apple warning recheck | R06 then #975 |
| F08 | Android identity/signing/Play preparation | `unavailable` | B12 | Missing approved application ID, release-signing boundary, valid App Bundle, and Play publishing preparation. Play Console processing/testing and device install become `externally-gated` only after this repository preparation exists | R07 then #975 |
| G01 | Exact source identity | `implemented` | Git commit/tree, OCI revision label | PR/check evidence is SHA-bound; audit baseline is recorded above | R03 only for cross-artifact manifest |
| G02 | API image digest/tag discoverability | `partial` | GHCR workflow/run logs | Exact SHA tag and digest exist, but registry version listing was not readable with the current token and no repository release manifest retains the digest | R03 |
| G03 | Mobile version/build identity | `partial` | `pubspec.yaml`; Codemagic vars | Static `1.0.0+1`; Codemagic overrides build number. No accepted cross-platform release/version policy or current signed build record | R03/R06/R07 |
| G04 | Release notes/changelog | `partial` | mobile bundled What's New; architecture requirements | Product-facing mobile notes exist, but no repository release changelog/candidate notes bind server/web/mobile artifacts | R03; broad epoch automation is #946 later-day |
| G05 | Development/test/staging/production distinction | `documentation-only` | architecture requirements; environment variables | Names are described and mobile tokens accept build-environment labels, but no staged deployment/promotion system exists | R09 for any live environment; #946 later-day automation |
| G06 | Post-deploy health/smoke and approvals | `documentation-only` | deployment guides/checklists | Endpoints and evidence fields exist; only historical #483 bounded health proof exists, not current release-candidate smoke | R05/#975 |
| G07 | Incident/recovery and retention | `documentation-only` | rollback/backup docs | No product deployment incident drill, artifact-retention policy, or restore/rollback rehearsal exists | R05/R03 |
| G08 | Production artifact promotion | `externally-gated` | no current production deployment workflow | Requires exact artifact, approval, backup, migration review, health/smoke, rollback, and exposure review; none executed | R09; immutable UAT-to-production automation is #946 later-day |
| H01 | Real Codemagic signed cloud build | `externally-gated` | repository config only | Not observable/run in #1185 or this audit | R06 |
| H02 | App Store Connect upload/processing | `externally-gated` | repository upload block only | No current provider evidence | R06 |
| H03 | TestFlight internal availability and real-device install | `externally-gated` | manual checklist only | No current tester/device evidence | R06/#975 |
| H04 | Play Console/upload/install | `unavailable` | no publishing config | R07 must first establish the approved identity, signing, and valid AAB handoff; upload, processing, testing, and device installation become externally gated only after that repository preparation exists | R07, then #975 |
| H05 | Current TrueNAS install/upgrade/rollback | `externally-gated` | historical #483 install/update subset | No current-baseline upgrade, backup/restore, rollback, or auth/mobile smoke | R05/#975 |
| H06 | Staging/production deployment | `externally-gated` | no environment deployment record | No actual staging or production environment validation | R09 |
| H07 | DNS/TLS/proxy/public/admin exposure | `externally-gated` | guardrails only | No approved live configuration/evidence; safe default remains LAN/private | R09 |
| I01 | Auto-runner operational program | `implemented` | `tools/auto-runner/**`; #910/#912 evidence | #910 and #912 are CLOSED; #912 accepted deployed automation source `ecf69d41...`; PR #968 merged `6182d714...` from head `43b2f02b...` as part of that chain | Completed development automation program; not a product deploy dependency |
| I02 | Auto-runner authority boundary | `implemented` | issue close rules and `AGENTS.md` | Can coordinate approved development PR work; cannot authorize production, stores, exposure, secrets, or destructive migrations | Completed #910/#912; no gap |
| I03 | Stale #974 dependency text | `superseded` | live #910/#912/PR #968 state and #974 reconciliation comment | “May run after #912” wording is historical; all are completed and separate evidence | #974 issue-body hygiene after merge |
| I04 | Release epochs/UAT promotion | `later-day` | [#946](https://github.com/tommytang213/Settleora/issues/946) | Deferred until Day 1 implementation and integrated acceptance; no release branch or environment branch should be invented now | #946 only |

## 4. Artifact matrix

| Artifact | Producer | Current identity/path | Publication/retention | Readiness judgment |
| --- | --- | --- | --- | --- |
| API OCI image | `services/api/Dockerfile`; GHCR workflow | `ghcr.io/tommytang213/settleora-api:sha-<commit>` and digest; floating `:main` | Published on every `main` push and `v*` tag; GHCR retention not defined in repo | Build/publish implemented; promotion and retention partial |
| Local Compose package | `infra/docker-compose.yml` | repository YAML plus example env | Source only | Development-only |
| TrueNAS source package | `docker-compose.truenas-lan.yml` | repository YAML plus private operator env | Source only | Runnable LAN foundation, not polished install |
| TrueNAS image package | `docker-compose.truenas-lan.image.yml` | operator-set exact image recommended; default is `:main` | Source only | Runnable foundation; default identity is not immutable |
| User web | Vite | `apps/web-user/dist/` | Local ignored output only | Builds, but has no automatic package/publish/serve path |
| Admin web | none | none | none | Unavailable |
| Android debug APK | Flutter | `apps/mobile/build/app/outputs/flutter-apk/app-debug.apk` | Local ignored output only | Local build evidence only |
| Android release APK/AAB | Flutter/Gradle | expected Flutter output paths | None | Blocked by R8; identity/signing also not release-ready |
| iOS simulator app | GitHub macOS Flutter build | ephemeral workflow build output | Not uploaded by workflow | Compile evidence only |
| Signed iOS IPA/archive | Codemagic manual workflow | `build/ios/ipa/*.ipa`; `build/ios/archive/*.xcarchive` | Would be retained by Codemagic and uploaded to App Store Connect | Configured, externally unverified |

## 5. Environment and deployment matrix

| Environment/target | Package | Exposure | Data/migration | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| Developer Compose | `infra/docker-compose.yml` | API and dependency ports exposed locally | named volumes; API startup does not migrate | automatic config/image build on non-doc PRs | `implemented` for development only |
| Trusted LAN/TrueNAS source build | LAN build Compose | API host port only; dependencies/storage private | bind mounts; one-shot guarded migrate before API | historical #483 TrueNAS `25.10.4`; current config validation | `partial` |
| Trusted LAN/TrueNAS image | LAN image Compose | same private posture | same ordering; image can be exact but defaults floating | config validation only on current source | `partial` |
| Polished TrueNAS catalog | no package | planned LAN/private default | planned forms/hooks/datasets/backups | docs #486/#487 only | `unavailable` |
| Staging | none | undefined | undefined | none | `unavailable` |
| Production/public | none | manual gate; no public/admin default | destructive and backup gates | none | `externally-gated` |

## 6. Mobile release matrix

| Concern | Repository state | Evidence state | Remaining gate |
| --- | --- | --- | --- |
| Linux validity | root `validate:mobile` | automatic/pass on mobile PR #1186 | none for this capability |
| iOS simulator | exact-head GitHub-hosted macOS build | automatic/pass on #1186 | not signing/device evidence |
| Android debug | Flutter Gradle project | local pass on audit baseline | not a release artifact |
| Android release | Flutter/Gradle | R8 failure; debug signing and placeholder app ID | R01, then signing/store R07 |
| iOS signing | App Store distribution/bundle ID configured in Codemagic | no certificate/profile/cloud result observed | manual Apple/Codemagic gate |
| Internal iOS upload | signed IPA plus integration-auth publishing block | configured only; both submission flags false | manual run, processing, tester/device proof |
| Version identity | `1.0.0+1`; Codemagic name `1.0.0` and provider build number | no accepted signed candidate | R03/R06/R07 |
| Final native acceptance | #975 consumer | not run | external/manual after product and package blockers |

## 7. Manual and external evidence matrix

All entries below are future gates, not blockers to this documentation audit.

| Gate | Trigger | Required proof before close | Current state |
| --- | --- | --- | --- |
| Production deploy/activation and artifact promotion | Any real environment activation | exact source/artifact digest, approval, backup, migration result, smoke, rollback | missing |
| Public/admin exposure | Any route beyond trusted LAN/private access | separate user/admin threat review, allowed hosts/origins, proxy/TLS, logging, disable path | missing |
| Live DNS/TLS/proxy/network | DNS, tunnel, router, proxy, certificate, binding change | reviewed redacted config and rollback-to-private proof | missing |
| Secrets/environment mutation | real DB/queue/provider/signing values | secure external storage, separation, redacted readback; no repo secret | missing/not requested |
| Destructive migration/data or restore | unsafe migration, dataset replacement, real restore | reviewed backup consistency set and explicit human approval | missing/not authorized |
| Release signing/certificates/profiles | iOS/Android release build | provider identity, protected key material, signed artifact verification | missing |
| TestFlight/App Store/Play action | upload, tester distribution, submission, release | explicit maintainer approval plus provider result | missing |
| External tester/device distribution | tester group or real install | processed build, approved tester, device/OS/version/build/smoke record | missing |
| Branch deletion/history rewrite | cleanup, force-like action | explicit authority and exact target proof | not authorized; retained branch required |

## 8. Completed work credited

### #1185 current-CI reconciliation

- Implementation PR #1186 reviewed head
  `8a12f344aeb700a6fdaf7cb4934a3c28d8a1be15`, five-file scope
  (`scaffold-validation.yml`, `mobile-ios-validation.yml`, classifier and two CI
  test files), merged as `81d5b0deb2cc9f62ef8d7d682d4e99572776610b`.
- Documentation proof PR #1187 reviewed head
  `29c761e009bb69e899c157a96e360e3f31ca9be3`, merged as final baseline
  `f350e5f3ba6ff737cc38781dbc3348db68d45055`. Both reviewed heads are ancestors
  of the baseline.
- The central classifier emits `docs_only`, `run_full_validation`,
  `run_mobile_validation`, and `run_ios_validation`. `apps/mobile/**` and
  `packages/client-dart/**` select mobile and iOS; CI self-files also select the
  native lanes. Root `npm run validate:mobile` remains the exact Linux authority.
- #1186 proves full non-doc, mobile, iOS simulator, stable aggregate, CodeQL,
  Semgrep, and Trivy success. #1187 proves a real docs-only PR: classifier and
  scaffold/policy succeeded; full API/generated, Linux mobile, and iOS jobs
  skipped intentionally; `Validate scaffold` and security checks succeeded.
- Live ruleset `17875790` still requires the stable `Validate scaffold` context.
  No ruleset change was required.
- `codemagic.yaml` retained its manual workflows and signed internal upload path,
  has no `triggering.events`, and GitHub workflows do not invoke Codemagic.
  Repository webhook observation cannot by itself select/start these workflows.
  No Codemagic cloud run, signing, upload, store action, backend/database/mobile
  deployment, or production release occurred in #1185.

### Earlier release-readiness work

- #381-#383 are closed for their checklist/planning scopes. PR #482 merged the
  LAN checklist; #484/#485/#486/#487 and PRs #488-#491 merged backup/restore,
  exposure, catalog, and install/upgrade plans through PRs #488, #489, #490,
  and #491. Planning completion is not
  runtime completion.
- #483 is closed with bounded maintainer evidence on TrueNAS SCALE `25.10.4`.
  It observed `migrate` completing with 21 applied/0 pending migrations,
  API/PostgreSQL/RabbitMQ running, and liveness/readiness passing. It explicitly
  omitted bootstrap/sign-in and did not approve production, catalog, public
  exposure, backup/restore, or broader platform compatibility.
- #910/#912 and merged PR #968 are completed development-auto-runner evidence,
  not a release/deployment prerequisite and not product release authority.

## 9. Explicit non-gaps and do-not-redo list

- Do not replace the #1185 classifier, stable aggregate, Linux mobile lane, or
  GitHub macOS simulator lane absent a demonstrated regression.
- Do not add a second required context merely to rename `Validate scaffold`.
- Do not move automatic PR validity to Codemagic or add automatic Codemagic
  triggers as a substitute for GitHub Actions.
- Do not treat generated clients as release artifacts, a simulator build as a
  signed IPA, GHCR publication as deployment, #483 as current-production proof,
  or the deployment runbooks as automation.
- Do not reopen #381-#383, #483-#487, #910, #912, or #1185 to claim adjacent
  implementation. Their bounded completed evidence is retained.
- Do not involve or mutate #959. It remains an independent OCR parser chain and
  is not the owner of the newly observed Android release-build failure.

## 10. Duplicate and ownership reconciliation

The live search covered all open/closed issues and merged PRs using the terms
`build`, `CI`, `GHCR`, `container`, `package`, `release`, `Android`, `iOS`,
`TestFlight`, `App Store`, `Play Store`, `web deploy`, `TrueNAS`, `catalog`,
`install`, `upgrade`, `backup`, `restore`, and `rollback`; latest comments and
the issue ledger were then compared with source.

Findings:

- #1185 already owns and completes automatic PR CI architecture.
- #373/#963 own user-web product completeness, but no current issue owns its
  additive automatic production-build/package lane.
- #964/#376/#378/#463 own absent admin runtime and protected exposure; no admin
  packaging task is safe before them.
- #359/#437 describe OCR/native validation, but #437 closed planning-only and
  explicitly recorded that Android/iOS native build proof was not performed.
  #959 owns parser quality, not Gradle/R8 release-build closure. #357 and #359
  explicitly reserve native-build reconciliation and duplicate prevention to
  open audit #970, so #970 must adopt or split R01 before implementation.
- #381/#483-#487 completed bounded LAN evidence and plans; none implements a
  polished catalog, automated upgrade/backup/rollback, or current restore drill.
- #946 owns post-Day-1 release epochs and UAT artifact promotion and must not be
  pulled into Day 1 minimum readiness.
- #777 owns the auth production/public-exposure security-review gate;
  #376/#463 own admin exposure prerequisites; completed #485 supplies the
  existing proxy/TLS/exposure planning baseline.
- #1077 owns Day 2 product-integrated backup integrity and restore-drill
  automation, not the bounded Day 1 operator-run evidence in R05.

## 11. Remaining owner and gate matrix

Recommendation IDs are audit outputs only; no child issue is created here.

| Owner | Scope and non-goals | Gate | Lane / paths | Validation / review | Close rule and dependencies |
| --- | --- | --- | --- | --- | --- |
| R01 — **new focused recommendation, conditional on #970:** Android release-build dependency/R8 closure | Make current Flutter Android release APK and AAB compile with the intended on-device OCR dependency set. Non-goals: application-ID decision, keystore/signing, Play upload, parser behavior, #959 mutation | Native dependency/build-config review; no signing secret | `mobile-build-config`; `apps/mobile/android/**`, dependency manifest/lock only if required | root `validate:mobile`; debug APK; release APK and AAB; strong independent + Android build review | #970 must first adopt this gap or authorize a non-duplicate focused split under #357/#359. The implementation closes only when exact-head release APK/AAB builds pass, ML Kit scripts used by current code are packaged, size/offline-model impact is recorded, and no debug-signed output is called store-ready |
| R02 — **new focused recommendation:** additive user-web CI build/package lane | Preserve #1185 classifier/aggregate and add automatic `apps/web-user` install/test/build plus a discoverable `dist` artifact/checksum for web-affecting PRs. Non-goals: deploy, auth completion, public exposure, redesign | CI/workflow manual gate | `docker-compose-ci-deployment` plus web build files/workflow only | web lock install, tests, build, CI policy tests, full docs/scaffold; strong independent | Close on an exact web-affecting PR proving build/package and a docs-only PR proving intentional skip without changing required context. Depends on #1185 architecture; deployment waits for #373 |
| R03 — **new focused recommendation:** Day 1 release identity manifest | Define a bounded generated evidence manifest binding source SHA/tree, API tag/digest, migration set, web checksum when available, mobile version/build, release notes, rollback artifact, and retention location. Non-goals: release epochs, environment promotion, deployment | Artifact publication/promotion remains manual | `docker-compose-ci-deployment`; focused release tooling/docs | deterministic unit tests, docs/scaffold, sample exact-SHA manifest; strong independent | Close when one non-production candidate manifest is reproducible and rejects mismatched identities. Depends on R01 for Android entry and R02 for web entry; #946 remains later-day |
| R04 — **new focused recommendation:** TrueNAS catalog package skeleton and render validation | Implement unpublished metadata/form/topology/dataset/secret-input/migration-hook package from #486 plan, defaulting LAN/private and immutable image selection. Non-goals: publish, deploy, real secrets, public/admin exposure | Docker/Compose/deployment config manual gate | `docker-compose-ci-deployment`; new focused catalog paths plus tests | catalog schema/render tests, Compose checks, API image check as scoped; strong deployment/security review | Close with offline render/install-plan validation, private-service proof, migration failure surfacing, backup warning, exact image identity, and zero publication. Depends on R03 identity rules |
| R05 — #380 manual/external acceptance owner plus a future separately approved evidence task | Current TrueNAS install/upgrade, pre-upgrade backup, bounded non-destructive operator restore evidence using the existing Day 1 runbook, rollback limits, health/auth/mobile smoke. Non-goals: destructive production restore, hidden env change, or product-integrated restore automation | Host, secret, database/storage, migration, deployment manual gates | external operator lane; no unattended repo mutation | exact version/digest, sanitized migration/health/readiness/smoke, consistency-set and recovery evidence; human + strong deployment review | Close only with current-candidate TrueNAS evidence and separately approved operator restore/rollback evidence. Depends on R03/R04 and product acceptance readiness. Automated integrity verification, disposable restore environments, freshness tracking, scheduling, and admin UX remain Day 2 under #1077 |
| R06 — #380/#383 manual iOS release-evidence owner | Run the existing Codemagic signed internal workflow, verify App Store Connect processing, tester availability, warning state, and real-device install. Non-goals: public App Store submission or automatic trigger | Apple/Codemagic/signing/store/tester manual gates | external provider action | build/run URL, exact SHA/version/build, redacted signing selection, processed IPA, device smoke; human release review | Close only from maintainer-approved external evidence. Depends on product candidate and #975 sequence; `submit_to_testflight`/`submit_to_app_store` stay false unless separately authorized |
| R07 — **new focused recommendation plus later manual acceptance:** Android application identity/signing/store plan | After R01, select non-placeholder application ID, secure signing boundary, AAB output, and manual Play acceptance plan. Non-goals: commit keys, upload, public release | Identity, keystore, Play Console, tester/store manual gates | `mobile-build-config` for repo-safe config; external release action later | release AAB identity/signature inspection, no-secret scan, provider/device evidence; strong security/release review | Repository slice closes with approved external-secret contract and reproducible signed-build handoff; store evidence closes only after explicit manual action. Depends on R01 |
| R08 — #373 for user web; #964/#376 for admin web | Add serving/deployment packages only after each surface has its required runtime/auth/privacy readiness. Non-goals: infer readiness from Vite or README | Auth/security, storage/privacy, and admin exposure gates | product owner first; deployment lane later | product tests/visual acceptance before container/static-host validation; strong review | User web waits for #373’s protected-route/product close rule; admin waits for #964 split and #376 runtime gates |
| R09 — #380 final environment/network activation owner | Define/approve any staging/production deployment and any DNS/TLS/proxy activation only after the relevant domain reviews. Non-goals: automatic promotion, public default, or duplicating auth/admin review | Production, network, secrets, auth/security, storage/privacy, destructive migration | manual deployment/security lane | threat/exposure review, exact artifacts, backup/rollback, health/smoke, disable path | #777 must close the auth public-exposure review; #376/#463 must close admin runtime/exposure prerequisites; #485 is the completed planning baseline. Final activation closes only with explicit human approval and live evidence. #946 owns later automation |
| R10 — **new focused recommendation:** current user-web dependency-alert triage | Reconcile Dependabot alerts #32/#34-#36, update the smallest safe web build/test dependency set, and prove whether each advisory affects shipped output. Non-goals: suppress/dismiss alerts, deploy web, or broaden user-web product scope | Dependency/security review; no alert dismissal waiver | `web-user-ui`; `apps/web-user/package.json` and lockfile only unless evidence requires a separately scoped tool change | `npm ci`, `npm audit`, lint/test/build, docs/scaffold, exact alert reread; strong security review | Close only when current alerts are remediated by reviewed dependency updates or separately proven non-applicable through the repository's normal security process; depends only on current main and precedes R02 artifact publication |
| #975 | Consume, but do not manufacture, final native/device/UI/operator evidence | Final human/platform acceptance | `docs-planning` acceptance audit | evidence-bound audit/review | Runs after relevant product/release gaps; cannot close gates from configuration alone |
| #946 | Post-Day-1 release epochs, release cuts, UAT-to-production immutable promotion | Deferred activation gate | later-day release management | its own future validation | Start only after complete Day 1 implementation and integrated acceptance |

## 12. Dependency-safe remaining work graph

1. **Critical blocker and owner prerequisite:** the Android release failure is
   real, but #970 must first reconcile/adopt or split R01 under #357/#359. Debug
   success does not compensate for a failing release optimizer.
2. **Already-owned executable product gaps:** #373/#963’s user-web graph, #964
   then #376/#378/#463 for admin, and the broader mobile/product owners must
   complete independently of release infrastructure.
3. **New focused repository recommendations:** R10 dependency-alert remediation;
   then R02 additive user-web build/package CI; then R03 release identity; then
   R04 unpublished TrueNAS catalog skeleton.
4. **External/manual acceptance:** R05 TrueNAS upgrade/restore/rollback, R06 iOS
   signed/TestFlight/device, R07 Android identity/signing/Play/device, and R09
   any production/exposure action; #975 consumes the final evidence.
5. **Later day:** #946 release epochs, clean release cuts, multi-environment UAT
   promotion, and generalized release-line automation.

Dependency summary:

```text
 #970 adopt/split -> R01 Android compile -> R03 identity -----> R04 catalog skeleton
 R10 alerts -> R02 user-web package ----/                            |
#373 user-web product -----------------------------> R08 -------+--> R05/R09 --> #975
#964 -> #376 admin product ------------------------> R08
product-complete candidate + R01 -----------------> R06/R07 ----+--> #975
complete Day 1 + #975 acceptance ----------------------------------> #946 (later day)
```

### First dependency-safe next logical task for GPT review

Select **#970's bounded R01 ownership reconciliation for GPT review**. The
review must decide whether #970 adopts R01 directly or emits the same narrow
non-duplicate `mobile-build-config` child; only then is R01 implementation
dependency-safe. This preserves the independently reproduced Android packaging
blocker without bypassing #357/#359/#970 authority or touching #959. The eventual
implementation remains repository-only and precedes signing, store action,
production deployment, exposure, destructive migration, and Android acceptance.

## 13. Final Day 1 readiness statement

The repository has credible automatic CI, API image publication, LAN Compose
foundations, guarded migration ordering, a local user-web build, a debug Android
build, and an iOS simulator compile path. It does **not** yet have a complete
Day 1 release candidate: Android release packaging is broken; web/admin package
and deployment boundaries are incomplete; release identity/retention is partial;
TrueNAS catalog/upgrade/restore/rollback is unimplemented or unproven; and all
signed mobile, store, current-host, staging/production, and exposure evidence
remains manual/external. #380 must remain open. #975 remains the later acceptance
consumer. #946 remains deferred. #959 remains isolated.
