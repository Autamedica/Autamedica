package com.autamedica.android.presentation.videocall.livekit

import io.livekit.android.ConnectOptions
import io.livekit.android.RoomOptions
import io.livekit.android.room.participant.AudioPresets
import io.livekit.android.room.participant.AudioTrackPublishDefaults
import io.livekit.android.room.participant.VideoTrackPublishDefaults
import io.livekit.android.room.track.CameraPosition
import io.livekit.android.room.track.LocalAudioTrackOptions
import io.livekit.android.room.track.LocalVideoTrackOptions
import io.livekit.android.room.track.VideoPreset169
import livekit.org.webrtc.RtpParameters

private const val LIVEKIT_TARGET_MAX_FPS = 24

internal object LiveKitCallProfile {
    val roomOptions: RoomOptions =
        RoomOptions().copy(
            adaptiveStream = true,
            dynacast = true,
            audioTrackCaptureDefaults = LocalAudioTrackOptions().copy(
                noiseSuppression = true,
                echoCancellation = true,
                autoGainControl = true,
                highPassFilter = true,
                typingNoiseDetection = true,
            ),
            videoTrackCaptureDefaults = LocalVideoTrackOptions().copy(
                position = CameraPosition.FRONT,
                captureParams = VideoPreset169.H720.capture.copy(
                    maxFps = LIVEKIT_TARGET_MAX_FPS,
                    adaptOutputToDimensions = true,
                ),
            ),
            audioTrackPublishDefaults = AudioTrackPublishDefaults().copy(
                audioBitrate = AudioPresets.SPEECH.maxBitrate,
                dtx = true,
                red = true,
                preconnect = true,
            ),
            videoTrackPublishDefaults = VideoTrackPublishDefaults().copy(
                videoEncoding = VideoPreset169.H720.encoding.copy(maxFps = LIVEKIT_TARGET_MAX_FPS),
                simulcast = true,
                degradationPreference = RtpParameters.DegradationPreference.MAINTAIN_FRAMERATE,
                simulcastLayers = listOf(
                    VideoPreset169.H180,
                    VideoPreset169.H360,
                    VideoPreset169.H720,
                ),
            ),
        )

    val connectOptions: ConnectOptions =
        ConnectOptions().copy(
            autoSubscribe = true,
            audio = true,
            video = true,
        )
}
