package com.example.mobile.ocr

import org.junit.Assert.assertEquals
import org.junit.Test

class ScriptRouteSelectorTest {
    @Test
    fun neutralIndependentEvidenceUsesConfidenceWithoutSelfValidation() {
        val selected = ScriptRouteSelector.select(
            listOf(
                candidate("common", ScriptEvidence.COMMON, "ABCD", 0.70f),
                candidate("arabic-low", ScriptEvidence.ARABIC, "الإجمالي", 0.69f),
            ),
            IndependentScriptEvidence(ScriptEvidence.NEUTRAL, 0.0),
        )

        assertEquals("common", selected?.pack?.modelPackId)
    }

    @Test
    fun strongCommonEvidenceAvoidsSpecialistFallback() {
        val evidence = ScriptRouteSelector.evidenceFromCommon(
            candidate("common", ScriptEvidence.COMMON, "TOTAL", 0.95f),
        )

        assertEquals(ScriptEvidence.COMMON, evidence.script)
        assertEquals(false, ScriptRouteSelector.requiresSpecialistFallback(evidence))
    }

    @Test
    fun ambiguousCommonResultRequiresBoundedSpecialistFallback() {
        val evidence = ScriptRouteSelector.evidenceFromCommon(
            candidate("common", ScriptEvidence.COMMON, "T0TAL", 0.61f),
        )

        assertEquals(ScriptEvidence.NEUTRAL, evidence.script)
        assertEquals(true, ScriptRouteSelector.requiresSpecialistFallback(evidence))
    }

    @Test
    fun shortHighConfidenceLookalikeRemainsAmbiguous() {
        val evidence = ScriptRouteSelector.evidenceFromCommon(
            candidate("common", ScriptEvidence.COMMON, "Cyn", 0.99f),
        )

        assertEquals(ScriptEvidence.NEUTRAL, evidence.script)
        assertEquals(true, ScriptRouteSelector.requiresSpecialistFallback(evidence))
    }

    @Test
    fun independentCommonEvidenceSelectsCommonCandidate() {
        val evidence = IndependentScriptEvidence(ScriptEvidence.COMMON, 0.95)
        val selected = ScriptRouteSelector.select(
            listOf(
                candidate("common", ScriptEvidence.COMMON, "TOTAL", 0.90f),
                candidate("arabic", ScriptEvidence.ARABIC, "T0TAL", 0.99f),
            ),
            evidence,
        )

        assertEquals("common", selected?.pack?.modelPackId)
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
