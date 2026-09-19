package com.example.mobile.ocr

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.paddle.ocr.preprocess.RecPreprocessor
import com.paddle.ocr.util.OpenCVUtils
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.ByteArrayOutputStream

/**
 * Real image/native provider guard for the immutable #1247 corpus.
 *
 * This layer asserts native provider output and routed model identities. The
 * executable `integration_test/receipt_ocr_real_provider_test.dart` feeds the
 * same 101 real images through this engine, the production Dart provider, and
 * the production parser, then compares every manifest preview field. Physical
 * device execution and evidence collection remain owned by #1301.
 */
@RunWith(AndroidJUnit4::class)
class ReceiptOcrCorpusInstrumentedTest {
    @Test
    fun completeManifestProducesRealOcrBlocksAndRequiredRoutes() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        val assets = instrumentation.context.assets
        val manifest = JSONObject(
            assets.open("manifest.json").bufferedReader().use { it.readText() },
        )
        val fixtures = manifest.getJSONArray("fixtures")
        assertEquals(101, fixtures.length())
        val modelCatalog = JSONObject(
            context.assets.open("receipt_ocr_models/catalog.json")
                .bufferedReader()
                .use { it.readText() },
        )
        val packVersions = modelCatalog.getJSONArray("packs").let { packs ->
            buildMap {
                for (index in 0 until packs.length()) {
                    val pack = packs.getJSONObject(index)
                    put(pack.getString("modelPackId"), pack.getString("modelVersion"))
                }
            }
        }

        val engine = SettleoraPaddleOcrEngine(context)
        val scriptsWithExactMatches = mutableSetOf<String>()
        try {
            for (index in 0 until fixtures.length()) {
                val fixture = fixtures.getJSONObject(index)
                val fixtureId = fixture.getString("id")
                val script = fixture.getString("script")
                val imageBytes = assets.open(fixture.getString("file")).use { it.readBytes() }
                val result = engine.recognize(imageBytes)

                assertTrue("$fixtureId: no OCR blocks", result.blocks.isNotEmpty())
                assertEquals(
                    "paddleocr.ppocrv6.small.det",
                    result.detectionModelPackId,
                )
                assertEquals(
                    packVersions[result.detectionModelPackId],
                    result.detectionModelVersion,
                )
                result.blocks.forEach { block ->
                    assertEquals(packVersions[block.modelPackId], block.modelVersion)
                }
                expectedPackFor(script)?.let { expectedPackId ->
                    val expectedTexts = scriptBearingExpectedTexts(
                        fixture.getJSONObject("expected"),
                        script,
                    )
                    if (expectedTexts.isEmpty()) {
                        assertTrue(
                            "$fixtureId: expected recognizer pack was not exercised",
                            result.blocks.any { block -> block.modelPackId == expectedPackId },
                        )
                    } else {
                        assertTrue(
                            "$fixtureId: expected script text was not recognized by $expectedPackId",
                            result.blocks.any { block ->
                                block.modelPackId == expectedPackId &&
                                    containsScript(block.text, script) &&
                                    expectedTexts.any { expected ->
                                        normalizeForMatch(block.text) == normalizeForMatch(expected)
                                    }
                            },
                        )
                        scriptsWithExactMatches += script
                    }
                }
            }
            assertEquals(REQUIRED_EXACT_MATCH_SCRIPTS, scriptsWithExactMatches)
        } finally {
            engine.release()
        }
    }

    @Test
    fun realReceiptRotated270ProducesCompleteNativeRowOrder() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        val assets = instrumentation.context.assets
        val sourceBytes = assets.open("english/existing_12_freshmart_grocery_en_US.jpeg")
            .use { it.readBytes() }
        val source = BitmapFactory.decodeByteArray(sourceBytes, 0, sourceBytes.size)
        val rotated = Bitmap.createBitmap(
            source,
            0,
            0,
            source.width,
            source.height,
            Matrix().apply { postRotate(270f) },
            true,
        )
        val rotatedBytes = ByteArrayOutputStream().use { output ->
            assertTrue(rotated.compress(Bitmap.CompressFormat.JPEG, 100, output))
            output.toByteArray()
        }
        source.recycle()
        rotated.recycle()

        val engine = SettleoraPaddleOcrEngine(context)
        try {
            val result = engine.recognize(rotatedBytes)
            val orderedText = result.blocks.joinToString("\n") { it.text }
            val normalized = normalizeForMatch(orderedText)

            assertTrue("270-degree receipt produced no OCR blocks", result.blocks.isNotEmpty())
            assertTrue("merchant row was not recovered", normalized.contains("FreshMart"))
            assertTrue("first item row was not recovered", normalized.contains("Bananas"))
            assertTrue("grand total row was not recovered", normalized.contains("14.47"))
            assertTrue(
                "270-degree receipt rows were not returned in document order",
                normalized.indexOf("FreshMart") < normalized.indexOf("Bananas") &&
                    normalized.indexOf("Bananas") < normalized.lastIndexOf("14.47"),
            )
        } finally {
            engine.release()
        }
    }

    @Test
    fun recognitionPreprocessingPreservesConfiguredBgrChannelOrder() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        assertTrue(OpenCVUtils.init(context))
        val crop = org.opencv.core.Mat(
            48,
            2,
            org.opencv.core.CvType.CV_8UC3,
            org.opencv.core.Scalar(10.0, 20.0, 30.0),
        )
        try {
            val result = RecPreprocessor.preprocessBatch(listOf(crop))
            val channelSize = 48 * 2
            assertEquals((10.0 / 127.5 - 1.0), result.tensorData[0].toDouble(), 0.0001)
            assertEquals((20.0 / 127.5 - 1.0), result.tensorData[channelSize].toDouble(), 0.0001)
            assertEquals((30.0 / 127.5 - 1.0), result.tensorData[channelSize * 2].toDouble(), 0.0001)
        } finally {
            crop.release()
        }
    }

    private fun expectedPackFor(script: String): String? = when (script) {
        "Arabic" -> "paddleocr.ppocrv5.mobile.rec.arabic"
        "Thai" -> "paddleocr.ppocrv5.mobile.rec.thai"
        "Cyrillic" -> "paddleocr.ppocrv5.mobile.rec.cyrillic"
        "Devanagari" -> "paddleocr.ppocrv5.mobile.rec.devanagari"
        "Korean" -> "paddleocr.ppocrv5.mobile.rec.korean"
        "Latin", "Chinese", "Japanese" -> "paddleocr.ppocrv6.small.rec.common"
        else -> null
    }

    private fun scriptBearingExpectedTexts(expected: JSONObject, script: String): List<String> {
        val values = mutableListOf<String>()
        (expected.opt("merchant") as? String)?.let(values::add)
        val items = expected.optJSONArray("items") ?: JSONArray()
        for (index in 0 until items.length()) {
            val item = items.get(index)
            values += when (item) {
                is JSONArray -> item.getString(0)
                is JSONObject -> item.getString("description")
                else -> error("Unsupported manifest item representation")
            }
        }
        return values.filter { containsScript(it, script) }
    }

    private fun containsScript(text: String, script: String): Boolean = text.codePoints().anyMatch { codePoint ->
        val unicodeScript = Character.UnicodeScript.of(codePoint)
        when (script) {
            "Arabic" -> unicodeScript == Character.UnicodeScript.ARABIC
            "Thai" -> unicodeScript == Character.UnicodeScript.THAI
            "Cyrillic" -> unicodeScript == Character.UnicodeScript.CYRILLIC
            "Devanagari" -> unicodeScript == Character.UnicodeScript.DEVANAGARI
            "Korean" -> unicodeScript == Character.UnicodeScript.HANGUL
            "Latin" -> unicodeScript == Character.UnicodeScript.LATIN
            "Chinese" -> unicodeScript == Character.UnicodeScript.HAN
            "Japanese" -> unicodeScript == Character.UnicodeScript.HAN ||
                unicodeScript == Character.UnicodeScript.HIRAGANA ||
                unicodeScript == Character.UnicodeScript.KATAKANA
            else -> false
        }
    }

    private fun normalizeForMatch(text: String): String = text
        .replace(Regex("\\s+"), " ")
        .trim()

    companion object {
        private val REQUIRED_EXACT_MATCH_SCRIPTS = setOf(
            "Arabic",
            "Chinese",
            "Cyrillic",
            "Devanagari",
            "Japanese",
            "Korean",
            "Latin",
            "Thai",
        )
    }
}
