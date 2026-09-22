package com.autamedica.android.presentation.videocall.webrtc

import com.autamedica.android.domain.model.StreamQualityLevel
import org.webrtc.Camera2Enumerator
import org.webrtc.CameraVideoCapturer
import timber.log.Timber

/**
 * Capture format profiles tailored for clinical telemedicine inspection
 * (e.g. skin lesions, throat, eyes, medicine packaging, documents).
 */
data class CaptureFormatProfile(
    val width: Int,
    val height: Int,
    val fps: Int,
    val maxBitrateBps: Int,
    val name: String,
) {
    companion object {
        // 1. EXCELLENT: 1920x1080 @ 30fps (3.0 Mbps) - Telemedicine high detail
        val FHD_1080P = CaptureFormatProfile(1920, 1080, 30, 3_000_000, "1080p@30fps")

        // 2. GOOD (Base medical profile): 1280x720 @ 30fps (2.0 Mbps) - Default
        val HD_720P = CaptureFormatProfile(1280, 720, 30, 2_000_000, "720p@30fps")

        // 3. FAIR: 960x540 @ 24fps (1.2 Mbps) - Limited network
        val QHD_540P = CaptureFormatProfile(960, 540, 24, 1_200_000, "540p@24fps")

        // 4. POOR: 640x480 @ 15fps (600 Kbps) - Degraded network floor (never 320x240)
        val VGA_480P = CaptureFormatProfile(640, 480, 15, 600_000, "480p@15fps")
    }
}

/**
 * Manages camera device selection and adaptive video quality ladder for telemedicine.
 * Selects primary back camera by default (evaluating available formats to avoid macro/depth sensors),
 * establishes 720p@30fps as base profile, and dynamically adapts between 1080p, 720p, 540p, and 480p.
 */
class MedicalVideoQualityManager {

    private var currentProfile: CaptureFormatProfile = CaptureFormatProfile.HD_720P
    private var supportsFhd1080p: Boolean = false

    /**
     * Inspects camera devices and selects the primary rear (back-facing) camera by default.
     * Evaluates available formats to choose the highest-capability sensor (avoiding macro/depth sensors).
     * Falls back to front-facing camera if no back camera is available.
     */
    fun selectBestCamera(enumerator: Camera2Enumerator): Pair<String?, Boolean> {
        val deviceNames = enumerator.deviceNames ?: emptyArray()
        if (deviceNames.isEmpty()) {
            Timber.w("[MedicalCamera] No camera devices found on device")
            return Pair(null, false)
        }

        val backCameras = deviceNames.filter { enumerator.isBackFacing(it) }
        val frontCameras = deviceNames.filter { enumerator.isFrontFacing(it) }

        val (bestDevice, isBack) = when {
            backCameras.isNotEmpty() -> {
                // Find back camera with highest resolution capability (primary sensor)
                val primaryBack = backCameras.maxByOrNull { deviceName ->
                    val formats = runCatching { enumerator.getSupportedFormats(deviceName) }.getOrNull()
                    formats?.maxOfOrNull { it.width * it.height } ?: 0
                } ?: backCameras.first()
                Pair(primaryBack, true)
            }
            frontCameras.isNotEmpty() -> {
                val primaryFront = frontCameras.maxByOrNull { deviceName ->
                    val formats = runCatching { enumerator.getSupportedFormats(deviceName) }.getOrNull()
                    formats?.maxOfOrNull { it.width * it.height } ?: 0
                } ?: frontCameras.first()
                Pair(primaryFront, false)
            }
            else -> Pair(deviceNames.first(), false)
        }

        if (bestDevice != null) {
            val formats = runCatching { enumerator.getSupportedFormats(bestDevice) }.getOrNull()
            supportsFhd1080p = formats?.any { it.width >= 1920 && it.height >= 1080 } == true
            val maxRes = formats?.maxByOrNull { it.width * it.height }
            Timber.i(
                "[MedicalCamera] Selected camera: $bestDevice (isBack=$isBack, supports1080p=$supportsFhd1080p, max=${maxRes?.width}x${maxRes?.height})"
            )
        }

        return Pair(bestDevice, isBack)
    }

    /**
     * Medical base profile: 1280x720 @ 30fps.
     */
    fun getInitialProfile(): CaptureFormatProfile {
        currentProfile = CaptureFormatProfile.HD_720P
        return currentProfile
    }

    /**
     * Resolves the target profile based on WebRTC StreamQualityLevel.
     */
    fun resolveProfile(qualityLevel: StreamQualityLevel): CaptureFormatProfile {
        return when (qualityLevel) {
            StreamQualityLevel.EXCELLENT -> {
                if (supportsFhd1080p) CaptureFormatProfile.FHD_1080P else CaptureFormatProfile.HD_720P
            }
            StreamQualityLevel.GOOD, StreamQualityLevel.UNKNOWN -> {
                CaptureFormatProfile.HD_720P
            }
            StreamQualityLevel.FAIR -> {
                CaptureFormatProfile.QHD_540P
            }
            StreamQualityLevel.POOR -> {
                CaptureFormatProfile.VGA_480P
            }
        }
    }

    /**
     * Applies adaptation to the given capturer if changed.
     */
    fun adaptCaptureFormat(
        capturer: CameraVideoCapturer?,
        qualityLevel: StreamQualityLevel,
    ): CaptureFormatProfile {
        val targetProfile = resolveProfile(qualityLevel)
        if (targetProfile == currentProfile) return currentProfile

        try {
            capturer?.changeCaptureFormat(targetProfile.width, targetProfile.height, targetProfile.fps)
            Timber.i("[MedicalCamera] Adapted capture format from ${currentProfile.name} -> ${targetProfile.name}")
            currentProfile = targetProfile
        } catch (e: Exception) {
            Timber.w(e, "[MedicalCamera] Failed to change capture format to ${targetProfile.name}")
        }
        return currentProfile
    }
}
