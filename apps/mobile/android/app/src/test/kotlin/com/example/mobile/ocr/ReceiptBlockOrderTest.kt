package com.example.mobile.ocr

import org.junit.Assert.assertEquals
import org.junit.Test

class ReceiptBlockOrderTest {
    @Test
    fun ArabicRowOrdersRightToLeftIncludingAdjacentAmount() {
        val amount = block("12.50", "ltr", x = 10f)
        val label = block("المجموع", "rtl", x = 100f)

        val ordered = ReceiptBlockOrder.normalize(listOf(amount, label))

        assertEquals(listOf("المجموع", "12.50"), ordered.map { it.text })
        assertEquals(listOf(0, 1), ordered.map { it.order })
    }

    @Test
    fun LatinRowRemainsLeftToRight() {
        val amount = block("12.50", "ltr", x = 100f)
        val label = block("TOTAL", "ltr", x = 10f)
        assertEquals(
            listOf("TOTAL", "12.50"),
            ReceiptBlockOrder.normalize(listOf(amount, label)).map { it.text },
        )
    }

    @Test
    fun highResolutionSkewedArabicRowUsesGeometryRelativeThreshold() {
        val amount = block("12.50", "ltr", x = 10f, y = 130f, height = 80f)
        val label = block("المجموع", "rtl", x = 100f, y = 100f, height = 80f)

        assertEquals(
            listOf("المجموع", "12.50"),
            ReceiptBlockOrder.normalize(listOf(amount, label)).map { it.text },
        )
    }

    @Test
    fun verticallySeparateRowsRemainSeparate() {
        val first = block("FIRST", "ltr", x = 100f, y = 100f, height = 80f)
        val second = block("SECOND", "ltr", x = 10f, y = 200f, height = 80f)

        assertEquals(
            listOf("FIRST", "SECOND"),
            ReceiptBlockOrder.normalize(listOf(second, first)).map { it.text },
        )
    }

    private fun block(
        text: String,
        direction: String,
        x: Float,
        y: Float = 10f,
        height: Float = 10f,
    ) = SettleoraOcrBlock(
        text = text,
        confidence = 1f,
        modelPackId = "pack",
        modelVersion = "version",
        textDirection = direction,
        order = 0,
        points = listOf(
            SettleoraOcrPoint(x, y),
            SettleoraOcrPoint(x + 20f, y),
            SettleoraOcrPoint(x + 20f, y + height),
            SettleoraOcrPoint(x, y + height),
        ),
    )
}
