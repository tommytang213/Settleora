package com.paddle.ocr.postprocess

import java.nio.FloatBuffer
import org.junit.Assert.assertEquals
import org.junit.Test

class CTCDecoderTest {
    @Test
    fun decodesDirectFloatBufferWithoutChangingItsPosition() {
        val output = FloatBuffer.wrap(
            floatArrayOf(
                0.05f, 0.90f, 0.05f,
                0.10f, 0.80f, 0.10f,
                0.95f, 0.03f, 0.02f,
                0.05f, 0.05f, 0.90f,
            ),
        )
        output.position(4)

        val decoded = CTCDecoder.decode(
            output,
            longArrayOf(1, 4, 3),
            listOf("a", "b"),
        )

        assertEquals(4, output.position())
        assertEquals("ab", decoded.single().first)
        assertEquals(0.9f, decoded.single().second, 0.0001f)
    }
}
