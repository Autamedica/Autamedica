package com.autamedica.android.data.repository

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PharmacyRoomIdsTest {
    @Test fun opaqueRoomIdsNeverContainPatientDocuments() {
        val rooms = (0 until 12).map { opaquePharmacyRoomId("general") }
        assertThat(rooms.distinct()).hasSize(12)
        for (room in rooms) {
            assertThat(room).matches("cf-room-general-[0-9a-f]{32}")
            assertThat(room).doesNotContain("00000000")
            assertThat(room).doesNotContain("12345678909")
        }
    }

    @Test fun unsafeTierTextNeverLeaksIntoRoom() {
        val room = opaquePharmacyRoomId("general/../../../patient=12345678909")
        assertThat(room).startsWith("cf-room-general-")
        assertThat(room).doesNotContain("/")
        assertThat(opaquePharmacyRoomId("")).startsWith("cf-room-general-")
    }
}
