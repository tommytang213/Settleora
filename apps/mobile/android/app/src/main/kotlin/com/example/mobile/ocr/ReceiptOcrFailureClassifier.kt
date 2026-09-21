package com.example.mobile.ocr

import com.paddle.ocr.model.OCRError

/** Returns only a fixed, content-free failure category for the Flutter boundary. */
internal fun boundedReceiptOcrFailureCode(error: Throwable): String {
    var current: Throwable? = error
    repeat(MAX_FAILURE_CAUSE_DEPTH) {
        val candidate = current ?: return "ocr_internal_contract"
        if (candidate is OCRError) return candidate.boundedCode
        current = candidate.cause
    }
    return "ocr_internal_contract"
}

private const val MAX_FAILURE_CAUSE_DEPTH = 16
