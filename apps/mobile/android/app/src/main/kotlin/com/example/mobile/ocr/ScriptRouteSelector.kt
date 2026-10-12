package com.example.mobile.ocr

internal enum class ScriptEvidence {
    NEUTRAL,
    COMMON,
    ARABIC,
    CYRILLIC,
    DEVANAGARI,
    KOREAN,
    THAI,
}

internal data class RecognizerSpec(
    val modelPackId: String,
    val modelVersion: String,
    val modelAssetPath: String,
    val configAssetPath: String,
    val acceptedScripts: Set<ScriptEvidence>,
)

internal data class ScriptCandidate(
    val text: String,
    val confidence: Float,
    val pack: RecognizerSpec,
)

// A second, fixed-margin Cyrillic pass is recovery only. The original common
// and every specialist probe still run before this policy is considered.
internal object CyrillicRecovery {
    const val WHITE_MARGIN = 12

    fun shouldProbe(candidates: List<ScriptCandidate>): Boolean {
        val common = candidates.singleOrNull {
            ScriptEvidence.COMMON in it.pack.acceptedScripts
        } ?: return false
        val selected = ScriptRouteSelector.select(candidates)
        return textOnly(common.text) && (selected == null ||
            (ScriptEvidence.COMMON in selected.pack.acceptedScripts &&
                selected.confidence < 0.90f && textOnly(selected.text)))
    }

    fun accepts(candidates: List<ScriptCandidate>, recovery: ScriptCandidate): Boolean =
        shouldProbe(candidates) &&
            recovery.pack.acceptedScripts == setOf(ScriptEvidence.CYRILLIC) &&
            candidates.any { it.pack == recovery.pack } &&
            recovery.confidence in 0.1f..1.0f && recovery.text.isNotEmpty() &&
            textOnly(recovery.text) && ScriptRouteSelector.score(recovery).isFinite()

    private fun textOnly(text: String): Boolean = text.codePoints().noneMatch {
        Character.getType(it) == Character.DECIMAL_DIGIT_NUMBER.toInt() ||
            Character.getType(it) == Character.CURRENCY_SYMBOL.toInt()
    }
}

// Recovery uses another actual common-model output, never a glyph substitution.
// A separate original complete zł cell corroborates the damaged suffix. Keep the
// original number spelling, pack identity and document orientation unchanged.
internal object PolishCurrencyRecovery {
    const val WHITE_MARGIN = 12
    private const val AMOUNT = """([+−-]?(?:[0-9]+[.,][0-9]{2}|[1-9][0-9]{0,2}(?:,[0-9]{3})+\.[0-9]{2}|[1-9][0-9]{0,2}(?:\.[0-9]{3})+,[0-9]{2}))"""
    private val damaged = Regex(AMOUNT + """[ \t]+(?:zl|zì)""")
    private val complete = Regex(AMOUNT + """[ \t]+zł""")

    fun shouldProbe(index: Int, original: List<ScriptCandidate?>): Boolean {
        val candidate = original.getOrNull(index) ?: return false
        if (!confidentCommon(candidate) || amount(damaged, candidate.text) == null) return false
        return original.withIndex().any { (otherIndex, other) ->
            otherIndex != index && other != null && other.pack == candidate.pack &&
                confidentCommon(other) && amount(complete, other.text) != null
        }
    }

    fun accepts(index: Int, original: List<ScriptCandidate?>, recovery: ScriptCandidate): Boolean {
        if (!shouldProbe(index, original)) return false
        val candidate = original[index]!!
        return recovery.pack == candidate.pack && confidentCommon(recovery) &&
            amount(complete, recovery.text) == amount(damaged, candidate.text)
    }

    private fun confidentCommon(candidate: ScriptCandidate): Boolean =
        ScriptEvidence.COMMON in candidate.pack.acceptedScripts &&
            candidate.confidence.isFinite() && candidate.confidence in 0.8f..1.0f

    private fun amount(pattern: Regex, text: String): String? =
        pattern.matchEntire(text.trim(' ', '\t'))?.groupValues?.get(1)
}

internal object ScriptRouteSelector {
    // Confidence outputs from the broad and script-specific recognizers are not
    // directly comparable. Every specialist performs a bounded probe for every
    // detected line, then a fixed, test-bound calibration rewards text that is
    // compatible with the pack's declared script. This correctness-first policy
    // cannot be bypassed by a high-confidence common-model hallucination.
    private const val SCRIPT_MATCH_BONUS = 0.24
    private const val SPECIALIST_BIAS = 0.20
    private const val COMMON_NEUTRAL_BIAS = 0.03
    /**
     * Returns the bounded specialist probe plan after common recognition.
     *
     * OCR text cannot prove that a crop contains only the script it happened to
     * recognize. Consequently, even a high-confidence common result must not
     * suppress Arabic, Thai, or another specialist. The pack inventory is fixed
     * by the verified catalog, so probing every non-common pack remains bounded.
     */
    fun specialistPackIdsForLine(
        commonCandidate: ScriptCandidate,
        packs: Iterable<RecognizerSpec>,
    ): List<String> {
        require(ScriptEvidence.COMMON in commonCandidate.pack.acceptedScripts) {
            "Routing must start with the common recognizer"
        }
        return packs
            .filter { ScriptEvidence.COMMON !in it.acceptedScripts }
            .map { it.modelPackId }
            .distinct()
    }

    fun select(candidates: Iterable<ScriptCandidate>): ScriptCandidate? {
        val eligible = candidates.filter { it.text.isNotEmpty() && score(it).isFinite() }
        val selected = eligible.maxByOrNull(::score) ?: return null
        if (ScriptEvidence.COMMON in selected.pack.acceptedScripts) return selected

        // Captured candidates demonstrate the rupee symbol being displaced by
        // Devanagari ra solely because ra earns a script bonus. Limit this
        // exception to that evidenced glyph pair: arbitrary currency symbols
        // must not suppress genuine single-letter items or currency letters.
        // Keep the selected candidate's text, confidence and provenance intact.
        val common = eligible.singleOrNull {
            ScriptEvidence.COMMON in it.pack.acceptedScripts
        } ?: return selected
        if (common.confidence !in 0.90f..1.0f ||
            common.confidence + 0.03f < selected.confidence
        ) return selected
        val monetary = monetaryGlyph(common.text) ?: return selected
        if (monetary.marker != "₹") return selected
        val agrees = eligible.all { candidate ->
            val shape = monetaryGlyph(candidate.text)
            shape != null && shape.skeleton == monetary.skeleton &&
                if (ScriptEvidence.COMMON in candidate.pack.acceptedScripts) {
                    shape.marker == monetary.marker
                } else {
                    ScriptEvidence.DEVANAGARI in candidate.pack.acceptedScripts &&
                        shape.marker == "र"
                }
        }
        return if (agrees) common else selected
    }

    private data class MonetaryGlyph(val marker: String, val skeleton: String)

    // ASCII digits deliberately exclude local numerals and mixed-script words.
    // Compare separator/sign spelling, never a parsed or rounded monetary value.
    // Grouping may be locale-ambiguous (1,234); identical spelling is required.
    private val amountLiteral = Regex(
        """(?:[0-9]+(?:[.,][0-9]{1,3})?|[0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{1,3})?|[0-9]{1,2}(?:,[0-9]{2})+,[0-9]{3}(?:\.[0-9]{1,3})?|[0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]{1,3})?)""",
    )
    private val prefixGlyph = Regex("""([+−-]?)([\p{Sc}\p{L}])[ \t]*([+−-]?)([0-9][0-9.,]*)""")
    private val suffixGlyph = Regex("""([+−-]?)([0-9][0-9.,]*)[ \t]*([\p{Sc}\p{L}])""")

    private fun monetaryGlyph(text: String): MonetaryGlyph? {
        val literal = text.trim(' ', '\t')
        prefixGlyph.matchEntire(literal)?.let { match ->
            val (before, marker, after, amount) = match.destructured
            if ((before.isNotEmpty() && after.isNotEmpty()) ||
                !amountLiteral.matches(amount)
            ) return null
            return MonetaryGlyph(marker, "$before#$after$amount")
        }
        suffixGlyph.matchEntire(literal)?.let { match ->
            val (sign, amount, marker) = match.destructured
            if (!amountLiteral.matches(amount)) return null
            return MonetaryGlyph(marker, "$sign$amount#")
        }
        return null
    }

    fun score(candidate: ScriptCandidate): Double {
        val strongScripts = candidate.text.codePoints()
            .toArray()
            .filter { Character.isLetter(it) || Character.isDigit(it) }
            .map(::scriptOf)
            .filter { it != ScriptEvidence.NEUTRAL }
        val scripts = strongScripts.toSet()
        val isCommonPack = ScriptEvidence.COMMON in candidate.pack.acceptedScripts
        if (scripts.isEmpty()) {
            return if (isCommonPack) {
                candidate.confidence + COMMON_NEUTRAL_BIAS
            } else {
                Double.NEGATIVE_INFINITY
            }
        }
        val compatibleScripts = scripts.all {
            it in candidate.pack.acceptedScripts || (!isCommonPack && it == ScriptEvidence.COMMON)
        }
        val declaredCount = strongScripts.count { it in candidate.pack.acceptedScripts }
        val hasMeaningfulDeclaredCoverage = isCommonPack ||
            (declaredCount > 0 &&
                declaredCount * MIN_SPECIALIST_SCRIPT_SHARE_DENOMINATOR >= strongScripts.size)
        val compatible = compatibleScripts && hasMeaningfulDeclaredCoverage
        if (!compatible) return Double.NEGATIVE_INFINITY
        return candidate.confidence + SCRIPT_MATCH_BONUS +
            if (!isCommonPack) SPECIALIST_BIAS else 0.0
    }

    private fun scriptOf(codePoint: Int): ScriptEvidence = when (codePoint) {
        in 0x0041..0x024F, in 0x1E00..0x1EFF -> ScriptEvidence.COMMON
        in 0x3040..0x30FF, in 0x31F0..0x31FF -> ScriptEvidence.COMMON
        in 0x3400..0x4DBF, in 0x4E00..0x9FFF, in 0xF900..0xFAFF -> ScriptEvidence.COMMON
        in 0x0600..0x06FF,
        in 0x0750..0x077F,
        in 0x08A0..0x08FF,
        in 0xFB50..0xFDFF,
        in 0xFE70..0xFEFF,
        -> ScriptEvidence.ARABIC
        in 0x0400..0x052F,
        in 0x1C80..0x1C8F,
        in 0x2DE0..0x2DFF,
        in 0xA640..0xA69F,
        in 0x1E030..0x1E08F,
        -> ScriptEvidence.CYRILLIC
        in 0x0900..0x097F -> ScriptEvidence.DEVANAGARI
        in 0x0E00..0x0E7F -> ScriptEvidence.THAI
        in 0x1100..0x11FF, in 0x3130..0x318F, in 0xAC00..0xD7AF -> ScriptEvidence.KOREAN
        else -> ScriptEvidence.NEUTRAL
    }

    private const val MIN_SPECIALIST_SCRIPT_SHARE_DENOMINATOR = 4
}
