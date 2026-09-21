package com.example.mobile.ocr

import com.paddle.ocr.model.OCRError

/** Returns only a fixed, content-free failure category for the Flutter boundary. */
internal fun boundedReceiptOcrFailureCode(error: Throwable): String {
    var current: Throwable? = error
    val visited = mutableSetOf<Throwable>()
    while (current != null && visited.add(current)) {
        if (current is OCRError) return current.boundedCode
        current = current.cause
    }
    return "ocr_internal_contract"
}
