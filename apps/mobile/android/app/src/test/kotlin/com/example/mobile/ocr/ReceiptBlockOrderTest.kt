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

    private fun block(text: String, direction: String, x: Float) = SettleoraOcrBlock(
        text = text,
        confidence = 1f,
        modelPackId = "pack",
        modelVersion = "version",
        textDirection = direction,
        order = 0,
        points = listOf(
            SettleoraOcrPoint(x, 10f),
            SettleoraOcrPoint(x + 20f, 10f),
            SettleoraOcrPoint(x + 20f, 20f),
            SettleoraOcrPoint(x, 20f),
        ),
    )
}
