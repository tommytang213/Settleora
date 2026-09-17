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

internal data class IndependentScriptEvidence(
    val script: ScriptEvidence,
    val confidence: Double,
)

internal object ScriptRouteSelector {
    private const val STRONG_COMMON_CONFIDENCE = 0.90f
    // Short cross-script glyphs are easy to misread as Latin lookalikes (for
    // example Cyrillic "Суп" as "Cyn"), so short lines remain ambiguous.
    private const val MIN_STRONG_SCRIPT_CHARACTERS = 4

    /**
     * Captures routing evidence from the always-available common recognizer
     * before any specialist recognizer is run. Specialist output must never be
     * allowed to manufacture the evidence used to select that same specialist.
     */
    fun evidenceFromCommon(candidate: ScriptCandidate): IndependentScriptEvidence {
        var commonCharacters = 0
        var otherCharacters = 0
        candidate.text.codePoints().forEach { codePoint ->
            when (scriptOf(codePoint)) {
                ScriptEvidence.NEUTRAL -> Unit
                ScriptEvidence.COMMON -> commonCharacters++
                else -> otherCharacters++
            }
        }
        val strong = candidate.confidence >= STRONG_COMMON_CONFIDENCE &&
            commonCharacters >= MIN_STRONG_SCRIPT_CHARACTERS &&
            otherCharacters == 0
        return IndependentScriptEvidence(
            script = if (strong) ScriptEvidence.COMMON else ScriptEvidence.NEUTRAL,
            confidence = if (strong) candidate.confidence.toDouble() else 0.0,
        )
    }

    fun requiresSpecialistFallback(evidence: IndependentScriptEvidence): Boolean =
        evidence.script == ScriptEvidence.NEUTRAL

    fun select(
        candidates: Iterable<ScriptCandidate>,
        evidence: IndependentScriptEvidence,
    ): ScriptCandidate? = candidates
        .filter { it.text.isNotEmpty() }
        .maxByOrNull { score(it, evidence) }

    fun score(candidate: ScriptCandidate, evidence: IndependentScriptEvidence): Double {
        if (evidence.script == ScriptEvidence.NEUTRAL) {
            return candidate.confidence.toDouble()
        }
        val routeAdjustment = if (evidence.script in candidate.pack.acceptedScripts) {
            0.20 * evidence.confidence
        } else {
            -0.55 * evidence.confidence
        }
        return candidate.confidence + routeAdjustment
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
