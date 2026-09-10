package com.autamedica.android.util

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkStatic
import io.mockk.unmockkAll
import io.mockk.verify
import org.junit.After
import org.junit.Before
import org.junit.Test

class WhatsAppBridgeTest {

    private lateinit var mockContext: Context
    private lateinit var mockIntent: Intent
    private lateinit var bridge: WhatsAppBridge

    @Before
    fun setUp() {
        mockContext = mockk(relaxed = true)
        mockIntent = mockk(relaxed = true)
        bridge = WhatsAppBridge(mockContext)
        bridge.intentFactory = { _, _ -> mockIntent }

        mockkStatic(Uri::class)
        every { Uri.parse(any()) } answers {
            val raw = firstArg<String>()
            val uriMock = mockk<Uri>(relaxed = true)
            every { uriMock.toString() } returns raw
            uriMock
        }
    }

    @After
    fun tearDown() {
        unmockkAll()
    }

    @Test
    fun `default constants adhere to AutaMedica specifications`() {
        assertThat(WhatsAppBridge.DEFAULT_AUTAMEDICA_PHONE).isEqualTo("5491122334455")
        assertThat(WhatsAppBridge.WHATSAPP_PACKAGE).isEqualTo("com.whatsapp")
        assertThat(WhatsAppBridge.WHATSAPP_BUSINESS_PACKAGE).isEqualTo("com.whatsapp.w4b")
        assertThat(WhatsAppBridge.TRIAGE_MESSAGE).isEqualTo("SALUD")
        assertThat(WhatsAppBridge.DOCTOR_SUPPORT_MESSAGE).isEqualTo("3")
        assertThat(WhatsAppBridge.AUDIO_ANAMNESIS_MESSAGE).isEqualTo("5")
    }

    @Test
    fun `buildWhatsAppUrl constructs proper URL with phone and text`() {
        val url = WhatsAppBridge.buildWhatsAppUrl("+54 9 11 2233-4455", "SALUD")

        assertThat(url).contains("https://api.whatsapp.com/send?")
        assertThat(url).contains("phone=5491122334455")
        assertThat(url).contains("text=SALUD")
    }

    @Test
    fun `buildWhatsAppUrl handles empty message correctly`() {
        val url = WhatsAppBridge.buildWhatsAppUrl("5491122334455", "")

        assertThat(url).isEqualTo("https://api.whatsapp.com/send?phone=5491122334455")
    }

    @Test
    fun `buildWhatsAppUrl handles url encoded characters`() {
        val url = WhatsAppBridge.buildWhatsAppUrl("5491122334455", "Hola ¿cómo estás?")

        assertThat(url).contains("text=Hola+%C2%BFc%C3%B3mo+est%C3%A1s%3F")
    }

    @Test
    fun `normalizeFollowupResponse maps correctly`() {
        assertThat(WhatsAppBridge.normalizeFollowupResponse("1")).isEqualTo("1")
        assertThat(WhatsAppBridge.normalizeFollowupResponse("better")).isEqualTo("1")
        assertThat(WhatsAppBridge.normalizeFollowupResponse("mejor")).isEqualTo("1")
        assertThat(WhatsAppBridge.normalizeFollowupResponse("melhor")).isEqualTo("1")

        assertThat(WhatsAppBridge.normalizeFollowupResponse("2")).isEqualTo("2")
        assertThat(WhatsAppBridge.normalizeFollowupResponse("same")).isEqualTo("2")
        assertThat(WhatsAppBridge.normalizeFollowupResponse("stable")).isEqualTo("2")
        assertThat(WhatsAppBridge.normalizeFollowupResponse("igual")).isEqualTo("2")

        assertThat(WhatsAppBridge.normalizeFollowupResponse("3")).isEqualTo("3")
        assertThat(WhatsAppBridge.normalizeFollowupResponse("worse")).isEqualTo("3")
        assertThat(WhatsAppBridge.normalizeFollowupResponse("peor")).isEqualTo("3")
        assertThat(WhatsAppBridge.normalizeFollowupResponse("pior")).isEqualTo("3")

        assertThat(WhatsAppBridge.normalizeFollowupResponse("  custom text  ")).isEqualTo("custom text")
    }

    @Test
    fun `openWhatsAppChat passes correct URI and package to intent factory`() {
        var capturedUri: Uri? = null
        var capturedPackage: String? = null
        bridge.intentFactory = { uri, pkg ->
            capturedUri = uri
            capturedPackage = pkg
            mockIntent
        }
        every { mockContext.startActivity(mockIntent) } returns Unit

        val result = bridge.openWhatsAppChat("5491122334455", "Hola")

        assertThat(result).isTrue()
        assertThat(capturedPackage).isEqualTo("com.whatsapp")
        assertThat(capturedUri?.toString()).contains("phone=5491122334455")
        assertThat(capturedUri?.toString()).contains("text=Hola")
        verify(exactly = 1) { mockContext.startActivity(mockIntent) }
    }

    @Test
    fun `openWhatsAppChat falls back to browser when native app throws ActivityNotFoundException`() {
        val capturedPackages = mutableListOf<String?>()
        bridge.intentFactory = { _, pkg ->
            capturedPackages.add(pkg)
            mockIntent
        }
        every { mockContext.startActivity(mockIntent) } throws ActivityNotFoundException() andThen Unit

        val result = bridge.openWhatsAppChat("5491122334455", "SALUD")

        assertThat(result).isTrue()
        assertThat(capturedPackages.size).isEqualTo(2)
        assertThat(capturedPackages[0]).isEqualTo("com.whatsapp")
        assertThat(capturedPackages[1]).isNull()
        verify(exactly = 2) { mockContext.startActivity(mockIntent) }
    }

    @Test
    fun `openWhatsAppChat returns false when fallback also throws`() {
        every { mockContext.startActivity(mockIntent) } throws ActivityNotFoundException() andThenThrows ActivityNotFoundException()

        val result = bridge.openWhatsAppChat("5491122334455", "SALUD")

        assertThat(result).isFalse()
        verify(exactly = 2) { mockContext.startActivity(mockIntent) }
    }

    @Test
    fun `launchTriageChat triggers chat dispatch with SALUD and official phone`() {
        var capturedUri: Uri? = null
        bridge.intentFactory = { uri, _ ->
            capturedUri = uri
            mockIntent
        }
        every { mockContext.startActivity(mockIntent) } returns Unit

        val result = bridge.launchTriageChat()

        assertThat(result).isTrue()
        assertThat(capturedUri?.toString()).contains("text=SALUD")
        assertThat(capturedUri?.toString()).contains("phone=${WhatsAppBridge.DEFAULT_AUTAMEDICA_PHONE}")
    }

    @Test
    fun `launchFollowupReply triggers chat dispatch with normalized response`() {
        var capturedUri: Uri? = null
        bridge.intentFactory = { uri, _ ->
            capturedUri = uri
            mockIntent
        }
        every { mockContext.startActivity(mockIntent) } returns Unit

        val result = bridge.launchFollowupReply("better")

        assertThat(result).isTrue()
        assertThat(capturedUri?.toString()).contains("text=1")
    }

    @Test
    fun `launchDoctorSupport triggers chat dispatch with option 3`() {
        var capturedUri: Uri? = null
        bridge.intentFactory = { uri, _ ->
            capturedUri = uri
            mockIntent
        }
        every { mockContext.startActivity(mockIntent) } returns Unit

        val result = bridge.launchDoctorSupport()

        assertThat(result).isTrue()
        assertThat(capturedUri?.toString()).contains("text=3")
    }

    @Test
    fun `launchAudioAnamnesis triggers chat dispatch with option 5`() {
        var capturedUri: Uri? = null
        bridge.intentFactory = { uri, _ ->
            capturedUri = uri
            mockIntent
        }
        every { mockContext.startActivity(mockIntent) } returns Unit

        val result = bridge.launchAudioAnamnesis()

        assertThat(result).isTrue()
        assertThat(capturedUri?.toString()).contains("text=5")
    }
}
