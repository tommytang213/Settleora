# Settleora OCR Worker

This directory will contain the Python OCR worker.

The Python OCR worker is not the only OCR path. On-device OCR is a required mobile capability for offline receipt processing, server-unavailable flows, and local-only profiles.

The worker remains part of the architecture for server-side OCR enhancement, reprocessing, consistency checks, batch processing, or future higher-confidence extraction. It consumes jobs from RabbitMQ and publishes OCR results or status events through approved backend and queue boundaries later.

The worker must not directly mutate core business tables, and it must not bypass backend API authority boundaries.

File bytes must go through storage abstractions later.

See [OCR architecture](../../docs/architecture/OCR_ARCHITECTURE.md) for the canonical OCR boundaries.
