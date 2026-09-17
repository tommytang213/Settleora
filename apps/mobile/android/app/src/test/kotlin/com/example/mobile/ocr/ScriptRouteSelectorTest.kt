package com.example.mobile.ocr

import org.junit.Assert.assertEquals
import org.junit.Test

class ScriptRouteSelectorTest {
    @Test
    fun arabicEvidenceAndConfidenceSelectArabicPack() {
        val selected = ScriptRouteSelector.select(
            listOf(
                candidate("common", ScriptEvidence.COMMON, "ABCD", 0.62f),
                candidate("arabic", ScriptEvidence.ARABIC, "الإجمالي", 0.84f),
            ),
        )

        assertEquals("arabic", selected?.pack?.modelPackId)
    }

    @Test
    fun thaiEvidenceRoutesToThaiPack() {
        val selected = ScriptRouteSelector.select(
            listOf(
                candidate("common", ScriptEvidence.COMMON, "T0TAL", 0.61f),
                candidate("thai", ScriptEvidence.THAI, "ยอดรวม", 0.83f),
            ),
        )

        assertEquals("thai", selected?.pack?.modelPackId)
    }

    @Test
    fun neutralNumericLineUsesHighestConfidence() {
        val selected = ScriptRouteSelector.select(
            listOf(
                candidate("common", ScriptEvidence.COMMON, "123.45", 0.96f),
                candidate("thai", ScriptEvidence.THAI, "123.45", 0.80f),
            ),
        )

        assertEquals("common", selected?.pack?.modelPackId)
    }

    @Test
    fun eachMixedScriptLineCanSelectItsOwnPack() {
        val commonLine = ScriptRouteSelector.select(
            listOf(
                candidate("common", ScriptEvidence.COMMON, "TOTAL", 0.90f),
                candidate("arabic", ScriptEvidence.ARABIC, "T0TAL", 0.91f),
            ),
        )
        val arabicLine = ScriptRouteSelector.select(
            listOf(
                candidate("common", ScriptEvidence.COMMON, "AJE", 0.64f),
                candidate("arabic", ScriptEvidence.ARABIC, "درهم", 0.86f),
            ),
        )

        assertEquals("common", commonLine?.pack?.modelPackId)
        assertEquals("arabic", arabicLine?.pack?.modelPackId)
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
