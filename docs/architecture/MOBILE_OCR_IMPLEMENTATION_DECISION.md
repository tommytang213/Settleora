# Mobile OCR Implementation Decision

## Status

Accepted on 2026-09-18 HKT by Tommy for accepted logical task
`20260918-0038` and issues #740 and #1247.

This decision supersedes the 2026-06-13 ML Kit-first evaluation. That earlier
evaluation is not implementation guidance: ML Kit is the current legacy
provider and must not be silently retained or restored as Settleora's canonical
OCR provider.

The full cross-platform, server, model-pack, privacy, and authority contract is
recorded in [OCR Architecture](OCR_ARCHITECTURE.md). This document narrows that
decision to the mobile implementation and acceptance boundary.

## Decision

- PaddleOCR is the canonical mobile OCR model family.
- PP-OCRv6 Small is the preferred common-script fast path where exact corpus
  evidence proves support.
- Compatible PP-OCRv5 mobile multilingual/script recognizers cover required
  gaps, including Arabic, Thai, Korean, Cyrillic, and Devanagari. Bengali,
  Tamil, Telugu, Persian, Urdu, or any other family is shipped as Global Core
  only after exact pinned-model acceptance evidence.
- ONNX Runtime is the preferred Android and iOS inference layer. CPU is the
  correctness baseline. XNNPACK, Core ML, NNAPI, QNN, or another accelerator is
  an optional optimization and must remain acceptance-equivalent.
- If a required Paddle component cannot run correctly through ONNX Runtime,
  the implementation may use the smallest compatible runtime adapter behind
  the same `ReceiptOcrProvider` and model-runtime contracts. It may not change
  the approved PaddleOCR model family.
- Global Core is available offline by default without requiring an ordinary
  user to select or download a recognizer before scanning a common receipt.
  Recognizers may be loaded and cached only when routed.
- Mixed-script routing is automatic and uses image, script, text, and
  confidence evidence. Device or user locale is not routing truth.
- Recognition returns normalized text, geometry, confidence, script/model
  identity, and available orientation/order metadata. Paddle-specific types do
  not cross into parsing or financial/domain authority.

## Current repository state

The mobile app currently bootstraps a Latin-only `MlKitReceiptOcrProvider`
behind `ReceiptOcrProvider`, and `apps/mobile/pubspec.yaml` includes
`google_mlkit_text_recognition`. The app already has provisional parsing and a
review-first handoff for personal and group bill creation.

The approved PaddleOCR/ONNX provider, model registry and loader, automatic
mixed-script routing, Global Core assets, and real Android/iOS manifest
acceptance are not implemented merely because this decision is recorded.

## Mobile implementation scope for #1247

The smallest acceptable implementation replaces the legacy ML Kit path while
preserving dependency injection and review-first behavior. It includes, as
technically required:

- a PaddleOCR/ONNX provider or narrow native runtime adapters behind
  `ReceiptOcrProvider`;
- pinned model registry, loader, preprocessing, dictionary/config, and
  compatibility metadata;
- Global Core install-time availability and lazy recognizer loading;
- automatic script and mixed-script routing that does not require a missing
  recognizer to identify the needed pack;
- provider-output normalization and independent Settleora parsing;
- currency provenance states `explicit`, `context_inferred`,
  `default_fallback`, and `unresolved`;
- the strict manifest-driven image-to-preview acceptance harness;
- actual Android and iOS provider execution, representative UI smoke, safe
  diagnostics, and measured latency, memory, model size, and application-size
  impact.

The immutable fixture manifest remains ground truth. A fake provider,
prewritten OCR text, or upstream language-support claim cannot satisfy native
acceptance. Arabic and Thai must run through the actual approved engine/model
path. A newly claimed Global Core family absent from the manifest needs a
separate deterministic fixture and machine-readable truth; it must not weaken,
replace, or duplicate the authoritative corpus.

## Packaging and supply-chain requirements

Every model or model pack records:

- stable pack identifier, model family/name/version, and runtime format;
- trusted immutable source and license metadata;
- exact checksum and signature state where signing is supported;
- ONNX Runtime version, opset/compatibility, preprocessing version,
  dictionary/config identity, and parser version;
- reproducible corpus evidence tied to those versions;
- atomic activation and rollback metadata.

Model-provider telemetry is disabled by default. Routine logs must not contain
receipt images, raw recognized text, local image paths, signed URLs, provider
object keys, or other sensitive receipt contents. Operational metrics are
bounded and content-free.

## Mobile versus future surfaces

#1247 owns the mobile image-to-preview acceptance chain. It does not implement
the future self-hosted server engine, desktop runtime, Admin model-management
UI, client optional-pack settings UI, or server mirror/cache UI.

Those surfaces retain the same approved architecture but require focused
owners:

- desktop uses PaddleOCR with ONNX Runtime where practical;
- self-hosted server uses PP-OCRv6 Medium as the preferred common-script path
  where supported, with multilingual fallback packs and CPU correctness first;
- Admin manages server-installed models only and cannot install or delete
  packs on client devices;
- mobile and desktop users control optional packs installed on their own
  device;
- a server may mirror verified packages, but client installation remains a
  client choice;
- server on-demand acquisition requires a keyed concurrent lock, trusted
  catalog, integrity and compatibility checks, atomic activation, bounded
  retry, rollback, and safe retention/eviction rules.

## Client/server execution contract

The approved default future mode is Enhanced OCR: client OCR starts
immediately and server OCR may run concurrently when enabled, reachable, and
authorized. Local-first and Client-only modes remain supported directions.

Suggestion precedence is:

```text
user-reviewed or edited value
  > validated server OCR suggestion
  > client OCR suggestion
  > no suggestion
```

A late server result never overwrites a reviewed or edited field. Server
failure, timeout, or a missing model never blocks the client result. Conflicts
remain reviewable, uploads remain subject to existing auth/privacy/file rules,
and the API/domain remains authoritative for bill and money mutation.

## Upstream feasibility checkpoint

Current official PaddleOCR references provide Android and iOS ONNX Runtime
sample deployments for PP-OCRv6 Small and PP-OCRv5 Mobile. The Android sample
currently identifies ONNX Runtime 1.21.1, minSdk 26, JDK 17, and Kotlin 2.1;
the iOS sample currently identifies Xcode 16 and iOS 16. These are upstream
sample facts, not automatic Settleora dependency or target changes.

The current catalog reports approximate unbundled PP-OCRv6 Small detection and
recognition model sizes of 9.6 MB and 20.4 MB. Published PP-OCRv5 script
recognizers are generally about 7.5-14 MB each. Settleora must measure actual
downloaded/exported bytes, runtime-binary delta, peak memory, cold/warm
latency, battery/CPU where practical, and Android/iOS artifact deltas for the
exact pinned artifacts.

## Validation boundary

Implementation validation must include repository doctor and mobile checks,
focused provider/router/loader/parser tests, manifest integrity, actual Android
and iOS provider acceptance, representative review UI smoke, sensitive-log
checks, artifact-size and performance evidence, and independent review bound
to the exact source head. No OpenAPI, schema, auth/security, settlement/money,
deployment, or server/Admin behavior may be hidden in the mobile provider
change.

## Primary external references

- PaddleOCR model and pipeline documentation:
  https://www.paddleocr.ai/main/en/version3.x/pipeline_usage/OCR.html
- PaddleOCR Android ONNX Runtime deployment:
  https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/inference_deployment/cross_platform/android_deployment.en.md
- PaddleOCR iOS ONNX Runtime deployment:
  https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/inference_deployment/cross_platform/ios_deployment.en.md
- ONNX Runtime mobile documentation:
  https://onnxruntime.ai/docs/tutorials/mobile/
- PaddleOCR Apache-2.0 license:
  https://github.com/PaddlePaddle/PaddleOCR/blob/main/LICENSE
