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
        assertEquals(listOf(0, 0), ordered.map { it.row })
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
        assertEquals(
            listOf(0, 1),
            ReceiptBlockOrder.normalize(listOf(second, first)).map { it.row },
        )
    }

    @Test
    fun tallOutlierDoesNotCollapseMultipleVisualRows() {
        val tall = block("TALL", "ltr", x = 0f, y = 50f, height = 200f)
        val first = block("FIRST", "ltr", x = 100f, y = 80f, height = 20f)
        val second = block("SECOND", "ltr", x = 100f, y = 180f, height = 20f)

        val ordered = ReceiptBlockOrder.normalize(listOf(second, tall, first))

        assertEquals(listOf("TALL", "FIRST", "SECOND"), ordered.map { it.text })
        assertEquals(listOf(0, 1, 2), ordered.map { it.row })
    }

    @Test
    fun progressiveSkewKeepsAdjacentBoxesOnOneRow() {
        val first = block("ITEM", "ltr", x = 10f, y = 100f, height = 20f)
        val second = block("NAME", "ltr", x = 50f, y = 107f, height = 20f)
        val amount = block("12.50", "ltr", x = 100f, y = 114f, height = 20f)

        val ordered = ReceiptBlockOrder.normalize(listOf(amount, first, second))

        assertEquals(listOf("ITEM", "NAME", "12.50"), ordered.map { it.text })
        assertEquals(listOf(0, 0, 0), ordered.map { it.row })
    }

    @Test
    fun oneRtlTokenDoesNotReversePredominantlyLtrRow() {
        val item = block("Tea", "ltr", x = 10f)
        val brand = block("ش", "rtl", x = 60f)
        val amount = block("12.50", "ltr", x = 100f)

        assertEquals(
            listOf("Tea", "ش", "12.50"),
            ReceiptBlockOrder.normalize(listOf(amount, brand, item)).map { it.text },
        )
    }

    @Test
    fun shortArabicLabelOutranksAdjacentLatinCurrencyToken() {
        val amount = block("AED 5.00", "ltr", x = 10f)
        val label = block("ش", "rtl", x = 100f)

        assertEquals(
            listOf("ش", "AED 5.00"),
            ReceiptBlockOrder.normalize(listOf(amount, label)).map { it.text },
        )
    }

    @Test
    fun shortArabicLabelOutranksIsoAmountWrittenWithArabicIndicDigits() {
        val amount = block("AED ٥٫٠٠", "ltr", x = 10f)
        val label = block("ش", "rtl", x = 100f)

        assertEquals(
            listOf("ش", "AED ٥٫٠٠"),
            ReceiptBlockOrder.normalize(listOf(amount, label)).map { it.text },
        )
    }

    @Test
    fun shortArabicLabelOutranksSuffixIsoAmountWrittenWithArabicIndicDigits() {
        val amount = block("٥٫٠٠ AED", "ltr", x = 10f)
        val label = block("ش", "rtl", x = 100f)

        assertEquals(
            listOf("ش", "٥٫٠٠ AED"),
            ReceiptBlockOrder.normalize(listOf(amount, label)).map { it.text },
        )
    }

    @Test
    fun ArabicIndicAmountDoesNotReverseLatinItemRow() {
        val item = block("Tea", "ltr", x = 10f)
        val amount = block("١٢٫٥٠", "ltr", x = 100f)

        assertEquals(
            listOf("Tea", "١٢٫٥٠"),
            ReceiptBlockOrder.normalize(listOf(amount, item)).map { it.text },
        )
        assertEquals("ltr", ReceiptBlockOrder.textDirection("١٢٫٥٠"))
        assertEquals("rtl", ReceiptBlockOrder.textDirection("الإجمالي ١٢٫٥٠"))
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
