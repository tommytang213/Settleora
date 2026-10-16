package com.example.mobile.ocr

// A recovery-only recognizer may restore an actual rupee glyph in a separate
// money column. Original recognizers, geometry and orientation supply the role;
// recovery never supplies its own corroboration or rewrites a monetary value.
internal object RupeeCurrencyRecovery {
    private const val AMOUNT = """[+−-]?(?:[0-9]+\.[0-9]{2}|[1-9][0-9]{0,2}(?:,[0-9]{3})+\.[0-9]{2}|[1-9][0-9]?(?:,[0-9]{2})+,[0-9]{3}\.[0-9]{2})"""
    private val bare = Regex(AMOUNT)
    private val damaged = Regex("""[रऱ][ \t]*(""" + AMOUNT + ")")
    private val complete = Regex("""₹[ \t]*(""" + AMOUNT + ")")
    private data class Bounds(val left: Double, val top: Double, val right: Double, val bottom: Double)

    fun shouldProbe(
        index: Int,
        original: List<ScriptCandidate?>,
        common: List<ScriptCandidate?>,
        points: List<List<CalendarDateRecovery.Point>>,
    ): Boolean = originalAmount(index, original, common, points) != null

    fun accepts(
        index: Int,
        original: List<ScriptCandidate?>,
        common: List<ScriptCandidate?>,
        points: List<List<CalendarDateRecovery.Point>>,
        recovery: ScriptCandidate,
        recoveryPack: RecognizerSpec,
    ): Boolean {
        val amount = originalAmount(index, original, common, points) ?: return false
        return recovery.pack == recoveryPack &&
            recoveryPack.acceptedScripts == setOf(ScriptEvidence.COMMON) &&
            recoveryPack != common[index]?.pack && confident(recovery) &&
            complete.matchEntire(recovery.text.trim(' ', '\t'))?.groupValues?.get(1) == amount
    }

    private fun originalAmount(
        index: Int,
        original: List<ScriptCandidate?>,
        common: List<ScriptCandidate?>,
        points: List<List<CalendarDateRecovery.Point>>,
    ): String? {
        if (original.size != common.size || original.size != points.size) return null
        val selected = original.getOrNull(index) ?: return null
        val broad = common.getOrNull(index) ?: return null
        if (selected.pack.acceptedScripts != setOf(ScriptEvidence.DEVANAGARI) ||
            broad.pack.acceptedScripts != setOf(ScriptEvidence.COMMON) ||
            !confident(selected) || !confident(broad)) return null
        val amount = damaged.matchEntire(selected.text.trim(' ', '\t'))?.groupValues?.get(1) ?: return null
        if (!bare.matches(amount) || broad.text.trim(' ', '\t') != amount) return null
        if (original.any { it == null || it.text.isEmpty() || it.text.codePoints().anyMatch { c ->
                Character.getType(c) == Character.CURRENCY_SYMBOL.toInt() && c != '₹'.code
            } }) return null
        val rectangles = points.map { bounds(it) ?: return null }
        val cell = rectangles[index]
        val neighbors = rectangles.indices.filter { it != index && overlap(cell, rectangles[it]) > 0 }
        if (neighbors.size != 1) return null
        val labelIndex = neighbors.single()
        val label = original[labelIndex] ?: return null
        val labelBox = rectangles[labelIndex]
        if (!confident(label) || !label.text.codePoints().anyMatch(Character::isLetter) ||
            label.text.codePoints().anyMatch {
                Character.getType(it) == Character.DECIMAL_DIGIT_NUMBER.toInt() ||
                    Character.getType(it) == Character.CURRENCY_SYMBOL.toInt()
            }) return null
        if (labelBox.right > cell.left ||
            overlap(cell, labelBox) < minOf(cell.bottom - cell.top, labelBox.bottom - labelBox.top) / 2 ||
            cell.left - labelBox.right > 4 * maxOf(cell.right - cell.left, labelBox.right - labelBox.left)) return null
        val proofs = original.indices.filter { otherIndex ->
            val other = original[otherIndex] ?: return@filter false
            val rect = rectangles[otherIndex]
            otherIndex != index && other.pack == broad.pack && confident(other) &&
                complete.matches(other.text.trim(' ', '\t')) && overlap(cell, rect) <= 0 &&
                kotlin.math.abs(cell.right - rect.right) <= maxOf(cell.bottom - cell.top, rect.bottom - rect.top) / 2
        }
        if (!proofs.any { a -> proofs.any { b -> a != b && overlap(rectangles[a], rectangles[b]) <= 0 } }) return null
        return amount
    }

    private fun confident(candidate: ScriptCandidate): Boolean =
        candidate.confidence.isFinite() && candidate.confidence in 0.90f..1.0f

    private fun bounds(points: List<CalendarDateRecovery.Point>): Bounds? {
        if (points.size != 4 || points.any { !it.x.isFinite() || !it.y.isFinite() || it.x < 0 || it.y < 0 }) return null
        val crosses = points.indices.map { i ->
            val a = points[i]; val b = points[(i + 1) % 4]; val c = points[(i + 2) % 4]
            (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
        }
        if (crosses.any { !it.isFinite() } || !(crosses.all { it > 0 } || crosses.all { it < 0 })) return null
        return Bounds(points.minOf { it.x }, points.minOf { it.y }, points.maxOf { it.x }, points.maxOf { it.y })
    }

    private fun overlap(a: Bounds, b: Bounds): Double = minOf(a.bottom, b.bottom) - maxOf(a.top, b.top)
}
