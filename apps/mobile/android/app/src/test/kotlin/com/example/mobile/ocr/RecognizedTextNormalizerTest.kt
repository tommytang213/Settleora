package com.example.mobile.ocr

import org.junit.Assert.assertEquals
import org.junit.Test

class RecognizedTextNormalizerTest {
    @Test
    fun convertsArabicVisualOrderToLogicalOrder() {
        assertEquals(
            "متجر النور",
            RecognizedTextNormalizer.normalize("رونلا رجتم", arabicPack()),
        )
        assertEquals(
            "ضريبة القيمة المضافة",
            RecognizedTextNormalizer.normalize("ةفاضملا ةميقلا ةبيرض", arabicPack()),
        )
    }

    @Test
    fun preservesNumericAndLatinRunsInsideArabicText() {
        assertEquals(
            "دإ٢١،٧٩",
            RecognizedTextNormalizer.normalize("٢١،٧٩إد", arabicPack()),
        )
        assertEquals(
            "AED 38.85",
            RecognizedTextNormalizer.normalize("AED 38.85", arabicPack()),
        )
    }

    @Test
    fun leavesOtherRecognizerOutputUntouched() {
        val commonPack = RecognizerSpec(
            "common",
            "version",
            "model",
            "config",
            setOf(ScriptEvidence.COMMON),
        )
        assertEquals(
            "ร้านอาหารสยาม AED 38.85",
            RecognizedTextNormalizer.normalize("ร้านอาหารสยาม AED 38.85", commonPack),
        )
    }

    private fun arabicPack() = RecognizerSpec(
        "arabic",
        "version",
        "model",
        "config",
        setOf(ScriptEvidence.ARABIC),
    )
}
