package com.example.mobile.ocr

internal object ReceiptBlockOrder {
    private const val ROW_THRESHOLD_Y = 10f

    fun normalize(blocks: List<SettleoraOcrBlock>): List<SettleoraOcrBlock> {
        val remaining = blocks.sortedBy(::topY)
        val ordered = mutableListOf<SettleoraOcrBlock>()
        var index = 0
        while (index < remaining.size) {
            val rowTop = topY(remaining[index])
            val row = mutableListOf<SettleoraOcrBlock>()
            while (index < remaining.size && kotlin.math.abs(topY(remaining[index]) - rowTop) < ROW_THRESHOLD_Y) {
                row += remaining[index++]
            }
            val rightToLeft = row.any { it.textDirection == "rtl" }
            ordered += if (rightToLeft) row.sortedByDescending(::leftX) else row.sortedBy(::leftX)
        }
        return ordered.mapIndexed { order, block -> block.copy(order = order) }
    }

    private fun topY(block: SettleoraOcrBlock): Float = block.points.minOf { it.y }
    private fun leftX(block: SettleoraOcrBlock): Float = block.points.minOf { it.x }
}
