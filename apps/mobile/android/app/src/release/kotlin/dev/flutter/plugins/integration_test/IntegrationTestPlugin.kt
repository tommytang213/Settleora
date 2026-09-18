package dev.flutter.plugins.integration_test

import io.flutter.embedding.engine.plugins.FlutterPlugin

/**
 * Release-only no-op for Flutter's generated registrant.
 *
 * The real IntegrationTestPlugin is a debug/dev dependency used by the native
 * acceptance harness. Flutter still emits its registration into the shared
 * generated Java source after a debug build, while correctly excluding the
 * plugin dependency from the release classpath. This narrow release source-set
 * shim keeps production builds deterministic without packaging test behavior.
 */
class IntegrationTestPlugin : FlutterPlugin {
    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) = Unit

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) = Unit
}
