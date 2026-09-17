// Copyright (c) 2026 PaddlePaddle Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package com.paddle.ocr.engine

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import android.content.Context
import com.paddle.ocr.EngineConfig
import com.paddle.ocr.model.OCRError
import java.nio.FloatBuffer

class ORTSessionManager(
    private val context: Context,
    private val config: EngineConfig,
) {
    private var env: OrtEnvironment? = null
    private var detSession: OrtSession? = null
    private var recSession: OrtSession? = null
    private val recAssetPaths = linkedMapOf<String, String>()
    private var detInputName: String = "x"
    private var activeRecognizerId: String? = null
    private var recInputName: String = "x"
    var coldLoadTimeMs: Long = 0
        private set

    fun loadModels(detAssetPath: String, recAssetPath: String) {
        loadModels(detAssetPath, mapOf(DEFAULT_RECOGNIZER_ID to recAssetPath))
    }

    fun loadModels(detAssetPath: String, recAssetPaths: Map<String, String>) {
        require(recAssetPaths.isNotEmpty()) { "At least one recognition model is required" }
        val loadStart = System.currentTimeMillis()
        env = OrtEnvironment.getEnvironment()
        val opts = OrtSession.SessionOptions().apply {
            setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
            setIntraOpNumThreads(config.numThreads)
        }
        try {
            val ortEnv = env ?: throw OCRError.ModelLoadFailed("OCR", Exception("Environment not initialized"))
            val detBytes = readModelAsset(detAssetPath)
            try {
                detSession = ortEnv.createSession(detBytes, opts)
            } catch (t: Throwable) {
                throw OCRError.ModelLoadFailed("detection", t)
            }
            detInputName = try {
                detSession!!.inputNames.iterator().next()
            } catch (t: Throwable) {
                throw OCRError.ModelLoadFailed("detection", t)
            }
            this.recAssetPaths.putAll(recAssetPaths)
            activateRecognitionSession(recAssetPaths.keys.first(), ortEnv)
            coldLoadTimeMs = System.currentTimeMillis() - loadStart
        } finally {
            opts.close()
        }
    }

    fun runDetection(input: FloatArray, shape: LongArray): Pair<FloatArray, LongArray> {
        val session = detSession
            ?: throw OCRError.ModelLoadFailed("detection", Exception("Session not initialized"))
        val ortEnv = env
            ?: throw OCRError.ModelLoadFailed("detection", Exception("Environment not initialized"))
        return runSession(ortEnv, session, detInputName, input, shape, "detection")
    }

    fun runRecognition(input: FloatArray, shape: LongArray): Pair<FloatArray, LongArray> {
        return runRecognition(DEFAULT_RECOGNIZER_ID, input, shape)
    }

    @Synchronized
    fun runRecognition(
        recognizerId: String,
        input: FloatArray,
        shape: LongArray,
    ): Pair<FloatArray, LongArray> {
        val ortEnv = env
            ?: throw OCRError.ModelLoadFailed("recognition:$recognizerId", Exception("Environment not initialized"))
        if (activeRecognizerId != recognizerId) {
            activateRecognitionSession(recognizerId, ortEnv)
        }
        val session = recSession
            ?: throw OCRError.ModelLoadFailed("recognition:$recognizerId", Exception("Session not initialized"))
        return runSession(ortEnv, session, recInputName, input, shape, "recognition:$recognizerId")
    }

    fun release() {
        try {
            detSession?.close()
        } finally {
            detSession = null
            try {
                recSession?.close()
            } finally {
                recSession = null
                recAssetPaths.clear()
                activeRecognizerId = null
                env = null
            }
        }
    }

    private fun activateRecognitionSession(recognizerId: String, ortEnv: OrtEnvironment) {
        val assetPath = recAssetPaths[recognizerId]
            ?: throw OCRError.ModelLoadFailed(
                "recognition:$recognizerId",
                Exception("Model asset is not registered"),
            )
        val opts = OrtSession.SessionOptions().apply {
            setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
            setIntraOpNumThreads(config.numThreads)
        }
        val nextSession = try {
            ortEnv.createSession(readModelAsset(assetPath), opts)
        } catch (t: Throwable) {
            throw OCRError.ModelLoadFailed("recognition:$recognizerId", t)
        } finally {
            opts.close()
        }
        val nextInputName = try {
            nextSession.inputNames.iterator().next()
        } catch (t: Throwable) {
            nextSession.close()
            throw OCRError.ModelLoadFailed("recognition:$recognizerId", t)
        }

        recSession?.close()
        recSession = nextSession
        recInputName = nextInputName
        activeRecognizerId = recognizerId
    }

    private fun readModelAsset(assetPath: String): ByteArray {
        return try {
            context.assets.open(assetPath).use { it.readBytes() }
        } catch (t: Throwable) {
            throw OCRError.ModelNotFound(assetPath, t)
        }
    }

    private fun runSession(
        ortEnv: OrtEnvironment,
        session: OrtSession,
        inputName: String,
        input: FloatArray,
        shape: LongArray,
        modelName: String,
    ): Pair<FloatArray, LongArray> {
        val tensor = try {
            OnnxTensor.createTensor(ortEnv, FloatBuffer.wrap(input), shape)
        } catch (t: Throwable) {
            throw OCRError.InferenceFailed(modelName, t)
        }
        val result = try {
            try {
                session.run(mapOf(inputName to tensor))
            } catch (t: Throwable) {
                throw OCRError.InferenceFailed(modelName, t)
            }
        } finally {
            tensor.close()
        }

        return try {
            try {
                val outputName = session.outputNames.iterator().next()
                val ortValue = result.get(outputName)
                    .orElseThrow { Exception("No output tensor found") }
                val outputTensor = ortValue as? OnnxTensor
                    ?: throw Exception("Output is not an ONNX tensor")
                Pair(copyFloatBuffer(outputTensor.floatBuffer), outputTensor.info.shape)
            } catch (t: Throwable) {
                throw OCRError.InferenceFailed(modelName, t)
            }
        } finally {
            result.close()
        }
    }

    private fun copyFloatBuffer(buffer: FloatBuffer): FloatArray {
        val duplicate = buffer.duplicate()
        duplicate.rewind()
        val output = FloatArray(duplicate.remaining())
        duplicate.get(output)
        return output
    }

    private companion object {
        const val DEFAULT_RECOGNIZER_ID = "default"
    }
}
