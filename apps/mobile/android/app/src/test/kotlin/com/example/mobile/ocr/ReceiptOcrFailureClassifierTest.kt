package com.example.mobile.ocr

import com.paddle.ocr.model.OCRError
import org.junit.Assert.assertEquals
import org.junit.Test

class ReceiptOcrFailureClassifierTest {
    @Test
    fun classifiesModelAndInferenceFailuresWithoutExceptionMaterial() {
        assertEquals(
            "ocr_resource_lookup",
            boundedReceiptOcrFailureCode(OCRError.ModelNotFound("private-path")),
        )
        assertEquals(
            "ocr_model_open",
            boundedReceiptOcrFailureCode(
                OCRError.ModelLoadFailed("recognition:private-model", Exception("private-detail")),
            ),
        )
        assertEquals(
            "ocr_runtime_initialization",
            boundedReceiptOcrFailureCode(OCRError.RuntimeInitializationFailed("private-component")),
        )
        assertEquals(
            "ocr_detection_inference",
            boundedReceiptOcrFailureCode(OCRError.InferenceFailed("detection", Exception())),
        )
        assertEquals(
            "ocr_recognition_inference",
            boundedReceiptOcrFailureCode(
                OCRError.InferenceFailed("recognition:private-model", Exception()),
            ),
        )
    }

    @Test
    fun followsBoundedCausesAndFallsBackToInternalContract() {
        assertEquals(
            "ocr_model_configuration",
            boundedReceiptOcrFailureCode(
                IllegalStateException("private-detail", OCRError.ConfigParseFailed("private-path")),
            ),
        )
        assertEquals(
            "ocr_internal_contract",
            boundedReceiptOcrFailureCode(IllegalStateException("private-detail")),
        )

        var deepCause: Throwable = OCRError.InvalidImage()
        repeat(16) { deepCause = IllegalStateException("private-detail", deepCause) }
        assertEquals("ocr_internal_contract", boundedReceiptOcrFailureCode(deepCause))

        val cycleStart = IllegalStateException("private-detail")
        val cycleEnd = IllegalStateException("private-detail", cycleStart)
        cycleStart.initCause(cycleEnd)
        assertEquals("ocr_internal_contract", boundedReceiptOcrFailureCode(cycleStart))
    }
}
