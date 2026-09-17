package com.example.mobile.ocr

import java.text.BreakIterator
import java.util.Locale

/** Normalizes provider-specific text ordering before it crosses the app boundary. */
internal object RecognizedTextNormalizer {
    fun normalize(text: String, pack: RecognizerSpec): String {
        if (ScriptEvidence.ARABIC !in pack.acceptedScripts || !containsArabic(text)) {
            return text
        }
        return arabicVisualToLogical(text)
    }

    /**
     * Paddle's Arabic recognizer emits glyphs in visual order. Reverse grapheme
     * order to recover logical RTL text, then restore each embedded LTR/number
     * run so amounts, dates, and Latin currency codes keep their own order.
     */
    private fun arabicVisualToLogical(text: String): String {
        val iterator = BreakIterator.getCharacterInstance(Locale.ROOT)
        iterator.setText(text)
        val graphemes = mutableListOf<String>()
        var start = iterator.first()
        var end = iterator.next()
        while (end != BreakIterator.DONE) {
            graphemes += text.substring(start, end)
            start = end
            end = iterator.next()
        }

        val logical = graphemes.asReversed().toMutableList()
        var runStart = 0
        while (runStart < logical.size) {
            if (!isForwardRunGrapheme(logical[runStart])) {
                runStart++
                continue
            }
            var runEnd = runStart + 1
            while (runEnd < logical.size && isForwardRunGrapheme(logical[runEnd])) {
                runEnd++
            }
            logical.subList(runStart, runEnd).reverse()
            runStart = runEnd
        }
        return logical.joinToString("")
    }

    private fun containsArabic(text: String): Boolean = text.codePoints().anyMatch { codePoint ->
        Character.UnicodeScript.of(codePoint) == Character.UnicodeScript.ARABIC
    }

    private fun isForwardRunGrapheme(grapheme: String): Boolean {
        val codePoints = grapheme.codePoints().toArray()
        if (codePoints.any { codePoint ->
                when (Character.getDirectionality(codePoint).toInt()) {
                    Character.DIRECTIONALITY_LEFT_TO_RIGHT.toInt(),
                    Character.DIRECTIONALITY_EUROPEAN_NUMBER.toInt(),
                    Character.DIRECTIONALITY_ARABIC_NUMBER.toInt(),
                    -> true
                    else -> false
                }
            }
        ) {
            return true
        }
        return grapheme.all { it in ".,،٫٬/%:+-" }
    }
}
