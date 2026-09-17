package com.example.mobile.ocr

internal object ReceiptOcrInputLimits {
    private const val MAX_INPUT_BYTES = 25 * 1024 * 1024
    private const val MAX_INPUT_PIXELS = 16_000_000L
    private const val MAX_INPUT_DIMENSION = 8192

    fun acceptsEncodedSize(sizeBytes: Int): Boolean = sizeBytes in 1..MAX_INPUT_BYTES

    fun acceptsDimensions(width: Int, height: Int): Boolean {
        if (width <= 0 || height <= 0) return false
        if (width > MAX_INPUT_DIMENSION || height > MAX_INPUT_DIMENSION) return false
        return width.toLong() * height.toLong() <= MAX_INPUT_PIXELS
    }
}
