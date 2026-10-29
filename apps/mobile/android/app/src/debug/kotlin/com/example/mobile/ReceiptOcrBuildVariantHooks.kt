package com.example.mobile

import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

internal object ReceiptOcrBuildVariantHooks {
    private const val ACCEPTANCE_CHANNEL = "com.settleora.mobile/receipt_ocr_acceptance"
    private val safeFixturePath = Regex("^[A-Za-z0-9_./-]+$")

    fun configure(activity: MainActivity, flutterEngine: FlutterEngine): MethodChannel =
        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            ACCEPTANCE_CHANNEL,
        ).also { acceptance ->
            acceptance.setMethodCallHandler { call, result ->
                if (call.method == "loadModelCatalog") {
                    try {
                        result.success(
                            activity.assets.open("receipt_ocr_models/catalog.json").use { it.readBytes() },
                        )
                    } catch (_: Throwable) {
                        result.error(
                            "catalog_unavailable",
                            "Packaged OCR model catalog unavailable",
                            null,
                        )
                    }
                    return@setMethodCallHandler
                }
                if (call.method != "loadFixture") {
                    result.notImplemented()
                    return@setMethodCallHandler
                }
                val path = call.argument<String>("path")
                if (
                    path == null ||
                    path.startsWith('/') ||
                    path.contains("..") ||
                    !safeFixturePath.matches(path)
                ) {
                    result.error("invalid_fixture", "Invalid OCR acceptance fixture", null)
                    return@setMethodCallHandler
                }
                try {
                    result.success(activity.assets.open(path).use { it.readBytes() })
                } catch (_: Throwable) {
                    result.error("fixture_unavailable", "OCR acceptance fixture unavailable", null)
                }
            }
        }
}
