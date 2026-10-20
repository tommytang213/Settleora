package com.example.mobile

import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

internal object ReceiptOcrBuildVariantHooks {
    fun configure(
        activity: MainActivity,
        flutterEngine: FlutterEngine,
    ): MethodChannel? {
        // Production variants intentionally expose no native acceptance channel.
        return null
    }
}
