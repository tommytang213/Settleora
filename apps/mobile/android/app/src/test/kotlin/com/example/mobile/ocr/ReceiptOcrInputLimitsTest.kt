package com.example.mobile.ocr

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReceiptOcrInputLimitsTest {
    @Test
    fun boundsEncodedBytesBeforeNativeDecode() {
        assertTrue(ReceiptOcrInputLimits.acceptsEncodedSize(25 * 1024 * 1024))
        assertFalse(ReceiptOcrInputLimits.acceptsEncodedSize(0))
        assertFalse(ReceiptOcrInputLimits.acceptsEncodedSize(25 * 1024 * 1024 + 1))
    }

    @Test
    fun boundsDecodedPixelsAndDimensions() {
        assertTrue(ReceiptOcrInputLimits.acceptsDimensions(4000, 4000))
        assertFalse(ReceiptOcrInputLimits.acceptsDimensions(4001, 4000))
        assertFalse(ReceiptOcrInputLimits.acceptsDimensions(8193, 1))
        assertFalse(ReceiptOcrInputLimits.acceptsDimensions(Int.MAX_VALUE, Int.MAX_VALUE))
    }
}
