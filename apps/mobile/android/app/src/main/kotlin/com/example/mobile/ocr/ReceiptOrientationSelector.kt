package com.example.mobile.ocr

/**
 * Chooses whether recognition crops must be rotated 180 degrees.
 *
 * Text detection is intentionally shared between both probes. Selection uses
 * only bounded recognition confidence and never phone locale, file names, or
 * receipt contents. A material aggregate advantage plus a majority of decisive
 * lines is required, so a single noisy crop cannot flip the document.
 */
internal object ReceiptOrientationSelector {
    private const val DECISIVE_LINE_MARGIN = 0.08
    private const val AGGREGATE_MARGIN_PER_LINE = 0.10

    fun shouldRotate180(
        uprightCandidates: List<ScriptCandidate>,
        rotatedCandidates: List<ScriptCandidate>,
    ): Boolean {
        require(uprightCandidates.size == rotatedCandidates.size) {
            "Orientation probes must contain the same detected lines"
        }
        if (uprightCandidates.isEmpty()) return false

        var rotatedWins = 0
        var uprightWins = 0
        var uprightScore = 0.0
        var rotatedScore = 0.0
        uprightCandidates.zip(rotatedCandidates).forEach { (upright, rotated) ->
            val normal = lineScore(upright)
            val flipped = lineScore(rotated)
            uprightScore += normal
            rotatedScore += flipped
            when {
                flipped - normal >= DECISIVE_LINE_MARGIN -> rotatedWins += 1
                normal - flipped >= DECISIVE_LINE_MARGIN -> uprightWins += 1
            }
        }

        return rotatedWins > uprightWins &&
            rotatedWins * 2 >= uprightCandidates.size &&
            rotatedScore - uprightScore >=
            AGGREGATE_MARGIN_PER_LINE * uprightCandidates.size
    }

    private fun lineScore(candidate: ScriptCandidate): Double {
        if (candidate.text.isBlank()) return 0.0
        val meaningful = candidate.text.codePoints().toArray().count {
            Character.isLetterOrDigit(it)
        }
        if (meaningful == 0) return 0.0
        val meaningfulShare = meaningful.toDouble() /
            candidate.text.codePointCount(0, candidate.text.length)
        return candidate.confidence.coerceIn(0f, 1f) * (0.75 + 0.25 * meaningfulShare)
    }
}
