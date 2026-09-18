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

    fun select(candidates: Iterable<ScriptCandidate>): ScriptCandidate? = candidates
        .filter { it.text.isNotEmpty() }
        .filter { score(it).isFinite() }
        .maxByOrNull(::score)

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
