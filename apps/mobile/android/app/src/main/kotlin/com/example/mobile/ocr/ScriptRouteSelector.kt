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
    fun select(candidates: Iterable<ScriptCandidate>): ScriptCandidate? = candidates
        .filter { it.text.isNotEmpty() }
        .maxByOrNull(::score)

    fun score(candidate: ScriptCandidate): Double {
        var matched = 0
        var mismatched = 0
        var strong = 0
        candidate.text.codePoints().forEach { codePoint ->
            val script = scriptOf(codePoint)
            if (script != ScriptEvidence.NEUTRAL) {
                strong++
                if (script in candidate.pack.acceptedScripts) matched++ else mismatched++
            }
        }
        if (strong == 0) return candidate.confidence.toDouble()
        val matchRatio = matched.toDouble() / strong
        val mismatchRatio = mismatched.toDouble() / strong
        return candidate.confidence + (0.20 * matchRatio) - (0.55 * mismatchRatio)
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
