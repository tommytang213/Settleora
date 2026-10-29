package com.example.mobile.ocr

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CalendarDateRecoveryTest {
    private val pack = RecognizerSpec("common", "test", "/test", "/test", setOf(ScriptEvidence.COMMON))
    private fun candidate(text: String, confidence: Float = 0.95f, spec: RecognizerSpec = pack) = ScriptCandidate(text, confidence, spec)
    private fun box(x: Double, y: Double, width: Double = 80.0, height: Double = 20.0) = listOf(
        CalendarDateRecovery.Point(x, y), CalendarDateRecovery.Point(x + width, y),
        CalendarDateRecovery.Point(x + width, y + height), CalendarDateRecovery.Point(x, y + height),
    )
    private val points = listOf(box(20.0, 10.0), box(130.0, 10.0, 160.0))
    private val original = listOf(candidate("Date:"), candidate("2031·0419"))
    private val recovery = candidate("2031·04·19·", 0.81f)

    @Test fun restoresOnlyActualSeparatorsWithAllOriginalDigits() {
        for (label in listOf("Date", "DATE:", "datum", "Fecha:", "Data", "日期：", "日付", "날짜", "Дата:", "วันที่", "तारीख", "दिनांक")) for (date in listOf("2031·0419", "2000·0229", "2024·0229", "1900·0228", "1999·1231", "2099·0101")) {
            val original = listOf(candidate(label), candidate(date))
            val snapshot = original.toList()
            val complete = date.substring(0, 7) + "·" + date.substring(7)
            for (suffix in listOf("", "·")) {
                val recovered = candidate(complete + suffix, 0.81f)
                assertTrue(CalendarDateRecovery.shouldProbe(1, original, points))
                assertTrue(CalendarDateRecovery.accepts(1, original, points, recovered))
                assertEquals(0.81f, recovered.confidence)
                assertEquals(pack, recovered.pack)
                assertEquals(snapshot, original)
            }
            assertFalse(CalendarDateRecovery.shouldProbe(0, original, points))
        }
        assertTrue(CalendarDateRecovery.accepts(1, listOf(candidate("\tDate: "), candidate(" 2031·0419\t")), points, candidate("\t2031·04·19· ")))
    }

    @Test fun rejectsIncompleteInvalidAndProductShapedOriginalDates() {
        for (text in listOf("", "20310419", "2031·419", "2031·00419", "2031·04190", "2031·04·19", "2031·04·19·", "2031·0019", "2031·1319", "2031·0400", "2031·0431", "2031·0229", "1900·0229", "2100·0101", "1899·0101", "２０３１·０４１９", "٢٠٣١·٠٤١٩", "item 2031·0419", "2031·0419 USD", "2031·0419 7.00", "2031·0419\n", "-2031·0419")) {
            assertFalse(text, CalendarDateRecovery.shouldProbe(1, listOf(original[0], candidate(text)), points))
            assertFalse(text, CalendarDateRecovery.accepts(1, listOf(original[0], candidate(text)), points, recovery))
        }
        for (text in listOf("Code", "Receipt date", "Due date", "Stay date", "Order date", "Date item", "Update", "Date 5.00", "日期 1", "日付\n")) assertFalse(text, CalendarDateRecovery.shouldProbe(1, listOf(candidate(text), original[1]), points))
    }

    @Test fun rejectsDigitChangesMixedSeparatorsAndExtraTokens() {
        for (text in listOf("2031·04·18", "2031·01·49", "2031·04·190", "2031·4·19", "2031·04·9", "2031·0419", "2031/04/19", "2031·04/19", "2031·04·19..", "2031·04·19··", "2031·04·19 USD", "2031·04·19 5.00", "2031·04·19\n", "２０３１·０４·１９", "-2031·04·19")) assertFalse(text, CalendarDateRecovery.accepts(1, original, points, candidate(text)))
    }

    @Test fun requiresWholeRowGeometryAndSeparateOriginalEvidence() {
        assertFalse(CalendarDateRecovery.shouldProbe(-1, original, points))
        assertFalse(CalendarDateRecovery.shouldProbe(2, original, points))
        assertFalse(CalendarDateRecovery.shouldProbe(1, listOf(null, original[1]), points))
        assertFalse(CalendarDateRecovery.shouldProbe(1, listOf(original[0], null), points))
        assertFalse(CalendarDateRecovery.shouldProbe(0, listOf(original[1]), listOf(points[1])))
        assertFalse(CalendarDateRecovery.shouldProbe(1, original, points.take(1)))
        assertTrue(CalendarDateRecovery.accepts(1, original, points.map { it.reversed() }, recovery))
        for (invalid in listOf(
            emptyList(), points[0].take(3), listOf(points[0][0], points[0][2], points[0][1], points[0][3]),
            List(4) { points[0][0] }, box(-1.0, 10.0), box(20.0, -1.0),
            box(Double.NaN, 10.0), box(Double.POSITIVE_INFINITY, 10.0), box(20.0, 10.0, Double.MAX_VALUE),
            box(20.0, 50.0), box(20.0, 25.0), box(400.0, 10.0), box(120.0, 10.0),
        )) assertFalse(CalendarDateRecovery.shouldProbe(1, original, listOf(invalid, points[1])))
        assertFalse(CalendarDateRecovery.shouldProbe(1, original, listOf(points[0], box(1000.0, 10.0))))
        for (third in listOf<ScriptCandidate?>(candidate("other"), candidate("", 0f), null)) {
            assertFalse(CalendarDateRecovery.shouldProbe(1, original + third, points + listOf(box(500.0, 10.0))))
        }
        assertTrue(CalendarDateRecovery.accepts(1, original + candidate("separate row"), points + listOf(box(20.0, 60.0)), recovery))
        // An unrelated broken box still prevents proving row exclusivity.
        assertFalse(CalendarDateRecovery.shouldProbe(1, original + candidate("other"), points + listOf(emptyList())))
    }

    @Test fun requiresExactCommonPackIdentityForEveryEvidenceSource() {
        val different = listOf(pack.copy(modelPackId = "other"), pack.copy(modelVersion = "next"),
            pack.copy(modelAssetPath = "/other"), pack.copy(configAssetPath = "/other"),
            pack.copy(acceptedScripts = setOf(ScriptEvidence.KOREAN)))
        for (spec in different) {
            assertFalse(CalendarDateRecovery.shouldProbe(1, listOf(original[0].copy(pack = spec), original[1]), points))
            assertFalse(CalendarDateRecovery.shouldProbe(1, listOf(original[0], original[1].copy(pack = spec)), points))
            assertFalse(CalendarDateRecovery.accepts(1, original, points, recovery.copy(pack = spec)))
        }
    }

    @Test fun allEvidenceNeedsFiniteBoundedConfidence() {
        for (confidence in listOf(-1f, 0f, 0.7999f, 1.0001f, Float.NaN, Float.POSITIVE_INFINITY, Float.NEGATIVE_INFINITY)) {
            assertFalse(CalendarDateRecovery.accepts(1, listOf(original[0].copy(confidence = confidence), original[1]), points, recovery))
            assertFalse(CalendarDateRecovery.accepts(1, listOf(original[0], original[1].copy(confidence = confidence)), points, recovery))
            assertFalse(CalendarDateRecovery.accepts(1, original, points, recovery.copy(confidence = confidence)))
        }
        for (confidence in listOf(0.8f, 1f)) assertTrue(CalendarDateRecovery.accepts(1, original.map { it.copy(confidence = confidence) }, points, recovery.copy(confidence = confidence)))
    }
}
