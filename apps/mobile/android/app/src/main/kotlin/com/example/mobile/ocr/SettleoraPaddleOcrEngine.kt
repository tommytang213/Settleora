package com.example.mobile.ocr

import android.content.Context
import com.paddle.ocr.EngineConfig
import com.paddle.ocr.PaddleOCRConfig
import com.paddle.ocr.engine.DetectionEngine
import com.paddle.ocr.engine.ORTSessionManager
import com.paddle.ocr.model.ModelConfig
import com.paddle.ocr.model.OCRError
import com.paddle.ocr.postprocess.BoxSorter
import com.paddle.ocr.postprocess.CTCDecoder
import com.paddle.ocr.postprocess.QuadTextCrop
import com.paddle.ocr.preprocess.RecPreprocessor
import com.paddle.ocr.util.BitmapUtils
import com.paddle.ocr.util.OpenCVUtils

/**
 * Settleora's Android PaddleOCR/ONNX Runtime boundary.
 *
 * Detection runs once. Every detected line is evaluated against the bundled
 * Global Core recognizers, then selected using confidence plus Unicode-script
 * evidence. That keeps mixed-script routing independent from phone locale and
 * avoids requiring a recognizer that is not installed to choose a route.
 */
class SettleoraPaddleOcrEngine(context: Context) {
    private val appContext = context.applicationContext
    private val config = PaddleOCRConfig(recScoreThresh = 0.1f)
    private val sessions = ORTSessionManager(appContext, EngineConfig())
    private val detector: DetectionEngine
    private val packs: List<RecognizerPack>

    val coldLoadTimeMs: Long
        get() = sessions.coldLoadTimeMs

    init {
        if (!OpenCVUtils.init(appContext)) {
            throw OCRError.ModelLoadFailed("opencv", IllegalStateException("OpenCV unavailable"))
        }

        val configuredPacks = RECOGNIZER_ASSETS.map { spec ->
            RecognizerPack(
                spec = spec,
                characters = ModelConfig.parse(appContext, spec.configAssetPath).characterList,
            )
        }
        try {
            sessions.loadModels(
                DETECTION_MODEL_ASSET,
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
        if (imageBytes.isEmpty()) throw OCRError.InvalidImage()
        val source = BitmapUtils.imdecodeBGR(imageBytes)
        if (source.empty()) {
            source.release()
            throw OCRError.InvalidImage()
        }

        val totalStart = System.currentTimeMillis()
        return try {
            val detection = detector.detect(source)
            val sortedBoxes = BoxSorter.sortInReadingOrder(detection.boxes)
            val blocks = mutableListOf<SettleoraOcrBlock>()
            var recognitionTimeMs = 0L

            val validBoxes = mutableListOf<Pair<Int, com.paddle.ocr.model.OCRBox>>()
            val crops = mutableListOf<org.opencv.core.Mat>()
            for ((order, box) in sortedBoxes.withIndex()) {
                val crop = QuadTextCrop.crop(source, box)
                if (crop.empty()) {
                    crop.release()
                } else {
                    validBoxes += order to box
                    crops += crop
                }
            }
            try {
                if (crops.isNotEmpty()) {
                    val preprocessStart = System.currentTimeMillis()
                    val input = RecPreprocessor.preprocessBatch(crops)
                    recognitionTimeMs += System.currentTimeMillis() - preprocessStart
                    val candidatesByLine = List(crops.size) { mutableListOf<ScriptCandidate>() }

                    for (pack in packs) {
                        val inferenceStart = System.currentTimeMillis()
                        val (output, shape) = sessions.runRecognition(
                            pack.spec.modelPackId,
                            input.tensorData,
                            input.shape,
                        )
                        val decoded = CTCDecoder.decode(output, shape, pack.characters)
                        recognitionTimeMs += System.currentTimeMillis() - inferenceStart
                        check(decoded.size == crops.size) { "Recognition batch size mismatch" }
                        decoded.forEachIndexed { index, value ->
                            candidatesByLine[index] += ScriptCandidate(
                                text = RecognizedTextNormalizer.normalize(
                                    value.first.trim(),
                                    pack.spec,
                                ),
                                confidence = value.second,
                                pack = pack.spec,
                            )
                        }
                    }

                    candidatesByLine.forEachIndexed { index, candidates ->
                        val accepted = ScriptRouteSelector.select(candidates)
                        if (accepted != null && accepted.confidence >= config.recScoreThresh) {
                            val (order, box) = validBoxes[index]
                            blocks += SettleoraOcrBlock(
                                text = accepted.text,
                                confidence = accepted.confidence,
                                modelPackId = accepted.pack.modelPackId,
                                modelVersion = accepted.pack.modelVersion,
                                order = order,
                                points = box.points.map { point ->
                                    SettleoraOcrPoint(point.x, point.y)
                                },
                            )
                        }
                    }
                }
            } finally {
                crops.forEach { it.release() }
            }

            SettleoraOcrRunResult(
                blocks = blocks,
                detectionModelPackId = DETECTION_MODEL_PACK_ID,
                detectionModelVersion = DETECTION_MODEL_VERSION,
                runtime = RUNTIME_IDENTITY,
                coldLoadTimeMs = sessions.coldLoadTimeMs,
                detectionTimeMs = detection.timeMs,
                recognitionTimeMs = recognitionTimeMs,
                totalTimeMs = System.currentTimeMillis() - totalStart,
            )
        } finally {
            source.release()
        }
    }

    fun release() = sessions.release()

    private data class RecognizerPack(
        val spec: RecognizerSpec,
        val characters: List<String>,
    )

    companion object {
        const val CHANNEL_NAME = "com.settleora.mobile/receipt_ocr"
        const val METHOD_RECOGNIZE = "recognize"
        const val RUNTIME_IDENTITY = "onnxruntime-android:1.21.1:cpu"

        private const val ASSET_ROOT = "flutter_assets/assets/receipt_ocr_models"
        private const val DETECTION_MODEL_PACK_ID = "paddleocr.ppocrv6.small.det"
        private const val DETECTION_MODEL_VERSION = "28fe5895c24fd108c19eb3e8479f4ab385fbfc62"
        private const val DETECTION_MODEL_ASSET = "$ASSET_ROOT/ppocrv6-small-det/inference.onnx"

        private val RECOGNIZER_ASSETS = listOf(
            RecognizerSpec(
                "paddleocr.ppocrv6.small.rec.common",
                "b8f84f0b80c529de40b4fbb3544b84fa7233a513",
                "$ASSET_ROOT/ppocrv6-small-rec/inference.onnx",
                "$ASSET_ROOT/ppocrv6-small-rec/inference.yml",
                setOf(ScriptEvidence.COMMON),
            ),
            RecognizerSpec(
                "paddleocr.ppocrv5.mobile.rec.arabic",
                "14aaedcd75825982689ecf5cd64ab33ee083215a",
                "$ASSET_ROOT/ppocrv5-arabic-rec/inference.onnx",
                "$ASSET_ROOT/ppocrv5-arabic-rec/inference.yml",
                setOf(ScriptEvidence.ARABIC),
            ),
            RecognizerSpec(
                "paddleocr.ppocrv5.mobile.rec.cyrillic",
                "2cef88145434beb8afa9dd82d77d799eb1ad7b29",
                "$ASSET_ROOT/ppocrv5-cyrillic-rec/inference.onnx",
                "$ASSET_ROOT/ppocrv5-cyrillic-rec/inference.yml",
                setOf(ScriptEvidence.CYRILLIC),
            ),
            RecognizerSpec(
                "paddleocr.ppocrv5.mobile.rec.devanagari",
                "251aec19e36739540d35e2cc943f6aa7503b98e5",
                "$ASSET_ROOT/ppocrv5-devanagari-rec/inference.onnx",
                "$ASSET_ROOT/ppocrv5-devanagari-rec/inference.yml",
                setOf(ScriptEvidence.DEVANAGARI),
            ),
            RecognizerSpec(
                "paddleocr.ppocrv5.mobile.rec.korean",
                "5c6f574b8e2230adf4287b33e736d71b9fabd28e",
                "$ASSET_ROOT/ppocrv5-korean-rec/inference.onnx",
                "$ASSET_ROOT/ppocrv5-korean-rec/inference.yml",
                setOf(ScriptEvidence.KOREAN),
            ),
            RecognizerSpec(
                "paddleocr.ppocrv5.mobile.rec.thai",
                "1d4adbbafb1034a2fd6618498575b81ea7b69f69",
                "$ASSET_ROOT/ppocrv5-thai-rec/inference.onnx",
                "$ASSET_ROOT/ppocrv5-thai-rec/inference.yml",
                setOf(ScriptEvidence.THAI),
            ),
        )
    }
}

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
    val order: Int,
    val points: List<SettleoraOcrPoint>,
) {
    fun toChannelValue(): Map<String, Any> = mapOf(
        "text" to text,
        "confidence" to confidence.toDouble(),
        "modelPackId" to modelPackId,
        "modelVersion" to modelVersion,
        "order" to order,
        "points" to points.map { it.toChannelValue() },
    )
}

data class SettleoraOcrPoint(val x: Float, val y: Float) {
    fun toChannelValue(): Map<String, Double> = mapOf(
        "x" to x.toDouble(),
        "y" to y.toDouble(),
    )
}
