# Issue #1096 setup persistence and server-feedback evidence

Task key: `20260908-2243`. The production-widget captures remain under `/workspace/logs/settleora-visual-qa/20260908-2243-issue-1096/candidate-b/`; this manifest records their immutable SHA-256 evidence. All 12 final-candidate images were inspected at original resolution.

## Accepted contract and state machine

- The probe consumes only the existing generated `getAuthBootstrapStatus` method for anonymous, read-only `GET /api/v1/auth/bootstrap/status`. A typed successful `BootstrapStatusResponse` verifies that the normalized candidate URL exposes the expected Settleora public API.
- The response's `bootstrapRequired` value is ignored for both true and false. No account/bootstrap policy, access token, session, response body or internal identifier reaches setup UI.
- Server state is `unverified` → `checking` → `verified` for a typed success, or `unavailable` for any safely redacted timeout/transport/API/malformed failure. Any effective normalized URL change invalidates verification and clears stale check/save feedback; normalization-equivalent text retains the exact URL identity.
- A probe failure preserves URL/mode, prevents persistence and leaves Save available for a fresh probe. A persistence failure preserves input and the exact-URL verified result, so retry calls persistence once without re-probing. Local Mode constructs no probe/client and uses the same bounded persistence retry.
- Each generated probe client receives a probe-owned `HttpClient`, force-closed in `finally` even after the local ten-second wrapper timeout. This changes no global transport, TLS, certificate, header, proxy, API or session policy. Application persistence order remains configuration write then server-session clear.

## Candidate and convergence

- Final source `448972a27bd3156843a98f582edfa4c2bd93a9b7`, tree `9a7bc5d0b996414a8fa9b45d49858abab45d31aa`, implementation PR #1154, normal merge `ee26fdfa1d8443c536d4638ec053ff2fc35019c6`.
- Doctor, pub get and analyzer passed; 153 focused setup/probe/bootstrap/#1092/#1093/shared/visual tests and 1,050 full mobile tests passed; scaffold validated 19 paths; diff check passed. The M15 docs/control-only allowlist correctly required human review for this explicitly requested mobile task.
- Final Gemini `strong_independent`: `/workspace/logs/settleora-issue-1096-review/candidate-b/reviews/integrated/2026-09-08T154518Z-strong_independent-41929-1788882318414-gemini-integrated-review.json`; independent local Codex: `/workspace/logs/settleora-issue-1096-review/candidate-b/local-codex-review.md`. Both approved the exact source and images with no findings.
- GitHub Codex found two P2 issues on candidate A: invalid URL edits retained stale unavailable state, and per-attempt clients were not disposed. Candidate B fixed both, passed fresh local convergence and received an exact-head GitHub no-major-issues review. All 11 CI/CodeQL/Semgrep/Trivy checks passed and both review threads were resolved with corrective-head evidence.
- Completed #1092 What's New and #1093 contextual help remain unchanged. #975 retains native device/IME/screen-reader acceptance. Auth/onboarding (#337/#965), local workspace/sync (#971), experience modes (#412), privacy-security (#1122), parser (#959) and OCR acceptance (#970) remain independently owned.

## Capture SHA-256

```text
0fe852549ba2ad0b63b381d8adacae1f1cedebecfdd3d954f20da4ecfdf84028  local-mode-unchanged-390x844-1x.png
e9122778cbc9a8452f1db3183bfcd03a6ec4b908f565836bfe38091f07f2b28e  server-checking-390x844-1x.png
08a89e923a69bd4449d9597233b67e292bb1ee5df8e3c04511cd355075948847  server-persistence-failure-320x760-2x.png
a19bb994ae2ea02e229b1fce0107b05e72ad6c5b72ad64a020994b3b26ee36c1  server-persistence-retry-focused-390x844-1x.png
572f96d9c955be042e3046161f3f7df3d89b735a01f34a720af6014c5d08f3ee  server-persistence-retry-ready-390x844-1x.png
a6b383a4a68138c6fd423bbaf80f92eef5c297450912979c74ba622f3557c5ff  server-retry-action-reachable-320x760-2x.png
dc2dd96fe94c2d2299d6ec807f34f0325f0abd0dbe9948f7564fa7b2694100d1  server-unavailable-320x760-2x.png
fa8597f011344982944a2c381b01d663d8e6c67d3b8875caa75367c92e7c4e17  server-unavailable-390x844-1x.png
7e1948ca1ff71b6774f91edc26fcccb9bdb8fbb8a3ccef8b6d848a7f7ce5773d  server-unverified-320x760-2x.png
0e3f1d534713d960a33bbee8e022826fae963cdb466f551259282d7a909491e3  server-unverified-390x844-1x.png
ec7f4efe10012d87726ce1d7410d1e55125e495b238da1940c2f12965aa3fad9  server-verified-390x844-1x.png
572f96d9c955be042e3046161f3f7df3d89b735a01f34a720af6014c5d08f3ee  server-verified-persistence-failure-390x844-1x.png
```

The 390px/1× matrix covers initial/unverified, checking, verified, unavailable, verified persistence failure, retry ready/focused and unchanged Local Mode. The 320px/2× matrix proves unverified, unavailable, persistence failure and Save/retry reachability remain readable and scrollable without critical clipping. Captures use the production `SettleoraSetupScreen` and shared controls; widget tests independently assert status/error semantics, exact state transitions, keyboard submit and duplicate suppression.
