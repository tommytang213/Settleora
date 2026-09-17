package com.example.mobile.ocr

import android.content.Context
import org.json.JSONObject

internal data class DetectionModelSpec(
    val modelPackId: String,
    val modelVersion: String,
    val modelAssetPath: String,
)

internal data class MobileOcrModelCatalog(
    val detection: DetectionModelSpec,
    val recognizers: List<RecognizerSpec>,
) {
    companion object {
        private const val ASSET_ROOT = "flutter_assets/assets/receipt_ocr_models"

        fun load(context: Context): MobileOcrModelCatalog {
            val root = JSONObject(
                context.assets.open("$ASSET_ROOT/catalog.json")
                    .bufferedReader()
                    .use { it.readText() },
            )
            val packs = root.getJSONArray("packs")
            var detection: DetectionModelSpec? = null
            val recognizers = mutableListOf<RecognizerSpec>()
            for (index in 0 until packs.length()) {
                val pack = packs.getJSONObject(index)
                val directory = pack.getString("assetDirectory")
                    .removePrefix("assets/receipt_ocr_models/")
                val modelPath = "$ASSET_ROOT/$directory/inference.onnx"
                when (pack.getString("role")) {
                    "detection" -> {
                        check(detection == null) { "Multiple OCR detection packs" }
                        detection = DetectionModelSpec(
                            modelPackId = pack.getString("modelPackId"),
                            modelVersion = pack.getString("modelVersion"),
                            modelAssetPath = modelPath,
                        )
                    }
                    "recognition" -> recognizers += RecognizerSpec(
                        modelPackId = pack.getString("modelPackId"),
                        modelVersion = pack.getString("modelVersion"),
                        modelAssetPath = modelPath,
                        configAssetPath = "$ASSET_ROOT/$directory/inference.yml",
                        acceptedScripts = scriptEvidence(pack),
                    )
                    else -> error("Unsupported OCR model role")
                }
            }
            check(recognizers.isNotEmpty()) { "OCR catalog has no recognizers" }
            return MobileOcrModelCatalog(
                detection = checkNotNull(detection) { "OCR catalog has no detector" },
                recognizers = recognizers,
            )
        }

        private fun scriptEvidence(pack: JSONObject): Set<ScriptEvidence> {
            val routes = pack.getJSONArray("routeScripts")
            val evidence = mutableSetOf<ScriptEvidence>()
            for (index in 0 until routes.length()) {
                when (routes.getString(index)) {
                    "Latin", "HanSimplified", "HanTraditional", "Japanese" ->
                        evidence += ScriptEvidence.COMMON
                    "Arabic" -> evidence += ScriptEvidence.ARABIC
                    "Cyrillic" -> evidence += ScriptEvidence.CYRILLIC
                    "Devanagari" -> evidence += ScriptEvidence.DEVANAGARI
                    "Korean" -> evidence += ScriptEvidence.KOREAN
                    "Thai" -> evidence += ScriptEvidence.THAI
                    else -> error("Unsupported OCR recognition route")
                }
            }
            check(evidence.isNotEmpty()) { "OCR recognizer has no supported scripts" }
            return evidence
        }
    }
}
