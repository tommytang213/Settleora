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
- Kotlin coroutines Android 1.9.0 (Apache-2.0)

No dependency enables provider telemetry. The adapter uses ONNX Runtime's CPU
execution provider as the correctness baseline.
