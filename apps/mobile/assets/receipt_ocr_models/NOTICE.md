# Settleora mobile OCR model notice

The model files in this directory are unmodified ONNX exports and matching
configuration files published by the PaddlePaddle organization for PaddleOCR.
They are distributed under Apache License 2.0. Settleora's repository-level
`LICENSE` remains authoritative for Settleora source code.

Exact upstream repositories, immutable revisions, byte sizes, and SHA-256
digests are recorded in `catalog.json`. That catalog also records the observed
ONNX IR/opset and tensor contract; every artifact passes the ONNX checker and
loads with the CPU execution provider in ONNX Runtime 1.21.1. The bundled
inventory is the accepted mobile Global Core needed by the current #1247
fixture scripts:

- PP-OCRv6 Small detection;
- PP-OCRv6 Small common Latin/Chinese/Japanese recognition;
- PP-OCRv5 Mobile Arabic, Cyrillic, Devanagari, Korean, and Thai recognition.

`catalog.json` binds the pending acceptance contract to the immutable fixture
corpus plus the current preprocessing and parser source hashes. Its
`pending_native_provider_acceptance` status is deliberate: route coverage is
not an accuracy claim, and the status must not be promoted until the real
Android and iOS provider lanes pass the bound corpus.

The catalog does not claim Bengali, Tamil, or Telugu acceptance. Tamil and
Telugu PP-OCRv5 candidates exist upstream but require separate deterministic
fixture evidence before Global Core admission. No compatible official
lightweight Bengali recognizer was identified at this catalog version; that
unresolved coverage must not be represented as installed or supported.

The complete applicable license is distributed beside this notice as
`LICENSE-APACHE-2.0.txt` and is included in Settleora mobile artifacts.

Upstream license: https://www.apache.org/licenses/LICENSE-2.0

Upstream organization: https://huggingface.co/PaddlePaddle

PaddleOCR source validation revision:
`dab3fe35379033fdcb2d0e9572fac0b36c9a9ebf`
