package com.example.mobile

import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

internal object ReceiptOcrBuildVariantHooks {
    fun configure(
        activity: MainActivity,
        flutterEngine: FlutterEngine,
    ): MethodChannel? {
        // Profile variants share the production no-acceptance contract.
        return null
    }
}
