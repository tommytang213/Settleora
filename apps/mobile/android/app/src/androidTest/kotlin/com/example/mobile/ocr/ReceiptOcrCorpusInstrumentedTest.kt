package com.example.mobile.ocr

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Real image/native provider guard for the immutable #1247 corpus.
 *
 * This test deliberately asserts provider output and routed model identities;
 * the Flutter image-to-preview field diff runner remains owned by #1301.
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

        val observedRoutes = mutableMapOf<String, MutableSet<String>>()
        val engine = SettleoraPaddleOcrEngine(context)
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
                observedRoutes.getOrPut(script) { mutableSetOf() }
                    .addAll(result.blocks.map { it.modelPackId })
            }
        } finally {
            engine.release()
        }

        assertRoute(observedRoutes, "Arabic", "paddleocr.ppocrv5.mobile.rec.arabic")
        assertRoute(observedRoutes, "Thai", "paddleocr.ppocrv5.mobile.rec.thai")
        assertRoute(observedRoutes, "Cyrillic", "paddleocr.ppocrv5.mobile.rec.cyrillic")
        assertRoute(observedRoutes, "Devanagari", "paddleocr.ppocrv5.mobile.rec.devanagari")
        assertRoute(observedRoutes, "Korean", "paddleocr.ppocrv5.mobile.rec.korean")
    }

    private fun assertRoute(
        observedRoutes: Map<String, Set<String>>,
        script: String,
        expectedPackId: String,
    ) {
        assertTrue(
            "$script: expected routed model pack was not exercised",
            observedRoutes[script]?.contains(expectedPackId) == true,
        )
    }
}
