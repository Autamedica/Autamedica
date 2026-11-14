package com.autamedica.android.di

import android.content.Context
import com.autamedica.android.BuildConfig
import com.autamedica.android.data.remote.SignalingWebSocket
import com.autamedica.android.domain.signaling.SignalingClient
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.json.Json
import org.webrtc.EglBase
import org.webrtc.PeerConnectionFactory
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object WebRTCModule {

    @Provides
    @Singleton
    fun provideSignalingClient(
        json: Json,
    ): SignalingClient {
        return SignalingWebSocket(
            signalingUrl = BuildConfig.SIGNALING_URL,
            json = json,
        )
    }

    @Provides
    @Singleton
    fun provideEglBase(): EglBase {
        return EglBase.create()
    }

    @Provides
    @Singleton
    fun providePeerConnectionFactory(
        @ApplicationContext context: Context,
        eglBase: EglBase,
    ): PeerConnectionFactory {
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(context)
                .setEnableInternalTracer(false)
                .createInitializationOptions()
        )

        return PeerConnectionFactory.builder()
            .setVideoDecoderFactory(
                org.webrtc.DefaultVideoDecoderFactory(eglBase.eglBaseContext)
            )
            .setVideoEncoderFactory(
                org.webrtc.DefaultVideoEncoderFactory(
                    eglBase.eglBaseContext,
                    true,
                    true,
                )
            )
            .createPeerConnectionFactory()
    }
}
