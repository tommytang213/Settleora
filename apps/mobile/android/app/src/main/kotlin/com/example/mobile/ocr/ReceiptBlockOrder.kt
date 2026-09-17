package com.example.mobile.ocr

internal object ReceiptBlockOrder {
    private const val MIN_VERTICAL_OVERLAP_RATIO = 0.35f
    private const val MAX_CENTER_DISTANCE_RATIO = 0.50f

    fun normalize(blocks: List<SettleoraOcrBlock>): List<SettleoraOcrBlock> {
        val remaining = blocks.sortedBy(::topY)
        val ordered = mutableListOf<SettleoraOcrBlock>()
        var index = 0
        while (index < remaining.size) {
            val rowAnchor = remaining[index]
            val row = mutableListOf<SettleoraOcrBlock>()
            while (index < remaining.size && sameRow(rowAnchor, remaining[index])) {
                row += remaining[index++]
            }
            val rightToLeft = row.any { it.textDirection == "rtl" }
            ordered += if (rightToLeft) row.sortedByDescending(::leftX) else row.sortedBy(::leftX)
        }
        return ordered.mapIndexed { order, block -> block.copy(order = order) }
    }

    private fun topY(block: SettleoraOcrBlock): Float = block.points.minOf { it.y }
    private fun bottomY(block: SettleoraOcrBlock): Float = block.points.maxOf { it.y }
    private fun leftX(block: SettleoraOcrBlock): Float = block.points.minOf { it.x }

    private fun sameRow(first: SettleoraOcrBlock, second: SettleoraOcrBlock): Boolean {
        val firstHeight = (bottomY(first) - topY(first)).coerceAtLeast(1f)
        val secondHeight = (bottomY(second) - topY(second)).coerceAtLeast(1f)
        val overlap = minOf(bottomY(first), bottomY(second)) - maxOf(topY(first), topY(second))
        if (overlap >= minOf(firstHeight, secondHeight) * MIN_VERTICAL_OVERLAP_RATIO) return true
        val firstCenter = topY(first) + firstHeight / 2f
        val secondCenter = topY(second) + secondHeight / 2f
        return kotlin.math.abs(firstCenter - secondCenter) <=
            maxOf(firstHeight, secondHeight) * MAX_CENTER_DISTANCE_RATIO
    }
}
