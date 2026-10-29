package com.paddle.ocr.preprocess

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test

class RecWhiteMarginTest {
    @Test
    fun fixedMarginPreservesAllChannelsRowsContentAndFullBatchPadding() {
        val source = FloatArray(2 * 3 * 2 * 5) { (it + 1) / 100f }
        val original = source.copyOf()
        val input = RecPreprocessResult(source, longArrayOf(2, 3, 2, 5))
        assertSame(input, input.withWhiteMargin(listOf(2, 5), 0))
        val output = input.withWhiteMargin(listOf(2, 5), 12)
        assertArrayEquals(longArrayOf(2, 3, 2, 29), output.shape)
        for (batch in 0..1) for (channel in 0..2) for (row in 0..1) {
            val width = if (batch == 0) 2 else 5
            val from = ((batch * 3 + channel) * 2 + row) * 5
            val to = ((batch * 3 + channel) * 2 + row) * 29
            assertArrayEquals(FloatArray(12) { 1f }, output.tensorData.copyOfRange(to, to + 12), 0f)
            assertArrayEquals(source.copyOfRange(from, from + width), output.tensorData.copyOfRange(to + 12, to + 12 + width), 0f)
            assertArrayEquals(FloatArray(12) { 1f }, output.tensorData.copyOfRange(to + 12 + width, to + 24 + width), 0f)
            assertArrayEquals(FloatArray(5 - width), output.tensorData.copyOfRange(to + 24 + width, to + 29), 0f)
        }
        assertArrayEquals(original, source, 0f)
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsContentOutsideOriginalCanvas() {
        RecPreprocessResult(FloatArray(5), longArrayOf(1, 1, 1, 5)).withWhiteMargin(listOf(6), 12)
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsAnUnreviewedMargin() {
        RecPreprocessResult(FloatArray(5), longArrayOf(1, 1, 1, 5)).withWhiteMargin(listOf(5), 4)
    }
}
