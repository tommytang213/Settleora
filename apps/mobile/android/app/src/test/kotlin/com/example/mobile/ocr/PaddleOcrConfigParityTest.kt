package com.example.mobile.ocr

import org.junit.Assert.assertEquals
import org.junit.Test

class PaddleOcrConfigParityTest {
    @Test
    fun detectionPostprocessingMatchesPinnedPpOcrV6Yaml() {
        val config = settleoraPaddleOcrConfig()

        assertEquals(0.2f, config.detThresh)
        assertEquals(0.45f, config.detBoxThresh)
        assertEquals(1.4f, config.detUnclipRatio)
        assertEquals(3000, config.detMaxCandidates)
        assertEquals(1600, config.detMaxSideLimit)
    }
}
