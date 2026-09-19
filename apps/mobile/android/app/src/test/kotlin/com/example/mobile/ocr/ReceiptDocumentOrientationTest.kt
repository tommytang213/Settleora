package com.example.mobile.ocr

import org.junit.Assert.assertEquals
import org.junit.Test

class ReceiptDocumentOrientationTest {
    @Test
    fun `horizontal document selects upright or upside down`() {
        val dimensions = listOf(100f to 20f, 80f to 20f)

        assertEquals(
            ReceiptDocumentOrientation.UPRIGHT,
            ReceiptDocumentOrientation.select(dimensions, reverseRecognition = false),
        )
        assertEquals(
            ReceiptDocumentOrientation.UPSIDE_DOWN,
            ReceiptDocumentOrientation.select(dimensions, reverseRecognition = true),
        )
    }

    @Test
    fun `vertical document selects counterclockwise or clockwise`() {
        val dimensions = listOf(20f to 100f, 20f to 80f)

        assertEquals(
            ReceiptDocumentOrientation.COUNTERCLOCKWISE_90,
            ReceiptDocumentOrientation.select(dimensions, reverseRecognition = false),
        )
        assertEquals(
            ReceiptDocumentOrientation.CLOCKWISE_90,
            ReceiptDocumentOrientation.select(dimensions, reverseRecognition = true),
        )
    }

    @Test
    fun `counterclockwise transform restores rows for clockwise source`() {
        val transformed = ReceiptDocumentOrientation.COUNTERCLOCKWISE_90.transform(
            SettleoraOcrPoint(80f, 25f),
            sourceWidth = 100,
            sourceHeight = 200,
        )

        assertEquals(25f, transformed.x)
        assertEquals(19f, transformed.y)
    }

    @Test
    fun `clockwise transform restores rows for counterclockwise source`() {
        val transformed = ReceiptDocumentOrientation.CLOCKWISE_90.transform(
            SettleoraOcrPoint(20f, 175f),
            sourceWidth = 100,
            sourceHeight = 200,
        )

        assertEquals(24f, transformed.x)
        assertEquals(20f, transformed.y)
    }

    @Test
    fun `sideways receipt geometry normalizes item and amount into one row`() {
        fun sidewaysBlock(text: String, top: Float, bottom: Float) = SettleoraOcrBlock(
            text = text,
            confidence = 1f,
            modelPackId = "common",
            modelVersion = "1",
            textDirection = "ltr",
            order = 0,
            points = listOf(
                SettleoraOcrPoint(59f, top),
                SettleoraOcrPoint(79f, top),
                SettleoraOcrPoint(79f, bottom),
                SettleoraOcrPoint(59f, bottom),
            ).map { point ->
                ReceiptDocumentOrientation.COUNTERCLOCKWISE_90.transform(
                    point,
                    sourceWidth = 100,
                    sourceHeight = 200,
                )
            },
        )

        val ordered = ReceiptBlockOrder.normalize(
            listOf(
                sidewaysBlock("12.50", 100f, 140f),
                sidewaysBlock("Coffee", 10f, 60f),
            ),
        )

        assertEquals(listOf("Coffee", "12.50"), ordered.map { it.text })
        assertEquals(listOf(0, 0), ordered.map { it.row })
    }
}
