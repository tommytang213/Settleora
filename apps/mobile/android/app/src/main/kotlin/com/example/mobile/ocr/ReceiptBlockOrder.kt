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
        var rtlCount = 0
        var ltrCount = 0
        row.forEach { block ->
            block.text.codePoints().forEach { codePoint ->
                when (Character.UnicodeScript.of(codePoint)) {
                    Character.UnicodeScript.ARABIC,
                    Character.UnicodeScript.HEBREW,
                    -> rtlCount++
                    else -> if (Character.isLetter(codePoint)) ltrCount++
                }
            }
        }
        return rtlCount > ltrCount
    }
}
