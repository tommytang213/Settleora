package com.example.mobile.ocr

/** The document-space transform needed to make detected receipt rows upright. */
internal enum class ReceiptDocumentOrientation {
    UPRIGHT,
    CLOCKWISE_90,
    UPSIDE_DOWN,
    COUNTERCLOCKWISE_90;

    fun transform(point: SettleoraOcrPoint, sourceWidth: Int, sourceHeight: Int): SettleoraOcrPoint =
        when (this) {
            UPRIGHT -> point
            CLOCKWISE_90 -> SettleoraOcrPoint(
                (sourceHeight - 1f - point.y).coerceIn(0f, sourceHeight - 1f),
                point.x.coerceIn(0f, sourceWidth - 1f),
            )
            UPSIDE_DOWN -> SettleoraOcrPoint(
                (sourceWidth - 1f - point.x).coerceIn(0f, sourceWidth - 1f),
                (sourceHeight - 1f - point.y).coerceIn(0f, sourceHeight - 1f),
            )
            COUNTERCLOCKWISE_90 -> SettleoraOcrPoint(
                point.y.coerceIn(0f, sourceHeight - 1f),
                (sourceWidth - 1f - point.x).coerceIn(0f, sourceWidth - 1f),
            )
        }

    companion object {
        private const val VERTICAL_LINE_RATIO = 1.5f

        fun select(
            lineDimensions: List<Pair<Float, Float>>,
            reverseRecognition: Boolean,
        ): ReceiptDocumentOrientation {
            val verticalLines = lineDimensions.count { (rawWidth, rawHeight) ->
                val width = rawWidth.coerceAtLeast(1f)
                val height = rawHeight.coerceAtLeast(1f)
                height / width >= VERTICAL_LINE_RATIO
            }
            val horizontalLines = lineDimensions.size - verticalLines
            val sideways = verticalLines > horizontalLines
            return when {
                sideways && reverseRecognition -> CLOCKWISE_90
                sideways -> COUNTERCLOCKWISE_90
                reverseRecognition -> UPSIDE_DOWN
                else -> UPRIGHT
            }
        }
    }
}
