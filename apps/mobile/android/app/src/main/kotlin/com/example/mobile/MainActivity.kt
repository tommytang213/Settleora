package com.example.mobile

import com.example.mobile.ocr.SettleoraPaddleOcrEngine
import com.example.mobile.ocr.boundedReceiptOcrFailureCode
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicBoolean

class MainActivity : FlutterActivity() {
    private val ocrExecutor: ExecutorService = Executors.newSingleThreadExecutor()
    private val ocrInFlight = AtomicBoolean(false)

    @Volatile
    private var destroyed = false
    private var ocrEngine: SettleoraPaddleOcrEngine? = null
    private var ocrChannel: MethodChannel? = null
    private var acceptanceChannel: MethodChannel? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        val channel = MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            SettleoraPaddleOcrEngine.CHANNEL_NAME,
        )
        ocrChannel = channel
        channel.setMethodCallHandler { call, result ->
            if (call.method != SettleoraPaddleOcrEngine.METHOD_RECOGNIZE) {
                result.notImplemented()
                return@setMethodCallHandler
            }

            val imageBytes = call.argument<ByteArray>("imageBytes")
            if (imageBytes == null || imageBytes.isEmpty()) {
                result.error("invalid_image", "Receipt image bytes are required", null)
                return@setMethodCallHandler
            }
            if (!ocrInFlight.compareAndSet(false, true)) {
                result.error("ocr_busy", "On-device receipt OCR is already running", null)
                return@setMethodCallHandler
            }

            try {
                ocrExecutor.execute {
                    try {
                        if (destroyed) return@execute
                        val engine = ocrEngine ?: SettleoraPaddleOcrEngine(applicationContext)
                            .also { ocrEngine = it }
                        val channelValue = engine.recognize(imageBytes).toChannelValue()
                        runOnUiThread {
                            if (!destroyed) result.success(channelValue)
                        }
                    } catch (error: Throwable) {
                        // Receipt bytes/text and local paths must never enter routine logs or errors.
                        runOnUiThread {
                            if (!destroyed) {
                                result.error(
                                    boundedReceiptOcrFailureCode(error),
                                    "On-device receipt OCR failed",
                                    null,
                                )
                            }
                        }
                    } finally {
                        ocrInFlight.set(false)
                    }
                }
            } catch (_: RejectedExecutionException) {
                ocrInFlight.set(false)
                result.error("ocr_unavailable", "On-device receipt OCR is unavailable", null)
            }
        }

        acceptanceChannel = ReceiptOcrBuildVariantHooks.configure(this, flutterEngine)
    }

    override fun onDestroy() {
        destroyed = true
        ocrChannel?.setMethodCallHandler(null)
        ocrChannel = null
        acceptanceChannel?.setMethodCallHandler(null)
        acceptanceChannel = null
        // Engine creation, inference, and release stay serialized on one thread.
        // shutdown() drains an in-flight native call before the queued release.
        ocrExecutor.execute {
            ocrEngine?.release()
            ocrEngine = null
        }
        ocrExecutor.shutdown()
        super.onDestroy()
    }
}
