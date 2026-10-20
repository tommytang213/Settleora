package com.example.mobile.ocr

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PolishCurrencyRecoveryTest {
    private val pack = RecognizerSpec("common", "test", "/test", "/test", setOf(ScriptEvidence.COMMON))
    private fun candidate(text: String, confidence: Float = 0.95f, spec: RecognizerSpec = pack) =
        ScriptCandidate(text, confidence, spec)

    @Test
    fun realRecoveredGlyphKeepsEveryAmountByteAndActualConfidence() {
        for (amount in listOf("0,00", "7.20", "83,41", "-6,73", "+91.08", "−6,73", "1,823.41", "1.823,41", "9,876,543.21", "9.876.543,21")) for (suffix in listOf("zl", "zì")) {
            val original = listOf(candidate("$amount $suffix"), candidate("2,18 zł"), candidate("$5.67"))
            val snapshot = original.toList()
            val recovery = candidate("$amount zł", 0.81f)
            assertTrue(PolishCurrencyRecovery.shouldProbe(0, original))
            assertTrue(PolishCurrencyRecovery.accepts(0, original, recovery))
            assertFalse(PolishCurrencyRecovery.shouldProbe(1, original))
            assertFalse(PolishCurrencyRecovery.shouldProbe(2, original))
            assertEquals(snapshot, original)
            assertEquals(0.81f, recovery.confidence)
            assertEquals(pack, recovery.pack)
        }
        val original = listOf(candidate(" \t83,41 zl\t "), candidate("2,18 zł"))
        assertTrue(PolishCurrencyRecovery.accepts(0, original, candidate("83,41\tzł")))
    }

    @Test
    fun refusesWordsDatesResidualTokensAndUnsupportedCurrencyShapes() {
        for (text in listOf("", "Word zl", "12 zl", "12,3 zl", "1,234 zl", "1,23,456.78 zl", "01,234.56 zl", "1.23,45 zl", "12.34zl", "12.34 zI", "12.34 zł", "12.34 PLN", "12.34 zł extra", "label 12.34 zl", "12.34 zl 56.78", "12.34 USD", "${'$'}12.34 zl", "12.34 €", "12/10/2026 zl", "١٢.٣٤ zl", "１２.３４ zl", "12.34\nzl", "12.34 zl", "--12.34 zl", "+-12.34 zl")) {
            val original = listOf(candidate(text), candidate("2,18 zł"))
            assertFalse(text, PolishCurrencyRecovery.shouldProbe(0, original))
            assertFalse(text, PolishCurrencyRecovery.accepts(0, original, candidate("83,41 zł")))
        }
    }

    @Test
    fun rejectsAnyAmountSignGroupingOrCurrencyRewrite() {
        val original = listOf(candidate("83,41 zì"), candidate("2,18 zł"))
        for (text in listOf("83.41 zł", "83,42 zł", "8,341 zł", "-83,41 zł", "+83,41 zł", "083,41 zł", "83,410 zł", "83,41 zl", "83,41 zì", "83,41 PLN", "83,41 zł extra", "label 83,41 zł", "83,41 zł\nnoise", "83,41 ${'$'}", "")) {
            assertFalse(text, PolishCurrencyRecovery.accepts(0, original, candidate(text)))
        }
        for (text in listOf("1823.41 zł", "1.823,41 zł", "1,823.42 zł")) {
            assertFalse(text, PolishCurrencyRecovery.accepts(0, listOf(candidate("1,823.41 zl"), original[1]), candidate(text)))
        }
    }

    @Test
    fun requiresSeparateOriginalCommonEvidenceAndExactPackIdentity() {
        val damaged = candidate("83,41 zl")
        val proof = candidate("2,18 zł")
        val recovery = candidate("83,41 zł")
        assertFalse(PolishCurrencyRecovery.shouldProbe(0, listOf(damaged)))
        assertFalse(PolishCurrencyRecovery.shouldProbe(0, listOf(damaged, candidate("2,18 zl"))))
        assertFalse(PolishCurrencyRecovery.shouldProbe(0, listOf(damaged, candidate("VAT 2,18 zł"))))
        assertFalse(PolishCurrencyRecovery.shouldProbe(-1, listOf(damaged, proof)))
        assertFalse(PolishCurrencyRecovery.shouldProbe(2, listOf(damaged, proof)))
        assertFalse(PolishCurrencyRecovery.shouldProbe(0, listOf(null, proof)))
        val different = listOf(pack.copy(modelPackId = "other"), pack.copy(modelVersion = "next"),
            pack.copy(modelAssetPath = "/other"), pack.copy(configAssetPath = "/other"),
            pack.copy(acceptedScripts = setOf(ScriptEvidence.CYRILLIC)))
        for (spec in different) {
            assertFalse(PolishCurrencyRecovery.shouldProbe(0, listOf(damaged, proof.copy(pack = spec))))
            assertFalse(PolishCurrencyRecovery.accepts(0, listOf(damaged, proof), recovery.copy(pack = spec)))
        }
        val specialist = damaged.copy(pack = pack.copy(acceptedScripts = setOf(ScriptEvidence.CYRILLIC)))
        assertFalse(PolishCurrencyRecovery.shouldProbe(0, listOf(specialist, proof)))
    }

    @Test
    fun allThreeEvidenceSourcesMustHaveFiniteBoundedConfidence() {
        for (confidence in listOf(-1f, 0f, 0.7999f, 1.0001f, Float.NaN, Float.POSITIVE_INFINITY, Float.NEGATIVE_INFINITY)) {
            val damaged = candidate("83,41 zl")
            val proof = candidate("2,18 zł")
            val recovery = candidate("83,41 zł")
            assertFalse(PolishCurrencyRecovery.accepts(0, listOf(damaged.copy(confidence = confidence), proof), recovery))
            assertFalse(PolishCurrencyRecovery.accepts(0, listOf(damaged, proof.copy(confidence = confidence)), recovery))
            assertFalse(PolishCurrencyRecovery.accepts(0, listOf(damaged, proof), recovery.copy(confidence = confidence)))
        }
        for (confidence in listOf(0.8f, 1f)) {
            assertTrue(PolishCurrencyRecovery.accepts(0, listOf(candidate("83,41 zl", confidence), candidate("2,18 zł", confidence)), candidate("83,41 zł", confidence)))
        }
    }
}
