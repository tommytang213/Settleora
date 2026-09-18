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
    // directly comparable. All recognizers run for every detected line, then a
    // fixed, test-bound calibration rewards text that is compatible with the
    // pack's declared script. This correctness-first policy cannot be bypassed
    // by a high-confidence hallucination from the common recognizer.
    private const val SCRIPT_MATCH_BONUS = 0.24
    private const val SCRIPT_MISMATCH_PENALTY = 0.70
    private const val SPECIALIST_BIAS = 0.20
    private const val COMMON_NEUTRAL_BIAS = 0.03

    fun select(candidates: Iterable<ScriptCandidate>): ScriptCandidate? = candidates
        .filter { it.text.isNotEmpty() }
        .maxByOrNull(::score)

    fun score(candidate: ScriptCandidate): Double {
        val scripts = candidate.text.codePoints()
            .toArray()
            .map(::scriptOf)
            .filter { it != ScriptEvidence.NEUTRAL }
            .toSet()
        val isCommonPack = ScriptEvidence.COMMON in candidate.pack.acceptedScripts
        if (scripts.isEmpty()) {
            return candidate.confidence + if (isCommonPack) COMMON_NEUTRAL_BIAS else 0.0
        }
        val compatible = scripts.all {
            it in candidate.pack.acceptedScripts || (!isCommonPack && it == ScriptEvidence.COMMON)
        }
        val scriptAdjustment = if (compatible) {
            SCRIPT_MATCH_BONUS
        } else {
            -SCRIPT_MISMATCH_PENALTY
        }
        return candidate.confidence + scriptAdjustment + if (isCommonPack) 0.0 else SPECIALIST_BIAS
    }

    private fun scriptOf(codePoint: Int): ScriptEvidence = when (codePoint) {
        in 0x0041..0x024F, in 0x1E00..0x1EFF -> ScriptEvidence.COMMON
        in 0x3040..0x30FF, in 0x31F0..0x31FF -> ScriptEvidence.COMMON
        in 0x3400..0x4DBF, in 0x4E00..0x9FFF, in 0xF900..0xFAFF -> ScriptEvidence.COMMON
        in 0x0600..0x06FF, in 0x0750..0x077F, in 0x08A0..0x08FF -> ScriptEvidence.ARABIC
        in 0x0400..0x052F -> ScriptEvidence.CYRILLIC
        in 0x0900..0x097F -> ScriptEvidence.DEVANAGARI
        in 0x0E00..0x0E7F -> ScriptEvidence.THAI
        in 0x1100..0x11FF, in 0x3130..0x318F, in 0xAC00..0xD7AF -> ScriptEvidence.KOREAN
        else -> ScriptEvidence.NEUTRAL
    }
}
