package com.autamedica.android.data.repository

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class MemedPdfUrlExtractionTest {
    @Test
    fun findsPdfUrlAtTopLevel() {
        val data = Json.parseToJsonElement("""{"pdf_url":"https://api.memed.com.br/document.pdf"}""")
        assertThat(findMemedPdfUrl(data)).isEqualTo("https://api.memed.com.br/document.pdf")
    }

    @Test
    fun findsPdfUrlNestedThroughBackendDepthLimit() {
        val data = Json.parseToJsonElement(
            """{"a":{"b":{"c":{"d":{"e":{"f":{"g":{"document_url":"https://api.memed.com.br/atestado.pdf"}}}}}}}}""",
        )
        assertThat(findMemedPdfUrl(data)).isEqualTo("https://api.memed.com.br/atestado.pdf")
    }

    @Test
    fun rejectsUrlsBeyondDepthSevenAndUntrustedHosts() {
        val tooDeep = Json.parseToJsonElement(
            """{"a":{"b":{"c":{"d":{"e":{"f":{"g":{"h":{"pdf_url":"https://api.memed.com.br/a.pdf"}}}}}}}}}""",
        )
        val untrusted = Json.parseToJsonElement("""{"pdf_url":"https://evil.example/a.pdf"}""")
        assertThat(findMemedPdfUrl(tooDeep)).isNull()
        assertThat(findMemedPdfUrl(untrusted)).isNull()
    }
}
