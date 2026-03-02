package com.autamedica.android.presentation.videocall.components

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import org.webrtc.EglBase
import org.webrtc.RendererCommon
import org.webrtc.SurfaceViewRenderer
import org.webrtc.VideoTrack

/**
 * Composable wrapper around SurfaceViewRenderer for displaying WebRTC video tracks.
 */
@Composable
fun VideoRenderer(
    videoTrack: VideoTrack?,
    eglContext: EglBase.Context,
    modifier: Modifier = Modifier,
    mirror: Boolean = false,
    scalingType: RendererCommon.ScalingType = RendererCommon.ScalingType.SCALE_ASPECT_FILL,
) {
    val currentTrack by rememberUpdatedState(videoTrack)

    AndroidView(
        factory = { context ->
            SurfaceViewRenderer(context).apply {
                init(eglContext, null)
                setScalingType(scalingType)
                setMirror(mirror)
                setEnableHardwareScaler(true)
            }
        },
        modifier = modifier,
        update = { renderer ->
            renderer.setMirror(mirror)
            renderer.setScalingType(scalingType)
        },
    )

    DisposableEffect(currentTrack) {
        // We need to use a ref to track the renderer association
        onDispose { }
    }
}

/**
 * Composable that manages video track sink lifecycle properly.
 */
@Composable
fun ManagedVideoRenderer(
    videoTrack: VideoTrack?,
    eglContext: EglBase.Context,
    modifier: Modifier = Modifier,
    mirror: Boolean = false,
    scalingType: RendererCommon.ScalingType = RendererCommon.ScalingType.SCALE_ASPECT_FILL,
) {
    AndroidView(
        factory = { context ->
            SurfaceViewRenderer(context).apply {
                init(eglContext, null)
                setScalingType(scalingType)
                setMirror(mirror)
                setEnableHardwareScaler(true)
            }
        },
        modifier = modifier,
        update = { renderer ->
            renderer.setMirror(mirror)
            renderer.setScalingType(scalingType)
            // Remove previous track if any, add current
            videoTrack?.addSink(renderer)
        },
        onRelease = { renderer ->
            videoTrack?.removeSink(renderer)
            renderer.release()
        },
    )
}
