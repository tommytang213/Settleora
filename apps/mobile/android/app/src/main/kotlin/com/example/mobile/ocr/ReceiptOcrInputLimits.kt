package com.example.mobile.ocr

internal object ReceiptOcrInputLimits {
    private const val MAX_INPUT_BYTES = 25 * 1024 * 1024
    private const val MAX_INPUT_PIXELS = 16_000_000L
    private const val MAX_INPUT_DIMENSION = 8192
    private const val MAX_SAMPLE_SIZE = 128
    private const val MAX_RECOGNITION_LINES = 128

    fun acceptsEncodedSize(sizeBytes: Int): Boolean = sizeBytes in 1..MAX_INPUT_BYTES

    fun acceptsDimensions(width: Int, height: Int): Boolean {
        if (width <= 0 || height <= 0) return false
        if (width > MAX_INPUT_DIMENSION || height > MAX_INPUT_DIMENSION) return false
        return width.toLong() * height.toLong() <= MAX_INPUT_PIXELS
    }

    fun acceptsDetectedLineCount(lineCount: Int): Boolean =
        lineCount in 0..MAX_RECOGNITION_LINES

    /** Returns an Android power-of-two decode sample that satisfies native limits. */
    fun sampleSizeFor(width: Int, height: Int): Int? {
        if (width <= 0 || height <= 0) return null
        var sampleSize = 1
        while (!acceptsDimensions(sampled(width, sampleSize), sampled(height, sampleSize))) {
            if (sampleSize >= MAX_SAMPLE_SIZE) return null
            sampleSize *= 2
        }
        return sampleSize
    }

    private fun sampled(dimension: Int, sampleSize: Int): Int =
        ((dimension.toLong() + sampleSize - 1L) / sampleSize).toInt()
}
