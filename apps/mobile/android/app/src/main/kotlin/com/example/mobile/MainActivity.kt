package com.example.mobile

import com.example.mobile.ocr.SettleoraPaddleOcrEngine
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

class MainActivity : FlutterActivity() {
    private val ocrScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val ocrMutex = Mutex()
    private var ocrEngine: SettleoraPaddleOcrEngine? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            SettleoraPaddleOcrEngine.CHANNEL_NAME,
        ).setMethodCallHandler { call, result ->
            if (call.method != SettleoraPaddleOcrEngine.METHOD_RECOGNIZE) {
                result.notImplemented()
                return@setMethodCallHandler
            }

            val imageBytes = call.argument<ByteArray>("imageBytes")
            if (imageBytes == null || imageBytes.isEmpty()) {
                result.error("invalid_image", "Receipt image bytes are required", null)
                return@setMethodCallHandler
            }

            ocrScope.launch {
                try {
                    val channelValue = withContext(Dispatchers.IO) {
                        ocrMutex.withLock {
                            val engine = ocrEngine ?: SettleoraPaddleOcrEngine(applicationContext)
                                .also { ocrEngine = it }
                            engine.recognize(imageBytes).toChannelValue()
                        }
                    }
                    result.success(channelValue)
                } catch (_: Throwable) {
                    // Receipt bytes/text and local paths must never enter routine logs or errors.
                    result.error("ocr_failed", "On-device receipt OCR failed", null)
                }
            }
        }
    }

    override fun onDestroy() {
        ocrEngine?.release()
        ocrEngine = null
        ocrScope.cancel()
        super.onDestroy()
    }
}
