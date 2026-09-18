package com.example.mobile.ocr

internal object ReceiptBlockOrder {
    private const val MAX_CENTER_DISTANCE_RATIO = 0.75f
    private const val MAX_ROW_CENTER_SPAN_RATIO = 0.90f

    fun normalize(blocks: List<SettleoraOcrBlock>): List<SettleoraOcrBlock> {
        val remaining = blocks.sortedBy(::topY)
        val ordered = mutableListOf<SettleoraOcrBlock>()
        var index = 0
        var rowIndex = 0
        while (index < remaining.size) {
            val row = mutableListOf<SettleoraOcrBlock>()
            while (index < remaining.size && (row.isEmpty() || sameRow(row, remaining[index]))) {
                row += remaining[index++]
            }
            val rightToLeft = isPredominantlyRightToLeft(row)
            val rowBlocks = if (rightToLeft) {
                row.sortedByDescending(::leftX)
            } else {
                row.sortedBy(::leftX)
            }
            ordered += rowBlocks.map { it.copy(row = rowIndex) }
            rowIndex++
        }
        return ordered.mapIndexed { order, block -> block.copy(order = order) }
    }

    fun textDirection(text: String): String {
        val counts = strongDirectionCounts(text)
        return if (counts.rtl > counts.ltr) "rtl" else "ltr"
    }

    private fun topY(block: SettleoraOcrBlock): Float = block.points.minOf { it.y }
    private fun bottomY(block: SettleoraOcrBlock): Float = block.points.maxOf { it.y }
    private fun leftX(block: SettleoraOcrBlock): Float = block.points.minOf { it.x }

    private fun sameRow(row: List<SettleoraOcrBlock>, second: SettleoraOcrBlock): Boolean {
        val first = row.last()
        val firstHeight = (bottomY(first) - topY(first)).coerceAtLeast(1f)
        val secondHeight = (bottomY(second) - topY(second)).coerceAtLeast(1f)
        val secondCenter = centerY(second)
        val adjacent = kotlin.math.abs(centerY(first) - secondCenter) <=
            minOf(firstHeight, secondHeight) * MAX_CENTER_DISTANCE_RATIO
        if (!adjacent) return false

        val centers = row.map(::centerY) + secondCenter
        val minimumHeight = minOf(row.minOf(::height), secondHeight)
        return centers.max() - centers.min() <= minimumHeight * MAX_ROW_CENTER_SPAN_RATIO
    }

    private fun height(block: SettleoraOcrBlock): Float =
        (bottomY(block) - topY(block)).coerceAtLeast(1f)

    private fun centerY(block: SettleoraOcrBlock): Float = topY(block) + height(block) / 2f

    private fun isPredominantlyRightToLeft(row: List<SettleoraOcrBlock>): Boolean {
        val counts = row.map { rowDirectionCounts(it.text) }
            .fold(StrongDirectionCounts()) { total, next -> total + next }
        return counts.rtl > counts.ltr
    }

    private fun rowDirectionCounts(text: String): StrongDirectionCounts {
        val normalized = text.trim()
        if (ISO_CURRENCY_AMOUNT.matches(normalized)) return StrongDirectionCounts()
        return strongDirectionCounts(text)
    }

    private fun strongDirectionCounts(text: String): StrongDirectionCounts {
        var counts = StrongDirectionCounts()
        text.codePoints().forEach { codePoint ->
            counts = when (Character.getDirectionality(codePoint)) {
                Character.DIRECTIONALITY_LEFT_TO_RIGHT -> counts.copy(ltr = counts.ltr + 1)
                Character.DIRECTIONALITY_RIGHT_TO_LEFT,
                Character.DIRECTIONALITY_RIGHT_TO_LEFT_ARABIC,
                -> counts.copy(rtl = counts.rtl + 1)
                else -> counts
            }
        }
        return counts
    }

    private data class StrongDirectionCounts(val ltr: Int = 0, val rtl: Int = 0) {
        operator fun plus(other: StrongDirectionCounts) =
            StrongDirectionCounts(ltr = ltr + other.ltr, rtl = rtl + other.rtl)
    }

    private val ISO_CURRENCY_AMOUNT = Regex(
        """^[A-Za-z]{3}\s*[:=]?\s*-?\d+(?:[.,'’]\d+)*$""",
    )
}
