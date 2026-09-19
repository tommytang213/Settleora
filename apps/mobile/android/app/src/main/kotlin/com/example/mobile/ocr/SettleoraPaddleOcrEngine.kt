package com.example.mobile.ocr

import android.content.Context
import android.graphics.BitmapFactory
import com.paddle.ocr.EngineConfig
import com.paddle.ocr.PaddleOCRConfig
import com.paddle.ocr.engine.DetectionEngine
import com.paddle.ocr.engine.ORTSessionManager
import com.paddle.ocr.model.ModelConfig
import com.paddle.ocr.model.OCRError
import com.paddle.ocr.postprocess.BoxSorter
import com.paddle.ocr.postprocess.QuadTextCrop
import com.paddle.ocr.preprocess.RecPreprocessor
import com.paddle.ocr.util.BitmapUtils
import com.paddle.ocr.util.OpenCVUtils
import org.opencv.core.Core
import org.opencv.core.Mat

/**
 * Settleora's Android PaddleOCR/ONNX Runtime boundary.
 *
 * Detection runs once. The always-available common recognizer routes strong
 * common-script lines directly; only ambiguous lines receive a bounded pass
 * through the five Global Core specialists. A fixed calibrated selector then
 * chooses the compatible result without using phone locale.
 */
class SettleoraPaddleOcrEngine(context: Context) {
    private val appContext = context.applicationContext
    private val catalog = MobileOcrModelCatalog.load(appContext)
    private val config = settleoraPaddleOcrConfig()
    private val sessions = ORTSessionManager(appContext, EngineConfig())
    private val detector: DetectionEngine
    private val packs: List<RecognizerPack>

    val coldLoadTimeMs: Long
        get() = sessions.coldLoadTimeMs

    init {
        if (!OpenCVUtils.init(appContext)) {
            throw OCRError.ModelLoadFailed("opencv", IllegalStateException("OpenCV unavailable"))
        }

        val configuredPacks = catalog.recognizers.map { spec ->
            RecognizerPack(
                spec = spec,
                characters = ModelConfig.parse(appContext, spec.configAssetPath).characterList,
            )
        }
        try {
            sessions.loadModels(
                catalog.detection.modelAssetPath,
                configuredPacks.associate { it.spec.modelPackId to it.spec.modelAssetPath },
            )
        } catch (error: Throwable) {
            sessions.release()
            throw error
        }
        packs = configuredPacks
        detector = DetectionEngine(sessions, config)
    }

    fun recognize(imageBytes: ByteArray): SettleoraOcrRunResult {
        val sampleSize = validateInputBounds(imageBytes)
        val source = BitmapUtils.imdecodeBGR(imageBytes, sampleSize)
        if (source.empty()) {
            source.release()
            throw OCRError.InvalidImage()
        }
        if (!ReceiptOcrInputLimits.acceptsDimensions(source.cols(), source.rows())) {
            source.release()
            throw OCRError.ImageTooLarge()
        }

        val totalStart = System.currentTimeMillis()
        val sourceWidth = source.cols()
        val sourceHeight = source.rows()
        var sourceNeedsRelease = true
        val crops = mutableListOf<Mat>()
        return try {
            val detection = detector.detect(source)
            val sortedBoxes = BoxSorter.sortInReadingOrder(detection.boxes)
            if (!ReceiptOcrInputLimits.acceptsDetectedLineCount(sortedBoxes.size)) {
                throw OCRError.TooManyTextLines()
            }
            val blocks = mutableListOf<SettleoraOcrBlock>()
            var recognitionTimeMs = 0L

            val validBoxes = mutableListOf<Pair<Int, com.paddle.ocr.model.OCRBox>>()
            try {
                for ((order, box) in sortedBoxes.withIndex()) {
                    val fullResolutionCrop = QuadTextCrop.crop(source, box)
                    if (fullResolutionCrop.empty()) {
                        fullResolutionCrop.release()
                    } else {
                        val crop = try {
                            RecPreprocessor.resizeForRecognition(fullResolutionCrop)
                        } finally {
                            fullResolutionCrop.release()
                        }
                        validBoxes += order to box
                        crops += crop
                    }
                }
            } finally {
                source.release()
                sourceNeedsRelease = false
            }
            if (crops.isNotEmpty()) {
                val candidatesByLine = List(crops.size) { mutableListOf<ScriptCandidate>() }
                fun batchesFor(sourceCrops: List<Mat>, indices: Iterable<Int>) = indices
                    .groupBy { index -> recognitionBatchCapacity(sourceCrops[index]) }
                    .flatMap { (capacity, indices) ->
                        indices.sortedBy { index ->
                            sourceCrops[index].cols().toDouble() / sourceCrops[index].rows()
                        }
                            .chunked(capacity)
                    }

                fun recognizeBatch(
                    pack: RecognizerPack,
                    sourceCrops: List<Mat>,
                    targetCandidates: List<MutableList<ScriptCandidate>>,
                    batchIndices: List<Int>,
                ) {
                    val batchStart = System.currentTimeMillis()
                    val input = RecPreprocessor.preprocessBatch(
                        batchIndices.map { index -> sourceCrops[index] },
                    )
                    val decoded = sessions.runRecognitionDecoded(
                        pack.spec.modelPackId,
                        input.tensorData,
                        input.shape,
                        pack.characters,
                    )
                    recognitionTimeMs += System.currentTimeMillis() - batchStart
                    check(decoded.size == batchIndices.size) {
                        "Recognition batch size mismatch"
                    }
                    decoded.forEachIndexed { batchIndex, value ->
                        val lineIndex = batchIndices[batchIndex]
                        targetCandidates[lineIndex] += ScriptCandidate(
                            text = RecognizedTextNormalizer.normalize(
                                value.first.trim(),
                                pack.spec,
                            ),
                            confidence = value.second,
                            pack = pack.spec,
                        )
                    }
                }

                val commonPack = packs.singleOrNull { pack ->
                    ScriptEvidence.COMMON in pack.spec.acceptedScripts
                } ?: error("Exactly one common recognition pack is required")
                for (batchIndices in batchesFor(crops, crops.indices)) {
                    recognizeBatch(commonPack, crops, candidatesByLine, batchIndices)
                }

                val rotatedCrops = crops.map { crop ->
                    Mat().also { rotated -> Core.rotate(crop, rotated, Core.ROTATE_180) }
                }
                val rotatedCandidatesByLine = List(crops.size) {
                    mutableListOf<ScriptCandidate>()
                }
                try {
                    for (batchIndices in batchesFor(rotatedCrops, rotatedCrops.indices)) {
                        recognizeBatch(
                            commonPack,
                            rotatedCrops,
                            rotatedCandidatesByLine,
                            batchIndices,
                        )
                    }
                    // Orientation must not depend on the common recognizer for
                    // scripts that recognizer cannot read. Probe the bounded,
                    // catalog-pinned specialist set in both orientations before
                    // choosing the document direction.
                    for (pack in packs) {
                        if (pack === commonPack) continue
                        for (batchIndices in batchesFor(crops, crops.indices)) {
                            recognizeBatch(pack, crops, candidatesByLine, batchIndices)
                        }
                        for (batchIndices in batchesFor(rotatedCrops, rotatedCrops.indices)) {
                            recognizeBatch(
                                pack,
                                rotatedCrops,
                                rotatedCandidatesByLine,
                                batchIndices,
                            )
                        }
                    }
                    val uprightOrientationCandidates = candidatesByLine.map { candidates ->
                        ScriptRouteSelector.select(candidates) ?: candidates.first()
                    }
                    val rotatedOrientationCandidates = rotatedCandidatesByLine.map { candidates ->
                        ScriptRouteSelector.select(candidates) ?: candidates.first()
                    }
                    val reverseRecognition = ReceiptOrientationSelector.shouldRotate180(
                        uprightCandidates = uprightOrientationCandidates,
                        rotatedCandidates = rotatedOrientationCandidates,
                    )
                    if (reverseRecognition) {
                        crops.indices.forEach { index ->
                            crops[index].release()
                            crops[index] = rotatedCrops[index]
                            candidatesByLine[index].clear()
                            candidatesByLine[index] += rotatedCandidatesByLine[index]
                        }
                    }
                    val documentOrientation = ReceiptDocumentOrientation.select(
                        lineDimensions = validBoxes.map { (_, box) ->
                            val xs = box.points.map { it.x }
                            val ys = box.points.map { it.y }
                            (xs.maxOrNull()!! - xs.minOrNull()!!) to
                                (ys.maxOrNull()!! - ys.minOrNull()!!)
                        },
                        reverseRecognition = reverseRecognition,
                    )

                    candidatesByLine.forEachIndexed { index, candidates ->
                        val accepted = ScriptRouteSelector.select(candidates)
                        if (accepted != null && accepted.confidence >= config.recScoreThresh) {
                            val (order, box) = validBoxes[index]
                            blocks += SettleoraOcrBlock(
                                text = accepted.text,
                                confidence = accepted.confidence,
                                modelPackId = accepted.pack.modelPackId,
                                modelVersion = accepted.pack.modelVersion,
                                textDirection = ReceiptBlockOrder.textDirection(accepted.text),
                                order = order,
                                points = box.points.map { point ->
                                    documentOrientation.transform(
                                        SettleoraOcrPoint(point.x, point.y),
                                        sourceWidth,
                                        sourceHeight,
                                    )
                                },
                            )
                        }
                    }
                } finally {
                    rotatedCrops.forEachIndexed { index, rotated ->
                        if (rotated !== crops[index]) rotated.release()
                    }
                }
            }

            SettleoraOcrRunResult(
                blocks = ReceiptBlockOrder.normalize(blocks),
                detectionModelPackId = catalog.detection.modelPackId,
                detectionModelVersion = catalog.detection.modelVersion,
                runtime = RUNTIME_IDENTITY,
                coldLoadTimeMs = sessions.coldLoadTimeMs,
                detectionTimeMs = detection.timeMs,
                recognitionTimeMs = recognitionTimeMs,
                totalTimeMs = System.currentTimeMillis() - totalStart,
            )
        } finally {
            crops.forEach { it.release() }
            if (sourceNeedsRelease) source.release()
        }
    }

    fun release() = sessions.release()

    private fun validateInputBounds(imageBytes: ByteArray): Int {
        if (imageBytes.isEmpty()) throw OCRError.InvalidImage()
        if (!ReceiptOcrInputLimits.acceptsEncodedSize(imageBytes.size)) {
            throw OCRError.ImageTooLarge()
        }

        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.size, bounds)
        val width = bounds.outWidth
        val height = bounds.outHeight
        if (width <= 0 || height <= 0) throw OCRError.InvalidImage()
        val sampleSize = ReceiptOcrInputLimits.sampleSizeFor(width, height)
        if (sampleSize == null) {
            throw OCRError.ImageTooLarge()
        }
        return sampleSize
    }

    private fun recognitionBatchCapacity(crop: Mat): Int {
        val normalizedWidth = kotlin.math.ceil(48.0 * crop.cols() / crop.rows())
            .toInt()
            .coerceAtMost(3200)
        return when {
            normalizedWidth > 1280 -> 1
            normalizedWidth > 640 -> minOf(2, config.recBatchSize)
            else -> config.recBatchSize
        }
    }

    private data class RecognizerPack(
        val spec: RecognizerSpec,
        val characters: List<String>,
    )

    companion object {
        const val CHANNEL_NAME = "com.settleora.mobile/receipt_ocr"
        const val METHOD_RECOGNIZE = "recognize"
        const val RUNTIME_IDENTITY = "onnxruntime-android:1.21.1:cpu"

    }
}

internal fun settleoraPaddleOcrConfig() = PaddleOCRConfig(
    detMaxSideLimit = 1600,
    detThresh = 0.2f,
    detBoxThresh = 0.45f,
    detUnclipRatio = 1.4f,
    detMaxCandidates = 3000,
    recScoreThresh = 0.1f,
    recBatchSize = 4,
)

data class SettleoraOcrRunResult(
    val blocks: List<SettleoraOcrBlock>,
    val detectionModelPackId: String,
    val detectionModelVersion: String,
    val runtime: String,
    val coldLoadTimeMs: Long,
    val detectionTimeMs: Long,
    val recognitionTimeMs: Long,
    val totalTimeMs: Long,
) {
    fun toChannelValue(): Map<String, Any> = mapOf(
        "blocks" to blocks.map { it.toChannelValue() },
        "detectionModelPackId" to detectionModelPackId,
        "detectionModelVersion" to detectionModelVersion,
        "runtime" to runtime,
        "coldLoadTimeMs" to coldLoadTimeMs,
        "detectionTimeMs" to detectionTimeMs,
        "recognitionTimeMs" to recognitionTimeMs,
        "totalTimeMs" to totalTimeMs,
    )
}

data class SettleoraOcrBlock(
    val text: String,
    val confidence: Float,
    val modelPackId: String,
    val modelVersion: String,
    val textDirection: String,
    val order: Int,
    val row: Int = 0,
    val points: List<SettleoraOcrPoint>,
) {
    fun toChannelValue(): Map<String, Any> = mapOf(
        "text" to text,
        "confidence" to confidence.toDouble(),
        "modelPackId" to modelPackId,
        "modelVersion" to modelVersion,
        "textDirection" to textDirection,
        "order" to order,
        "row" to row,
        "points" to points.map { it.toChannelValue() },
    )
}

data class SettleoraOcrPoint(val x: Float, val y: Float) {
    fun toChannelValue(): Map<String, Double> = mapOf(
        "x" to x.toDouble(),
        "y" to y.toDouble(),
    )
}
