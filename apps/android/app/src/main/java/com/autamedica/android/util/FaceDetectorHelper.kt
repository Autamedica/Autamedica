package com.autamedica.android.util

import android.graphics.Bitmap
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.Face
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import kotlinx.coroutines.tasks.await
import timber.log.Timber

/**
 * Enterprise-grade offline Face Detection utility (Phase 4).
 * Ensures the patient is properly framed before entering a WebRTC consultation.
 * 100% on-device processing. No GDPR/HIPAA leak.
 */
object FaceDetectorHelper {

    // High performance offline options
    private val options = FaceDetectorOptions.Builder()
        .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
        .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_NONE)
        .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_NONE)
        .build()

    private val detector = FaceDetection.getClient(options)

    /**
     * Checks if there's exactly one face clearly visible in the captured frame.
     */
    suspend fun hasClearFace(bitmap: Bitmap, rotationDegrees: Int = 0): Boolean {
        return try {
            val image = InputImage.fromBitmap(bitmap, rotationDegrees)
            val faces: List<Face> = detector.process(image).await()
            val hasFace = faces.isNotEmpty()
            Timber.d("[MLKit] Faces detected: ${faces.size}. Has clear face: $hasFace")
            // Strict telehealth condition: Ensure exactly 1 face is visible.
            faces.size == 1 
        } catch (e: Exception) {
            Timber.e(e, "[MLKit] Face detection failed.")
            false
        }
    }
}
