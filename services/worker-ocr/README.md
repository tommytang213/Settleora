# Settleora OCR Worker

This directory will contain the Python OCR worker.

The worker consumes jobs from RabbitMQ and publishes OCR results or status events. It must not directly mutate core business tables, and it must not bypass backend authority boundaries.

File bytes must go through storage abstractions later.
