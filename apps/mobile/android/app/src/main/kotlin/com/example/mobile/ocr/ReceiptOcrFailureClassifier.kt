package com.example.mobile.ocr

import com.paddle.ocr.model.OCRError

/** Returns only a fixed, content-free failure category for the Flutter boundary. */
internal fun boundedReceiptOcrFailureCode(error: Throwable): String {
    var current: Throwable? = error
    var boundedCode: String? = null
    repeat(MAX_FAILURE_CAUSE_DEPTH) {
        val candidate = current ?: return boundedCode ?: "ocr_internal_contract"
        if (candidate is OCRError) boundedCode = candidate.boundedCode
        current = candidate.cause
    }
    return boundedCode ?: "ocr_internal_contract"
}

private const val MAX_FAILURE_CAUSE_DEPTH = 16
