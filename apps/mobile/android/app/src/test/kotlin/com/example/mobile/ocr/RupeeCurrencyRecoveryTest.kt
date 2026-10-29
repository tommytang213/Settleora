package com.example.mobile.ocr

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RupeeCurrencyRecoveryTest {
    private val commonPack = RecognizerSpec("common", "v1", "common.onnx", "common.yml", setOf(ScriptEvidence.COMMON))
    private val devaPack = RecognizerSpec("deva", "v1", "deva.onnx", "deva.yml", setOf(ScriptEvidence.DEVANAGARI))
    private val recoveryPack = commonPack.copy(modelPackId = "recovery", modelAssetPath = "recovery.onnx", configAssetPath = "recovery.yml")
    private fun candidate(text: String, confidence: Float = 0.95f, pack: RecognizerSpec = commonPack) = ScriptCandidate(text, confidence, pack)
    private fun box(x: Double, y: Double, width: Double = 80.0, height: Double = 20.0) = listOf(
        CalendarDateRecovery.Point(x, y), CalendarDateRecovery.Point(x + width, y),
        CalendarDateRecovery.Point(x + width, y + height), CalendarDateRecovery.Point(x, y + height),
    )
    private val original: List<ScriptCandidate?> = listOf(
        candidate("Widget"), candidate("ऱ 12,34,567.89", pack = devaPack),
        candidate("Other"), candidate("₹45.00"), candidate("Total"), candidate("₹8,765.43"),
    )
    private val common = original.mapIndexed { index, value -> if (index == 1) candidate("12,34,567.89") else value }
    private val points = listOf(box(20.0, 10.0), box(200.0, 10.0), box(20.0, 60.0), box(200.0, 60.0), box(20.0, 110.0), box(200.0, 110.0))
    private val recovery = candidate("₹12,34,567.89", pack = recoveryPack)
    private fun accepts(
        originals: List<ScriptCandidate?> = original,
        commons: List<ScriptCandidate?> = common,
        geometry: List<List<CalendarDateRecovery.Point>> = points,
        recovered: ScriptCandidate = recovery,
    ) = RupeeCurrencyRecovery.accepts(1, originals, commons, geometry, recovered, recoveryPack)

    @Test fun retainsExactMonetarySpellingAcrossSupportedShapes() {
        for (value in listOf("0.00", "27.16", "2,345.67", "12,34,567.89", "-34.56", "+7.89", "−7.89")) {
            for (marker in listOf("र", "ऱ")) {
                val originals = original.toMutableList().also { it[1] = candidate("\t$marker $value ", pack = devaPack) }
                val commons = common.toMutableList().also { it[1] = candidate(" $value\t") }
                assertTrue(accepts(originals, commons, recovered = candidate(" ₹\t$value ", pack = recoveryPack)))
            }
        }
        assertTrue(accepts(geometry = points.map { it.reversed() }))
    }

    @Test fun rejectsChangedDigitsSignsSeparatorsAndCurrency() {
        for (value in listOf("₹12,34,567.88", "₹1,234,567.89", "₹-12,34,567.89", "₹12,34,567.890", "₹12,34,567", "₹१२,३४,५६७.८९", "₹12,34,567.89\n", "$12,34,567.89", "Rs12,34,567.89", "₹12,34,567.89 extra")) {
            assertFalse(value, accepts(recovered = candidate(value, pack = recoveryPack)))
        }
        assertFalse(accepts(commons = common.toMutableList().also { it[1] = candidate("1,234,567.89") }))
    }

    @Test fun rejectsWordsPartialNumbersAndArbitrarySingleLetters() {
        for (text in listOf("रोटी 12,34,567.89", "A 12,34,567.89", "ر 12,34,567.89", "₹12,34,567.89", "ऱ 12,34,567.8", "ऱ 12,34,567.89\n", "ऱ -+12,34,567.89")) {
            assertFalse(text, accepts(originals = original.toMutableList().also { it[1] = candidate(text, pack = devaPack) }))
        }
    }

    @Test fun requiresTwoDistinctOriginalAlignedRupeeRows() {
        for (index in listOf(3, 5)) {
            for (value in listOf("45.00", "₹45.00 details", "₹4.5", "")) {
                assertFalse(accepts(originals = original.toMutableList().also { it[index] = candidate(value) }))
            }
            assertFalse(accepts(geometry = points.toMutableList().also { it[index] = box(400.0, if (index == 3) 60.0 else 110.0) }))
        }
        assertFalse(accepts(geometry = points.toMutableList().also { it[5] = points[3] }))
        assertFalse(accepts(originals = original.toMutableList().also { it[3] = recovery; it[5] = recovery }))
    }

    @Test fun rejectsCompetingCurrencyAndUnknownOriginalEvidence() {
        assertFalse(accepts(originals = original + candidate("€6.00"), commons = common + candidate("€6.00"), geometry = points + listOf(box(20.0, 160.0))))
        for (index in original.indices) {
            assertFalse(accepts(originals = original.toMutableList().also { it[index] = null }))
            assertFalse(accepts(originals = original.toMutableList().also { it[index] = candidate("") }))
        }
    }

    @Test fun requiresSoleSeparatePlainTextLeftLabel() {
        for (label in listOf("12345", "Widget 5", "₹Widget", "")) {
            assertFalse(accepts(originals = original.toMutableList().also { it[0] = candidate(label) }))
        }
        for (labelBox in listOf(box(300.0, 10.0), box(200.0, 10.0), box(20.0, 200.0), box(20.0, 29.0))) {
            assertFalse(accepts(geometry = points.toMutableList().also { it[0] = labelBox }))
        }
        assertFalse(accepts(geometry = points.toMutableList().also { it[1] = box(1000.0, 10.0) }))
        assertFalse(accepts(originals = original + candidate("extra"), commons = common + candidate("extra"), geometry = points + listOf(box(350.0, 10.0))))
    }

    @Test fun rejectsInvalidOrIncompleteGeometry() {
        val invalid = listOf(emptyList(), points[1].take(3), List(4) { points[1][0] },
            listOf(points[1][0], points[1][2], points[1][1], points[1][3]),
            box(-1.0, 10.0), box(Double.NaN, 10.0), box(Double.POSITIVE_INFINITY, 10.0))
        for (value in invalid) {
            for (index in points.indices) assertFalse(accepts(geometry = points.toMutableList().also { it[index] = value }))
        }
        assertFalse(accepts(geometry = points.dropLast(1)))
        assertFalse(accepts(commons = common.dropLast(1)))
        assertFalse(RupeeCurrencyRecovery.shouldProbe(-1, original, common, points))
        assertFalse(RupeeCurrencyRecovery.shouldProbe(original.size, original, common, points))
    }

    @Test fun requiresOriginalAndRecoveryPackIdentities() {
        for (pack in listOf(commonPack.copy(modelVersion = "v2"), commonPack.copy(modelAssetPath = "other"), commonPack.copy(configAssetPath = "other"))) {
            assertFalse(accepts(commons = common.toMutableList().also { it[1] = candidate("12,34,567.89", pack = pack) }))
        }
        assertFalse(accepts(originals = original.toMutableList().also { it[1] = it[1]!!.copy(pack = commonPack) }))
        for (pack in listOf(commonPack, recoveryPack.copy(modelVersion = "v2"), recoveryPack.copy(configAssetPath = "other"), recoveryPack.copy(acceptedScripts = setOf(ScriptEvidence.KOREAN)))) {
            assertFalse(accepts(recovered = recovery.copy(pack = pack)))
        }
    }

    @Test fun rejectsNonfiniteLowAndOutOfRangeConfidence() {
        for (value in listOf(-1f, 0f, 0.8999f, 1.0001f, Float.NaN, Float.POSITIVE_INFINITY, Float.NEGATIVE_INFINITY)) {
            for (index in listOf(0, 1, 3, 5)) assertFalse(accepts(originals = original.toMutableList().also { it[index] = it[index]!!.copy(confidence = value) }))
            assertFalse(accepts(commons = common.toMutableList().also { it[1] = it[1]!!.copy(confidence = value) }))
            assertFalse(accepts(recovered = recovery.copy(confidence = value)))
        }
        for (value in listOf(0.90f, 1f)) assertTrue(accepts(originals = original.map { it!!.copy(confidence = value) }, commons = common.map { it!!.copy(confidence = value) }, recovered = recovery.copy(confidence = value)))
    }
}
