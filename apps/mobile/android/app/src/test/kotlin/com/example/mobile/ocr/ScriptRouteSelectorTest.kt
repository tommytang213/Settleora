package com.example.mobile.ocr

import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File
import java.util.regex.Pattern

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
            Case("suffix_symbol", "8.50 ₹", 0.95f, "8.50 र", 0.95f, ScriptEvidence.DEVANAGARI, true),
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
            Case("genuine_single_letter_item_with_price", "₹8.50", 0.95f, "차 8.50", 0.95f, ScriptEvidence.KOREAN, false),
            Case("currency_letter_with_price", "₹8.50", 0.95f, "р8.50", 0.95f, ScriptEvidence.CYRILLIC, false),
            Case("unrelated_devanagari_letter", "₹8.50", 0.95f, "म8.50", 0.95f, ScriptEvidence.DEVANAGARI, false),
            Case("precomposed_nukta_letter", "₹8.50", 0.95f, "ऱ8.50", 0.95f, ScriptEvidence.DEVANAGARI, false),
            Case("unrelated_currency_symbol", "€8.50", 0.95f, "र8.50", 0.95f, ScriptEvidence.DEVANAGARI, false),
            Case("unrelated_dollar_symbol", "$8.50", 0.95f, "र8.50", 0.95f, ScriptEvidence.DEVANAGARI, false),
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

    @Test
    fun swiftSearchPatternsConsumeWholeGroupedLiterals() {
        // Exercise the actual Swift pattern literals with a search API. This
        // catches prefix-alternative matches that Android's matches() hides;
        // it supplements, but does not replace, the iOS native test target.
        val swift = generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
            .map { File(it, "apps/mobile/ios/Runner/PaddleOCR/SettleoraOcrModels.swift") }
            .first { it.isFile }.readText()
        val declarations = swift.substringAfter("private static let amountLiteral")
            .substringBefore("private static func wholeMatch")
        val patterns = Regex("""pattern: #"([^"]+)"#""").findAll(declarations)
            .map { Pattern.compile(it.groupValues[1]) }.toList()
        assertEquals(3, patterns.size)
        for (amount in listOf("8,765.43", "1,23,456.78", "12.345,67", "8.50", "1,234")) {
            val literals = listOf(amount, "₹ $amount", "$amount ₹")
            for ((pattern, literal) in patterns.zip(literals)) {
                val match = pattern.matcher(literal)
                assertEquals(literal, true, match.find())
                assertEquals(literal, 0, match.start())
                assertEquals(literal, literal.length, match.end())
                assertEquals(false, pattern.matcher("noise $literal").find())
                assertEquals(false, pattern.matcher("$literal extra").find())
                assertEquals(false, pattern.matcher("$literal\n").find())
            }
        }
        for (invalid in listOf("1,2,3.50", ".50", "8.50 2.00")) {
            assertEquals(false, patterns.first().matcher(invalid).find())
        }
    }

    @Test
    fun cyrillicRecoveryKeepsOriginalCandidatesAndUsesExistingSelector() {
        val common = candidate("common", ScriptEvidence.COMMON, "Cyr", 0.85f)
        val original = candidate("cyrillic", ScriptEvidence.CYRILLIC, "Суr", 0.50f)
        val recovery = candidate("cyrillic", ScriptEvidence.CYRILLIC, "Сыр", 0.68f)
        val values = listOf(common, original)
        assertEquals(common, ScriptRouteSelector.select(values))
        assertEquals(true, CyrillicRecovery.shouldProbe(values))
        assertEquals(true, CyrillicRecovery.accepts(values, recovery))
        assertEquals(recovery, ScriptRouteSelector.select(values + recovery))
        assertEquals(listOf(common, original), values)
        val empty = listOf(common.copy(text = "", confidence = 0f), original.copy(text = "HAC"))
        assertEquals(null, ScriptRouteSelector.select(empty))
        assertEquals(true, CyrillicRecovery.accepts(empty, recovery))
    }

    @Test
    fun cyrillicRecoveryPreservesStrongCommonAndExistingSpecialistWinners() {
        val original = candidate("cyrillic", ScriptEvidence.CYRILLIC, "HAC", 0.5f)
        val recovery = original.copy(text = "НАС", confidence = 0.99f)
        for (confidence in listOf(0.90f, 0.99f, 1.0f)) {
            val values = listOf(candidate("common", ScriptEvidence.COMMON, "Example", confidence), original)
            assertEquals(false, CyrillicRecovery.shouldProbe(values))
            assertEquals(false, CyrillicRecovery.accepts(values, recovery))
        }
        val winner = original.copy(text = "Сыр", confidence = 0.8f)
        val values = listOf(candidate("common", ScriptEvidence.COMMON, "", 0f), winner)
        assertEquals(winner, ScriptRouteSelector.select(values))
        assertEquals(false, CyrillicRecovery.accepts(values, recovery))
    }

    @Test
    fun cyrillicRecoveryRejectsDatesAllDecimalScriptsAndCurrencySymbols() {
        val common = candidate("common", ScriptEvidence.COMMON, "Label", 0.8f)
        val original = candidate("cyrillic", ScriptEvidence.CYRILLIC, "HAC", 0.5f)
        val recovery = original.copy(text = "НАС", confidence = 0.8f)
        val forbidden = listOf("Sep 09, 2025", "1", "٢", "३", "๔", "５", "𝟞", "$", "€", "₽", "₫", "₹")
        for (literal in forbidden) {
            assertEquals(literal, false, CyrillicRecovery.shouldProbe(listOf(common.copy(text = literal), original)))
            assertEquals(literal, false, CyrillicRecovery.accepts(listOf(common, original), recovery.copy(text = "НАС $literal")))
        }
    }

    @Test
    fun cyrillicRecoveryRejectsInvalidConfidenceWrongPackAndIneligibleScript() {
        val common = candidate("common", ScriptEvidence.COMMON, "Label", 0.8f)
        val original = candidate("cyrillic", ScriptEvidence.CYRILLIC, "HAC", 0.5f)
        val values = listOf(common, original)
        for (confidence in listOf(-1f, 0f, 0.099f, 1.001f, Float.NaN, Float.POSITIVE_INFINITY)) {
            assertEquals(false, CyrillicRecovery.accepts(values, original.copy(text = "НАС", confidence = confidence)))
        }
        for (text in listOf("", "HAC", "ภาษาไทย", "كلمة", "AБCDE")) {
            assertEquals(false, CyrillicRecovery.accepts(values, original.copy(text = text, confidence = 0.8f)))
        }
        assertEquals(false, CyrillicRecovery.accepts(values, candidate("other", ScriptEvidence.CYRILLIC, "НАС", 0.8f)))
        assertEquals(false, CyrillicRecovery.accepts(values, candidate("common", ScriptEvidence.COMMON, "Word", 0.8f)))
        assertEquals(false, CyrillicRecovery.shouldProbe(listOf(original)))
        assertEquals(false, CyrillicRecovery.shouldProbe(values + common))
    }

    @Test
    fun numericObservationSeparatesEligibleDisagreementFromRejectedLongerAlternates() {
        val short = candidate("common", ScriptEvidence.COMMON, "1", 0.95f)
        val longer = short.copy(text = "12.50", confidence = 0.8f)
        val rejected = longer.copy(confidence = Float.NaN)
        val rows = listOf(listOf(short, longer), listOf(short, rejected), listOf(short, short.copy()))
        val frozen = rows.map(ScriptRouteSelector::select)
        val before = rows.map { it.toList() }
        val observation = NumericRoutingObserver.observe(rows, frozen)
        assertEquals("observed", observation["status"])
        assertEquals(3, observation["numericCandidateCropCount"])
        assertEquals(3, observation["eligibleNumericCandidateCropCount"])
        assertEquals(2, observation["competingEligibleNumericCandidateCropCount"])
        assertEquals(1, observation["eligibleNumericLiteralDisagreementCropCount"])
        assertEquals(1, observation["selectedShorterThanEligibleNumericAlternateCropCount"])
        assertEquals(2, observation["selectedShorterThanAnyNumericAlternateCropCount"])
        assertEquals(before, rows)
        assertEquals(frozen, rows.map(ScriptRouteSelector::select))
        assertEquals(listOf(short, short, short), frozen)
    }

    @Test
    fun numericObservationCountsUnicodeScalarsAndExactLiteralsWithoutMoneyInterpretation() {
        val selected = candidate("common", ScriptEvidence.COMMON, " \t𝟙٢،३.４\t", 0.95f).let {
            it.copy(pack = it.pack.copy(acceptedScripts = setOf(ScriptEvidence.COMMON, ScriptEvidence.ARABIC, ScriptEvidence.DEVANAGARI)))
        }
        val alternate = selected.copy(text = "12,3.4", confidence = 0.8f)
        val values = listOf(listOf(selected, alternate))
        val observation = NumericRoutingObserver.observe(values, values.map(ScriptRouteSelector::select))
        assertEquals("observed", observation["status"])
        assertEquals(1, observation["eligibleNumericLiteralDisagreementCropCount"])
        assertEquals(0, observation["selectedShorterThanAnyNumericAlternateCropCount"])
        assertEquals(1, (observation["selectedDigitCountBins"] as Map<*, *>)["four"])
        for (text in listOf("TOTAL 12.50", "$12.50", "12/50", "12\n50", "½", "+ . ,")) {
            val candidate = selected.copy(text = text)
            val observed = NumericRoutingObserver.observe(listOf(listOf(candidate)), listOf(candidate))
            assertEquals(text, 0, observed["numericCandidateCropCount"])
            assertEquals(text, 1, (observed["selectedDigitCountBins"] as Map<*, *>)["nonNumeric"])
        }
        val date = selected.copy(text = "2031-04-19")
        assertEquals(1, NumericRoutingObserver.observe(listOf(listOf(date)), listOf(date))["numericCandidateCropCount"])
    }

    @Test
    fun numericObservationDistinguishesObservedZeroUnavailableAndInvalidWithoutPayload() {
        val zero = NumericRoutingObserver.observe(emptyList(), emptyList())
        assertEquals("observed", zero["status"])
        assertEquals(0, zero["observedCropCount"])
        assertEquals(mapOf("schemaVersion" to 1, "stage" to "selectedOrientationPreRecovery", "status" to "unavailable"),
            NumericRoutingObserver.unavailable())
        val value = candidate("common", ScriptEvidence.COMMON, "private text", 0.95f)
        for (invalid in listOf(
            NumericRoutingObserver.observe(listOf(listOf(value)), emptyList()),
            NumericRoutingObserver.observe(List(257) { emptyList() }, List(257) { null }),
            NumericRoutingObserver.observe(listOf(emptyList()), listOf(value)),
            NumericRoutingObserver.observe(listOf(listOf(value.copy(text = "1"))), listOf(null)),
            NumericRoutingObserver.observe(listOf(listOf(value.copy(confidence = Float.NaN))), listOf(value.copy(confidence = Float.NaN))),
        )) {
            assertEquals(mapOf("schemaVersion" to 1, "stage" to "selectedOrientationPreRecovery", "status" to "invalid"), invalid)
        }
        val rejected = value.copy(text = "12.50", confidence = Float.NaN)
        val absent = NumericRoutingObserver.observe(listOf(listOf(rejected)), listOf(null))
        assertEquals(1, absent["numericCandidateCropCount"])
        assertEquals(0, absent["eligibleNumericCandidateCropCount"])
        assertEquals(1, (absent["selectedDigitCountBins"] as Map<*, *>)["noSelection"])
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
