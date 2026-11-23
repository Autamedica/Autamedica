package com.autamedica.android.presentation.videocall.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.delay
import org.webrtc.EglBase
import org.webrtc.RendererCommon
import org.webrtc.SurfaceViewRenderer
import org.webrtc.VideoTrack
import kotlin.math.roundToInt

/**
 * Canonical WebRTC video renderer composable with proper sink lifecycle management,
 * hardware scaler, optional Tap-to-Focus metering ring, and Pinch-to-Zoom (1.0x..4.0x).
 */
@Composable
fun ManagedVideoRenderer(
    videoTrack: VideoTrack?,
    eglContext: EglBase.Context,
    modifier: Modifier = Modifier,
    mirror: Boolean = false,
    scalingType: RendererCommon.ScalingType = RendererCommon.ScalingType.SCALE_ASPECT_FILL,
    onFirstFrameRendered: (() -> Unit)? = null,
    currentZoomRatio: Float = 1.0f,
    onTapToFocus: ((normX: Float, normY: Float) -> Unit)? = null,
    onZoomChange: ((newZoomRatio: Float) -> Unit)? = null,
    onBackgroundTap: (() -> Unit)? = null,
) {
    var focusTapOffset by remember { mutableStateOf<Offset?>(null) }
    var liveZoom by remember(currentZoomRatio) { mutableFloatStateOf(currentZoomRatio) }
    var attachedTrack by remember { mutableStateOf<VideoTrack?>(null) }
    val density = LocalDensity.current

    LaunchedEffect(focusTapOffset) {
        if (focusTapOffset != null) {
            delay(1_100L)
            focusTapOffset = null
        }
    }

    val focusScale by animateFloatAsState(
        targetValue = if (focusTapOffset != null) 1.0f else 1.35f,
        animationSpec = tween(durationMillis = 220),
        label = "focusRingScale",
    )

    val gestureModifier = Modifier
        .then(
            if (onTapToFocus != null || onBackgroundTap != null) {
                Modifier.pointerInput(onTapToFocus, onBackgroundTap) {
                    detectTapGestures(
                        onTap = { offset ->
                            if (onTapToFocus != null && size.width > 0 && size.height > 0) {
                                focusTapOffset = offset
                                val normX = (offset.x / size.width.toFloat()).coerceIn(0.05f, 0.95f)
                                val normY = (offset.y / size.height.toFloat()).coerceIn(0.05f, 0.95f)
                                onTapToFocus(normX, normY)
                            }
                            onBackgroundTap?.invoke()
                        }
                    )
                }
            } else {
                Modifier
            }
        )
        .then(
            if (onZoomChange != null) {
                Modifier.pointerInput(onZoomChange) {
                    detectTransformGestures { _, _, zoomChange, _ ->
                        if (kotlin.math.abs(zoomChange - 1.0f) > 0.01f) {
                            liveZoom = (liveZoom * zoomChange).coerceIn(1.0f, 4.0f)
                            onZoomChange(liveZoom)
                        }
                    }
                }
            } else {
                Modifier
            }
        )

    Box(modifier = modifier.then(gestureModifier)) {
        AndroidView(
            factory = { context ->
                SurfaceViewRenderer(context).apply {
                    val rendererEvents = object : RendererCommon.RendererEvents {
                        override fun onFirstFrameRendered() {
                            onFirstFrameRendered?.invoke()
                        }
                        override fun onFrameResolutionChanged(videoWidth: Int, videoHeight: Int, rotation: Int) {}
                    }
                    init(eglContext, rendererEvents)
                    setScalingType(scalingType)
                    setMirror(mirror)
                    setEnableHardwareScaler(true)
                }
            },
            modifier = Modifier.matchParentSize(),
            update = { renderer ->
                renderer.setMirror(mirror)
                renderer.setScalingType(scalingType)
                if (attachedTrack !== videoTrack) {
                    runCatching { attachedTrack?.removeSink(renderer) }
                    runCatching { videoTrack?.addSink(renderer) }
                    attachedTrack = videoTrack
                }
            },
            onRelease = { renderer ->
                runCatching { attachedTrack?.removeSink(renderer) }
                runCatching { videoTrack?.removeSink(renderer) }
                attachedTrack = null
                renderer.release()
            },
        )

        val tapPos = focusTapOffset
        if (tapPos != null) {
            val ringRadiusPx = with(density) { 26.dp.toPx() }
            Surface(
                shape = CircleShape,
                color = Color(0x2238BDF8),
                border = BorderStroke(1.8.dp, Color(0xFF38BDF8)),
                modifier = Modifier
                    .offset {
                        IntOffset(
                            (tapPos.x - ringRadiusPx).roundToInt(),
                            (tapPos.y - ringRadiusPx).roundToInt(),
                        )
                    }
                    .size(52.dp)
                    .graphicsLayer {
                        scaleX = focusScale
                        scaleY = focusScale
                    },
            ) {}
        }
    }
}
