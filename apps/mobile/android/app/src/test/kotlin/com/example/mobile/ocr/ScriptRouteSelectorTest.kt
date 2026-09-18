package com.example.mobile.ocr

import org.junit.Assert.assertEquals
import org.junit.Test

class ScriptRouteSelectorTest {
    @Test
    fun calibratedSelectorPrefersScriptCompatibleCandidate() {
        val selected = ScriptRouteSelector.select(
            listOf(
                candidate("common", ScriptEvidence.COMMON, "ABCD", 0.99f),
                candidate("arabic", ScriptEvidence.ARABIC, "الإجمالي", 0.82f),
            ),
        )

        assertEquals("arabic", selected?.pack?.modelPackId)
    }

    @Test
    fun longHighConfidenceLatinHallucinationCannotSuppressSpecialist() {
        val selected = ScriptRouteSelector.select(
            listOf(
                candidate("common", ScriptEvidence.COMMON, "TOTALAMOUNT", 0.99f),
                candidate("thai", ScriptEvidence.THAI, "ยอดรวม", 0.82f),
            ),
        )

        assertEquals("thai", selected?.pack?.modelPackId)
    }

    @Test
    fun rejectsTextOutsidePackDeclaredScript() {
        val selected = ScriptRouteSelector.select(
            listOf(
                candidate("common", ScriptEvidence.COMMON, "الإجمالي", 0.99f),
                candidate("arabic", ScriptEvidence.ARABIC, "الإجمالي", 0.60f),
            ),
        )

        assertEquals("arabic", selected?.pack?.modelPackId)
    }

    @Test
    fun neutralNumericLineUsesCommonRecognizerCalibration() {
        val selected = ScriptRouteSelector.select(
            listOf(
                candidate("common", ScriptEvidence.COMMON, "12.50", 0.80f),
                candidate("arabic", ScriptEvidence.ARABIC, "12.50", 0.81f),
            ),
        )

        assertEquals("common", selected?.pack?.modelPackId)
    }

    @Test
    fun mixedScriptLineCanSelectSpecialistWithoutLocaleHint() {
        val selected = ScriptRouteSelector.select(
            listOf(
                candidate("common", ScriptEvidence.COMMON, "TOTAL 21.79", 0.97f),
                candidate("arabic", ScriptEvidence.ARABIC, "TOTAL الإجمالي 21.79", 0.82f),
            ),
        )

        assertEquals("arabic", selected?.pack?.modelPackId)
    }

    @Test
    fun pureCommonTextCannotReceiveSpecialistBias() {
        val selected = ScriptRouteSelector.select(
            listOf(
                candidate("common", ScriptEvidence.COMMON, "TOTAL 21.79", 0.82f),
                candidate("arabic", ScriptEvidence.ARABIC, "T0TAL 21.79", 0.99f),
            ),
        )

        assertEquals("common", selected?.pack?.modelPackId)
    }

    @Test
    fun incompatibleSpecialistCannotBeatLowConfidenceCommonText() {
        val selected = ScriptRouteSelector.select(
            listOf(
                candidate("common", ScriptEvidence.COMMON, "TOTAL", 0.20f),
                candidate("arabic", ScriptEvidence.ARABIC, "T0TAL", 0.99f),
            ),
        )

        assertEquals("common", selected?.pack?.modelPackId)
    }

    @Test
    fun incompatibleSpecialistCannotBypassCommonRejectionThreshold() {
        val selected = ScriptRouteSelector.select(
            listOf(
                candidate("common", ScriptEvidence.COMMON, "TOTAL", 0.05f),
                candidate("arabic", ScriptEvidence.ARABIC, "T0TAL", 1.0f),
            ),
        )

        assertEquals("common", selected?.pack?.modelPackId)
        assertEquals(0.05f, selected?.confidence)
    }

    private fun candidate(
        id: String,
        script: ScriptEvidence,
        text: String,
        confidence: Float,
    ) = ScriptCandidate(
        text = text,
        confidence = confidence,
        pack = RecognizerSpec(id, "version", "model", "config", setOf(script)),
    )
}
