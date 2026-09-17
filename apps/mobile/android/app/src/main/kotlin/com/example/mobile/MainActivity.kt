package com.example.mobile

import com.example.mobile.ocr.SettleoraPaddleOcrEngine
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class MainActivity : FlutterActivity() {
    private val ocrExecutor: ExecutorService = Executors.newSingleThreadExecutor()

    @Volatile
    private var destroyed = false
    private var ocrEngine: SettleoraPaddleOcrEngine? = null
    private var ocrChannel: MethodChannel? = null

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

            ocrExecutor.execute {
                if (destroyed) return@execute
                try {
                    val engine = ocrEngine ?: SettleoraPaddleOcrEngine(applicationContext)
                        .also { ocrEngine = it }
                    val channelValue = engine.recognize(imageBytes).toChannelValue()
                    runOnUiThread {
                        if (!destroyed) result.success(channelValue)
                    }
                } catch (_: Throwable) {
                    // Receipt bytes/text and local paths must never enter routine logs or errors.
                    runOnUiThread {
                        if (!destroyed) {
                            result.error("ocr_failed", "On-device receipt OCR failed", null)
                        }
                    }
                }
            }
        }
    }

    override fun onDestroy() {
        destroyed = true
        ocrChannel?.setMethodCallHandler(null)
        ocrChannel = null
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
