package com.example.mobile.ocr

import org.junit.Assert.assertEquals
import org.junit.Test

class ScriptRouteSelectorTest {
    @Test
    fun strongCommonTextStillGeneratesEverySpecialistProbe() {
        val common = candidate("common", ScriptEvidence.COMMON, "TOTAL 12.50", 0.94f)
        val packs = listOf(
            common.pack,
            spec("arabic", ScriptEvidence.ARABIC),
            spec("thai", ScriptEvidence.THAI),
        )

        assertEquals(
            listOf("arabic", "thai"),
            ScriptRouteSelector.specialistPackIdsForLine(common, packs),
        )
    }

    @Test
    fun highConfidenceLatinHallucinationCannotSuppressArabicOrThaiProbe() {
        val common = candidate("common", ScriptEvidence.COMMON, "12.50", 0.96f)
        val packs = listOf(
            common.pack,
            spec("arabic", ScriptEvidence.ARABIC),
            spec("thai", ScriptEvidence.THAI),
        )

        assertEquals(
            listOf("arabic", "thai"),
            ScriptRouteSelector.specialistPackIdsForLine(common, packs),
        )
    }

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
    fun ArabicPresentationFormsRemainSpecialistEvidence() {
        val selected = ScriptRouteSelector.select(
            listOf(
                candidate("common", ScriptEvidence.COMMON, "TOTAL", 0.99f),
                candidate("arabic", ScriptEvidence.ARABIC, "ﻣﺨﺵﻮﻋ", 0.82f),
            ),
        )

        assertEquals("arabic", selected?.pack?.modelPackId)
    }

    @Test
    fun pureSingleGlyphSpecialistItemRemainsValidEvidence() {
        val selected = ScriptRouteSelector.select(
            listOf(
                candidate("common", ScriptEvidence.COMMON, "X", 0.99f),
                candidate("korean", ScriptEvidence.KOREAN, "차", 0.82f),
            ),
        )

        assertEquals("korean", selected?.pack?.modelPackId)
    }

    @Test
    fun bundledCyrillicExtendedBLettersRouteToCyrillicPack() {
        val selected = ScriptRouteSelector.select(
            listOf(
                candidate("common", ScriptEvidence.COMMON, "X", 0.99f),
                candidate("cyrillic", ScriptEvidence.CYRILLIC, "Ꚙꚟ", 0.82f),
            ),
        )

        assertEquals("cyrillic", selected?.pack?.modelPackId)
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

    @Test
    fun oneSpecialistGlyphCannotOverrideStrongCommonRecognition() {
        val selected = ScriptRouteSelector.select(
            listOf(
                candidate("common", ScriptEvidence.COMMON, "TOTAL 12.50", 0.99f),
                candidate("arabic", ScriptEvidence.ARABIC, "TOTAL 12.50 ا", 0.80f),
            ),
        )

        assertEquals("common", selected?.pack?.modelPackId)
    }

    @Test
    fun oneSpecialistGlyphAndCombiningMarkStillCannotOverrideCommon() {
        val selected = ScriptRouteSelector.select(
            listOf(
                candidate("common", ScriptEvidence.COMMON, "TOTAL 12.50", 0.99f),
                candidate("arabic", ScriptEvidence.ARABIC, "TOTAL 12.50 اَ", 0.80f),
            ),
        )

        assertEquals("common", selected?.pack?.modelPackId)
    }

    @Test
    fun localNumeralsRemainSpecialistEvidence() {
        val selected = ScriptRouteSelector.select(
            listOf(
                candidate("common", ScriptEvidence.COMMON, "12.50", 0.80f),
                candidate("arabic", ScriptEvidence.ARABIC, "١٢٫٥٠", 0.99f),
            ),
        )

        assertEquals("arabic", selected?.pack?.modelPackId)
        assertEquals(
            "devanagari",
            ScriptRouteSelector.select(
                listOf(
                    candidate("common", ScriptEvidence.COMMON, "12.50", 0.80f),
                    candidate("devanagari", ScriptEvidence.DEVANAGARI, "१२.५०", 0.99f),
                ),
            )?.pack?.modelPackId,
        )
        assertEquals(
            "thai",
            ScriptRouteSelector.select(
                listOf(
                    candidate("common", ScriptEvidence.COMMON, "12.50", 0.80f),
                    candidate("thai", ScriptEvidence.THAI, "๑๒.๕๐", 0.99f),
                ),
            )?.pack?.modelPackId,
        )
    }


    // Synthetic literals, not private receipt content or fixture expectations.
    @Test
    fun currencySymbolCompetitionPreservesLiteralAndScriptEvidence() {
        data class Case(
            val name: String, val common: String, val commonConfidence: Float,
            val specialist: String, val specialistConfidence: Float,
            val script: ScriptEvidence, val preferCommon: Boolean,
        )
        val cases = listOf(
            Case("symbol_beats_lower_confidence_letter", "₹ 8,765.43", 0.943f, "र 8,765.43", 0.93f, ScriptEvidence.DEVANAGARI, true),
            Case("symbol_beats_nearby_letter", "₹ 1,23,456.78", 0.943f, "र 1,23,456.78", 0.946f, ScriptEvidence.DEVANAGARI, true),
            Case("suffix_symbol", "8.50 €", 0.95f, "8.50 р", 0.95f, ScriptEvidence.CYRILLIC, true),
            Case("leading_negative", "-₹8.50", 0.95f, "-र8.50", 0.95f, ScriptEvidence.DEVANAGARI, true),
            Case("inner_negative", "₹−8.50", 0.95f, "र−8.50", 0.95f, ScriptEvidence.DEVANAGARI, true),
            Case("explicit_positive", "+₹8.50", 0.95f, "+र8.50", 0.95f, ScriptEvidence.DEVANAGARI, true),
            Case("decimal_comma", "₹8,50", 0.95f, "र8,50", 0.95f, ScriptEvidence.DEVANAGARI, true),
            Case("western_grouping", "₹12,345.67", 0.95f, "र12,345.67", 0.95f, ScriptEvidence.DEVANAGARI, true),
            Case("european_grouping", "₹12.345,67", 0.95f, "र12.345,67", 0.95f, ScriptEvidence.DEVANAGARI, true),
            Case("ambiguous_identical_separator", "₹1,234", 0.95f, "र1,234", 0.95f, ScriptEvidence.DEVANAGARI, true),
            Case("no_explicit_currency", "8.50", 0.95f, "र8.50", 0.95f, ScriptEvidence.DEVANAGARI, false),
            Case("currency_code_is_not_symbol", "INR 8.50", 0.95f, "र8.50", 0.95f, ScriptEvidence.DEVANAGARI, false),
            Case("currency_letters_remain_text", "₹8.50", 0.95f, "रुपये 8.50", 0.95f, ScriptEvidence.DEVANAGARI, false),
            Case("single_glyph_item", "X", 0.99f, "차", 0.82f, ScriptEvidence.KOREAN, false),
            Case("mixed_script_words", "₹8.50", 0.95f, "TOTAL रकम 8.50", 0.95f, ScriptEvidence.DEVANAGARI, false),
            Case("local_numerals", "₹8.50", 0.95f, "र८.५०", 0.95f, ScriptEvidence.DEVANAGARI, false),
            Case("low_common_confidence", "₹8.50", 0.89f, "र8.50", 0.9f, ScriptEvidence.DEVANAGARI, false),
            Case("large_confidence_gap", "₹8.50", 0.91f, "र8.50", 0.99f, ScriptEvidence.DEVANAGARI, false),
            Case("opposite_signs", "₹-8.50", 0.95f, "र+8.50", 0.95f, ScriptEvidence.DEVANAGARI, false),
            Case("dropped_sign", "-₹8.50", 0.95f, "र8.50", 0.95f, ScriptEvidence.DEVANAGARI, false),
            Case("moved_sign", "-₹8.50", 0.95f, "र-8.50", 0.95f, ScriptEvidence.DEVANAGARI, false),
            Case("opposite_marker_position", "₹8.50", 0.95f, "8.50 र", 0.95f, ScriptEvidence.DEVANAGARI, false),
            Case("different_digits", "₹8.50", 0.95f, "र8.60", 0.95f, ScriptEvidence.DEVANAGARI, false),
            Case("different_separators", "₹8,50", 0.95f, "र8.50", 0.95f, ScriptEvidence.DEVANAGARI, false),
            Case("different_grouping", "₹1,234.50", 0.95f, "र1234.50", 0.95f, ScriptEvidence.DEVANAGARI, false),
            Case("bad_grouping", "₹1,2,3.50", 0.95f, "र1,2,3.50", 0.95f, ScriptEvidence.DEVANAGARI, false),
            Case("two_amounts", "₹8.50 2.00", 0.95f, "र8.50 2.00", 0.95f, ScriptEvidence.DEVANAGARI, false),
            Case("double_sign", "-₹-8.50", 0.95f, "-र-8.50", 0.95f, ScriptEvidence.DEVANAGARI, false),
            Case("parenthesized", "(₹8.50)", 0.95f, "(र8.50)", 0.95f, ScriptEvidence.DEVANAGARI, false),
            Case("decimal_without_integer", "₹.50", 0.95f, "र.50", 0.95f, ScriptEvidence.DEVANAGARI, false),
            Case("letter_combining_sequence", "₹8.50", 0.95f, "ऱ8.50", 0.95f, ScriptEvidence.DEVANAGARI, false),
            Case("integer", "₹850", 0.95f, "र850", 0.95f, ScriptEvidence.DEVANAGARI, true),
        )
        for (case in cases) {
            val common = candidate("common", ScriptEvidence.COMMON, case.common, case.commonConfidence)
            val specialist = candidate("specialist", case.script, case.specialist, case.specialistConfidence)
            for (ordered in listOf(listOf(common, specialist), listOf(specialist, common))) {
                assertEquals(case.name, if (case.preferCommon) common else specialist, ScriptRouteSelector.select(ordered))
            }
        }
    }

    @Test
    fun conflictingEligibleEvidenceRetainsTheCalibratedWinner() {
        val common = candidate("common", ScriptEvidence.COMMON, "₹8.50", 0.95f)
        val specialist = candidate("specialist", ScriptEvidence.DEVANAGARI, "र8.50", 0.95f)
        for (conflict in listOf(
            candidate("common2", ScriptEvidence.COMMON, "€8.50", 0.94f),
            candidate("common2", ScriptEvidence.COMMON, "₹8.60", 0.94f),
            candidate("arabic", ScriptEvidence.ARABIC, "د8.60", 0.94f),
            candidate("korean", ScriptEvidence.KOREAN, "차 8.60", 0.94f),
            candidate("arabic", ScriptEvidence.ARABIC, "مبلغ 8.50", 0.94f),
        )) {
            assertEquals(specialist, ScriptRouteSelector.select(listOf(common, specialist, conflict)))
        }
        assertEquals(common, ScriptRouteSelector.select(listOf(common)))
        assertEquals(specialist, ScriptRouteSelector.select(listOf(specialist)))
        assertEquals(null, ScriptRouteSelector.select(emptyList()))
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

    private fun spec(id: String, script: ScriptEvidence) =
        RecognizerSpec(id, "version", "model", "config", setOf(script))
}
