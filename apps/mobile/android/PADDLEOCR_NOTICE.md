# PaddleOCR Android source notice

Settleora's Android OCR adapter includes source adapted from the official
PaddlePaddle/PaddleOCR `deploy/ppocr-android/ppocr-sdk` sample at commit
`dab3fe35379033fdcb2d0e9572fac0b36c9a9ebf`.

The upstream files retain their copyright and Apache License 2.0 headers.
Settleora-specific platform-channel, mixed-script routing, and normalized result
code lives under `com.example.mobile.ocr` and is also distributed under this
repository's license.

Runtime dependencies:

- ONNX Runtime Android 1.21.1 (MIT)
- QuickBird Studios OpenCV Android 4.5.3 (Apache-2.0 wrapper; OpenCV 3-clause BSD)

The mobile artifact includes the applicable ONNX Runtime MIT and OpenCV
3-clause BSD license texts under `assets/receipt_ocr_models/`. Android packages
this directory as native application assets; it is intentionally not declared
as a shared Flutter asset, so the Android-only provider slice does not add
unused model bytes to iOS artifacts. These notices are shipped together with
the Apache License 2.0 text that covers the PaddleOCR models and QuickBird
Studios OpenCV Android wrapper.

No dependency enables provider telemetry. The adapter uses ONNX Runtime's CPU
execution provider as the correctness baseline.
