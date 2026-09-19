package com.example.mobile.ocr

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReceiptOrientationSelectorTest {
    private val commonPack = RecognizerSpec(
        modelPackId = "common",
        modelVersion = "1",
        modelAssetPath = "common.onnx",
        configAssetPath = "common.txt",
        acceptedScripts = setOf(ScriptEvidence.COMMON),
    )

    @Test
    fun `selects 180 degrees when most lines materially improve`() {
        assertTrue(
            ReceiptOrientationSelector.shouldRotate180(
                uprightCandidates = listOf(candidate("M8x", 0.42f), candidate("1o7", 0.38f)),
                rotatedCandidates = listOf(candidate("Cafe", 0.91f), candidate("Total 12.00", 0.94f)),
            ),
        )
    }

    @Test
    fun `does not rotate for one noisy line`() {
        assertFalse(
            ReceiptOrientationSelector.shouldRotate180(
                uprightCandidates = listOf(
                    candidate("Cafe", 0.92f),
                    candidate("Coffee 5.00", 0.91f),
                    candidate("Total 5.00", 0.90f),
                ),
                rotatedCandidates = listOf(
                    candidate("eJaC", 0.40f),
                    candidate("Coffee 5.00", 0.99f),
                    candidate("latoT", 0.41f),
                ),
            ),
        )
    }

    @Test
    fun `keeps upright orientation when evidence is tied`() {
        assertFalse(
            ReceiptOrientationSelector.shouldRotate180(
                uprightCandidates = listOf(candidate("Total 5.00", 0.86f)),
                rotatedCandidates = listOf(candidate("Total 5.00", 0.86f)),
            ),
        )
    }

    private fun candidate(text: String, confidence: Float) = ScriptCandidate(
        text = text,
        confidence = confidence,
        pack = commonPack,
    )
}
