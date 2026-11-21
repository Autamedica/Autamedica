package com.autamedica.android.presentation.videocall.webrtc

import android.graphics.Rect
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraMetadata
import android.hardware.camera2.CaptureRequest
import android.hardware.camera2.params.MeteringRectangle
import android.os.Build
import android.os.Handler
import android.util.Range
import android.view.Surface
import com.autamedica.android.domain.model.StreamQualityLevel
import org.webrtc.Camera2Enumerator
import org.webrtc.CameraVideoCapturer
import org.webrtc.VideoFrame
import org.webrtc.VideoSink
import timber.log.Timber
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Ambient lighting diagnosis detected automatically from local camera luma frames.
 */
enum class LightingAlert {
    NONE,
    LOW_LIGHT,
    BACKLIGHT,
}

/**
 * Lightweight frame luminance analyzer that samples 1 frame every 2.5s to detect
 * low-light environments or harsh backlight without impacting CPU or framerate.
 */
class ClinicalLightingAnalyzerSink(
    private val sampleIntervalMs: Long = 2_500L,
    private val onLightingEvaluated: (alert: LightingAlert, avgLuma: Int) -> Unit,
) : VideoSink {

    @Volatile
    private var lastSampleTimestampMs: Long = 0L
    private var consecutiveLowLightSamples: Int = 0
    private var consecutiveBacklightSamples: Int = 0

    override fun onFrame(frame: VideoFrame) {
        val now = System.currentTimeMillis()
        if (now - lastSampleTimestampMs < sampleIntervalMs) return
        lastSampleTimestampMs = now

        val i420 = runCatching { frame.buffer.toI420() }.getOrNull() ?: return
        try {
            val width = i420.width
            val height = i420.height
            if (width < 32 || height < 32) return

            val dataY = i420.dataY
            val strideY = i420.strideY
            val stepX = max(8, width / 24)
            val stepY = max(8, height / 24)

            val centerStartX = width / 4
            val centerEndX = (width * 3) / 4
            val centerStartY = height / 4
            val centerEndY = (height * 3) / 4

            var centerSum = 0L
            var centerCount = 0
            var borderSum = 0L
            var borderCount = 0

            var y = 0
            while (y < height) {
                val rowOffset = y * strideY
                var x = 0
                while (x < width) {
                    val idx = rowOffset + x
                    if (idx >= 0 && idx < dataY.limit()) {
                        val luma = dataY.get(idx).toInt() and 0xFF
                        val inCenter = x in centerStartX..centerEndX && y in centerStartY..centerEndY
                        if (inCenter) {
                            centerSum += luma
                            centerCount++
                        } else {
                            borderSum += luma
                            borderCount++
                        }
                    }
                    x += stepX
                }
                y += stepY
            }

            val totalCount = centerCount + borderCount
            if (totalCount == 0) return

            val avgLuma = ((centerSum + borderSum) / totalCount).toInt()
            val centerLuma = if (centerCount > 0) (centerSum / centerCount).toInt() else avgLuma
            val borderLuma = if (borderCount > 0) (borderSum / borderCount).toInt() else avgLuma

            val isLowLight = avgLuma < 50 || centerLuma < 45
            val isBacklight = !isLowLight && borderLuma > 180 && centerLuma < 88 && (borderLuma - centerLuma) >= 70

            when {
                isLowLight -> {
                    consecutiveLowLightSamples++
                    consecutiveBacklightSamples = 0
                }
                isBacklight -> {
                    consecutiveBacklightSamples++
                    consecutiveLowLightSamples = 0
                }
                else -> {
                    consecutiveLowLightSamples = 0
                    consecutiveBacklightSamples = 0
                }
            }

            val resolvedAlert = when {
                consecutiveLowLightSamples >= 2 -> LightingAlert.LOW_LIGHT
                consecutiveBacklightSamples >= 2 -> LightingAlert.BACKLIGHT
                else -> LightingAlert.NONE
            }
            onLightingEvaluated(resolvedAlert, avgLuma)
        } catch (_: Throwable) {
            // Non-fatal frame inspection
        } finally {
            runCatching { i420.release() }
        }
    }
}

/**
 * Capture format profiles tailored for clinical telemedicine inspection
 * (e.g. face-to-face consultation, skin lesions, throat, eyes, medicine packaging, documents).
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
 * Manages camera device selection, adaptive video quality ladder, and clinical Camera2 ISP controls:
 * - Selects primary front (selfie) camera by default for face-to-face consultation.
 * - Dynamically adapts between 1080p, 720p, 540p, and 480p.
 * - Automatically boosts exposure window in low light (20fps longer shutter + AE compensation).
 * - Configures continuous video autofocus, hardware face detection priority, edge/noise reduction,
 *   video stabilization, tap-to-focus metering, pinch-to-zoom (1x..4x), and rear torch.
 */
class MedicalVideoQualityManager {

    private var currentProfile: CaptureFormatProfile = CaptureFormatProfile.HD_720P
    private var supportsFhd1080p: Boolean = false
    private var lowLightShutterActive: Boolean = false

    /**
     * Selects the primary front-facing (selfie) camera by default (`preferFront = true`)
     * so doctor and patient see each other face-to-face immediately on call start.
     * Evaluates supported formats to pick the highest-capability primary sensor.
     */
    fun selectBestCamera(
        enumerator: Camera2Enumerator,
        preferFront: Boolean = true,
    ): Pair<String?, Boolean> {
        val deviceNames = enumerator.deviceNames ?: emptyArray()
        if (deviceNames.isEmpty()) {
            Timber.w("[MedicalCamera] No camera devices found on device")
            return Pair(null, false)
        }

        val frontCameras = deviceNames.filter { enumerator.isFrontFacing(it) }
        val backCameras = deviceNames.filter { enumerator.isBackFacing(it) }

        fun pickHighestRes(candidates: List<String>): String {
            return candidates.maxByOrNull { deviceName ->
                val formats = runCatching { enumerator.getSupportedFormats(deviceName) }.getOrNull()
                formats?.maxOfOrNull { it.width * it.height } ?: 0
            } ?: candidates.first()
        }

        val (bestDevice, isBack) = when {
            preferFront && frontCameras.isNotEmpty() -> Pair(pickHighestRes(frontCameras), false)
            backCameras.isNotEmpty() -> Pair(pickHighestRes(backCameras), true)
            frontCameras.isNotEmpty() -> Pair(pickHighestRes(frontCameras), false)
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
        lowLightShutterActive = false
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
     * Applies network quality adaptation to the given capturer if changed.
     */
    fun adaptCaptureFormat(
        capturer: CameraVideoCapturer?,
        qualityLevel: StreamQualityLevel,
    ): CaptureFormatProfile {
        val targetProfile = resolveProfile(qualityLevel)
        if (targetProfile == currentProfile) return currentProfile

        try {
            val effectiveFps = if (lowLightShutterActive) min(targetProfile.fps, 20) else targetProfile.fps
            capturer?.changeCaptureFormat(targetProfile.width, targetProfile.height, effectiveFps)
            Timber.i("[MedicalCamera] Adapted capture format from ${currentProfile.name} -> ${targetProfile.name} (fps=$effectiveFps)")
            currentProfile = targetProfile
        } catch (e: Exception) {
            Timber.w(e, "[MedicalCamera] Failed to change capture format to ${targetProfile.name}")
        }
        return currentProfile
    }

    /**
     * Automatically extends sensor exposure time per frame in low-light rooms by capping
     * capture framerate to 20fps while preserving full HD spatial resolution.
     */
    fun applyLowLightExposureAdaptation(
        capturer: CameraVideoCapturer?,
        alert: LightingAlert,
    ) {
        val shouldBoost = alert == LightingAlert.LOW_LIGHT
        if (shouldBoost == lowLightShutterActive) return
        lowLightShutterActive = shouldBoost
        val targetFps = if (shouldBoost) min(currentProfile.fps, 20) else currentProfile.fps
        runCatching {
            capturer?.changeCaptureFormat(currentProfile.width, currentProfile.height, targetFps)
            Timber.i("[MedicalCamera] Low-light shutter boost=$shouldBoost -> ${currentProfile.width}x${currentProfile.height}@${targetFps}fps")
        }
    }

    /**
     * Applies clinical Camera2 ISP enhancements on the active WebRTC Camera2Session:
     * - Continuous video autofocus (CONTROL_AF_MODE_CONTINUOUS_VIDEO)
     * - Hardware face detection priority for AF/AE (STATISTICS_FACE_DETECT_MODE_SIMPLE)
     * - Low-light AE exposure compensation (+1 EV when lowLightBoost is active)
     * - Hardware spatial noise reduction & edge sharpening for budget cameras
     * - Optical / digital video stabilization
     * - Tap-to-focus metering region, pinch-to-zoom (1.0x..4.0x), and rear torch
     */
    fun applyClinicalCamera2Controls(
        capturer: CameraVideoCapturer?,
        torchEnabled: Boolean = false,
        zoomRatio: Float = 1.0f,
        focusPoint: Pair<Float, Float>? = null,
        lowLightBoost: Boolean = false,
    ) {
        if (capturer == null) return
        runCatching {
            val sessionField = findFieldInHierarchy(capturer.javaClass, "currentSession") ?: return
            sessionField.isAccessible = true
            val session = sessionField.get(capturer) ?: return
            if (!session.javaClass.name.contains("Camera2Session")) return

            val handler = getFieldValue<Handler>(session, "cameraThreadHandler") ?: return
            handler.post {
                runCatching {
                    val cameraDevice = getFieldValue<CameraDevice>(session, "cameraDevice") ?: return@post
                    val captureSession = getFieldValue<CameraCaptureSession>(session, "captureSession") ?: return@post
                    val characteristics = getFieldValue<CameraCharacteristics>(session, "cameraCharacteristics") ?: return@post
                    val surface = getFieldValue<Surface>(session, "surface") ?: return@post

                    val builder = cameraDevice.createCaptureRequest(CameraDevice.TEMPLATE_RECORD)
                    builder.addTarget(surface)

                    // 1. Auto-Exposure & Low-Light Boost
                    builder.set(CaptureRequest.CONTROL_MODE, CameraMetadata.CONTROL_MODE_AUTO)
                    builder.set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON)

                    val aeRange = characteristics.get(CameraCharacteristics.CONTROL_AE_COMPENSATION_RANGE)
                    if (aeRange != null) {
                        val targetEv = if (lowLightBoost) min(aeRange.upper, max(1, aeRange.upper / 2)) else 0
                        if (targetEv in aeRange.lower..aeRange.upper) {
                            builder.set(CaptureRequest.CONTROL_AE_EXPOSURE_COMPENSATION, targetEv)
                        }
                    }

                    val fpsRanges = characteristics.get(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES)
                    if (!fpsRanges.isNullOrEmpty()) {
                        val maxUnit = fpsRanges.maxOf { it.upper }
                        val multiplier = if (maxUnit >= 1000) 1000 else 1
                        val desiredMin = (if (lowLightBoost) 12 else 15) * multiplier
                        val desiredMax = 30 * multiplier
                        val bestRange = fpsRanges.minByOrNull { r ->
                            kotlin.math.abs(r.lower - desiredMin) + kotlin.math.abs(r.upper - desiredMax)
                        }
                        if (bestRange != null) {
                            builder.set(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE, Range(bestRange.lower, bestRange.upper))
                        }
                    }

                    // 2. Continuous Video Autofocus + Tap-to-Focus Metering Region
                    val afModes = characteristics.get(CameraCharacteristics.CONTROL_AF_AVAILABLE_MODES) ?: IntArray(0)
                    when {
                        afModes.contains(CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_VIDEO) ->
                            builder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_VIDEO)
                        afModes.contains(CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE) ->
                            builder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE)
                        afModes.contains(CaptureRequest.CONTROL_AF_MODE_AUTO) ->
                            builder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_AUTO)
                    }

                    val activeArray = characteristics.get(CameraCharacteristics.SENSOR_INFO_ACTIVE_ARRAY_SIZE)
                    if (focusPoint != null && activeArray != null) {
                        val normX = focusPoint.first.coerceIn(0.05f, 0.95f)
                        val normY = focusPoint.second.coerceIn(0.05f, 0.95f)
                        val regionW = (activeArray.width() * 0.16f).roundToInt().coerceAtLeast(64)
                        val regionH = (activeArray.height() * 0.16f).roundToInt().coerceAtLeast(64)
                        val centerX = (activeArray.left + normX * activeArray.width()).roundToInt()
                        val centerY = (activeArray.top + normY * activeArray.height()).roundToInt()
                        val left = (centerX - regionW / 2).coerceIn(activeArray.left, activeArray.right - regionW)
                        val top = (centerY - regionH / 2).coerceIn(activeArray.top, activeArray.bottom - regionH)
                        val meteringRect = MeteringRectangle(
                            Rect(left, top, left + regionW, top + regionH),
                            MeteringRectangle.METERING_WEIGHT_MAX - 1,
                        )
                        val maxAfRegions = characteristics.get(CameraCharacteristics.CONTROL_MAX_REGIONS_AF) ?: 0
                        if (maxAfRegions > 0) {
                            builder.set(CaptureRequest.CONTROL_AF_REGIONS, arrayOf(meteringRect))
                        }
                        val maxAeRegions = characteristics.get(CameraCharacteristics.CONTROL_MAX_REGIONS_AE) ?: 0
                        if (maxAeRegions > 0) {
                            builder.set(CaptureRequest.CONTROL_AE_REGIONS, arrayOf(meteringRect))
                        }
                    }

                    // 3. Hardware Face Detection Priority (locks AF/AE onto patient or doctor face)
                    val faceModes = characteristics.get(CameraCharacteristics.STATISTICS_INFO_AVAILABLE_FACE_DETECT_MODES) ?: IntArray(0)
                    if (faceModes.contains(CameraMetadata.STATISTICS_FACE_DETECT_MODE_SIMPLE)) {
                        builder.set(CaptureRequest.STATISTICS_FACE_DETECT_MODE, CameraMetadata.STATISTICS_FACE_DETECT_MODE_SIMPLE)
                    }

                    // 4. Spatial Noise Reduction & Edge Enhancement for low-quality cameras
                    val nrModes = characteristics.get(CameraCharacteristics.NOISE_REDUCTION_AVAILABLE_NOISE_REDUCTION_MODES) ?: IntArray(0)
                    if (nrModes.contains(CaptureRequest.NOISE_REDUCTION_MODE_FAST)) {
                        builder.set(CaptureRequest.NOISE_REDUCTION_MODE, CaptureRequest.NOISE_REDUCTION_MODE_FAST)
                    }
                    val edgeModes = characteristics.get(CameraCharacteristics.EDGE_AVAILABLE_EDGE_MODES) ?: IntArray(0)
                    if (edgeModes.contains(CaptureRequest.EDGE_MODE_FAST)) {
                        builder.set(CaptureRequest.EDGE_MODE, CaptureRequest.EDGE_MODE_FAST)
                    }

                    // 5. Video Stabilization (Optical or Digital)
                    val oisModes = characteristics.get(CameraCharacteristics.LENS_INFO_AVAILABLE_OPTICAL_STABILIZATION) ?: IntArray(0)
                    val eisModes = characteristics.get(CameraCharacteristics.CONTROL_AVAILABLE_VIDEO_STABILIZATION_MODES) ?: IntArray(0)
                    if (oisModes.contains(CaptureRequest.LENS_OPTICAL_STABILIZATION_MODE_ON)) {
                        builder.set(CaptureRequest.LENS_OPTICAL_STABILIZATION_MODE, CaptureRequest.LENS_OPTICAL_STABILIZATION_MODE_ON)
                    } else if (eisModes.contains(CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE_ON)) {
                        builder.set(CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE, CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE_ON)
                    }

                    // 6. Pinch-to-Zoom (1.0x .. 4.0x)
                    val maxZoom = (characteristics.get(CameraCharacteristics.SCALER_AVAILABLE_MAX_DIGITAL_ZOOM) ?: 4.0f).coerceAtLeast(1.0f)
                    val clampedZoom = zoomRatio.coerceIn(1.0f, min(4.0f, maxZoom))
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        builder.set(CaptureRequest.CONTROL_ZOOM_RATIO, clampedZoom)
                    } else if (activeArray != null && clampedZoom > 1.0f) {
                        val cropW = (activeArray.width() / clampedZoom).roundToInt()
                        val cropH = (activeArray.height() / clampedZoom).roundToInt()
                        val cropX = activeArray.centerX() - cropW / 2
                        val cropY = activeArray.centerY() - cropH / 2
                        builder.set(CaptureRequest.SCALER_CROP_REGION, Rect(cropX, cropY, cropX + cropW, cropY + cropH))
                    }

                    // 7. Rear Clinical Inspection Torch (Flash)
                    val flashAvailable = characteristics.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
                    if (flashAvailable) {
                        builder.set(
                            CaptureRequest.FLASH_MODE,
                            if (torchEnabled) CaptureRequest.FLASH_MODE_TORCH else CaptureRequest.FLASH_MODE_OFF,
                        )
                    }

                    captureSession.setRepeatingRequest(builder.build(), null, handler)
                }.onFailure { e ->
                    Timber.d(e, "[MedicalCamera] Clinical Camera2 tuning skipped")
                }
            }
        }
    }

    private fun findFieldInHierarchy(clazz: Class<*>?, fieldName: String): java.lang.reflect.Field? {
        var current = clazz
        while (current != null && current != Any::class.java) {
            val found = runCatching { current.getDeclaredField(fieldName) }.getOrNull()
            if (found != null) return found
            current = current.superclass
        }
        return null
    }

    @Suppress("UNCHECKED_CAST")
    private fun <T> getFieldValue(target: Any, fieldName: String): T? {
        val field = findFieldInHierarchy(target.javaClass, fieldName) ?: return null
        field.isAccessible = true
        return runCatching { field.get(target) as? T }.getOrNull()
    }
}
