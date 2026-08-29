package com.autamedica.android.data.repository

import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.autamedica.android.data.local.room.AppDatabase
import com.autamedica.android.data.local.room.dao.AppointmentDao
import com.autamedica.android.data.local.room.entity.AppointmentEntity
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AppointmentCacheIsolationTest {

    private lateinit var database: AppDatabase
    private lateinit var appointmentDao: AppointmentDao

    @Before
    fun setup() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        database = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        appointmentDao = database.appointmentDao()
    }

    @After
    fun tearDown() {
        database.close()
    }

    @Test
    fun testOfflineCache_isIsolatedByUser() = runBlocking {
        val userA = "user-patient-a"
        val userB = "user-patient-b"

        val appointmentsUserA = listOf(
            AppointmentEntity(
                id = "app-1",
                patientId = "patient-a",
                doctorId = "doctor-1",
                startTime = "2026-06-10T10:00:00Z",
                endTime = "2026-06-10T10:30:00Z",
                durationMinutes = 30,
                type = "CONSULTATION",
                status = "SCHEDULED",
                notes = "Consulta de control A",
                meetingUrl = "http://signaling/room-a",
                ownerUserId = userA,
                cachedAt = System.currentTimeMillis()
            )
        )

        val appointmentsUserB = listOf(
            AppointmentEntity(
                id = "app-2",
                patientId = "patient-b",
                doctorId = "doctor-2",
                startTime = "2026-06-10T11:00:00Z",
                endTime = "2026-06-10T11:30:00Z",
                durationMinutes = 30,
                type = "TELEMEDICINE",
                status = "CONFIRMED",
                notes = "Consulta de control B",
                meetingUrl = "http://signaling/room-b",
                ownerUserId = userB,
                cachedAt = System.currentTimeMillis()
            )
        )

        // Insert both user caches
        appointmentDao.insertAppointments(appointmentsUserA)
        appointmentDao.insertAppointments(appointmentsUserB)

        // Verify User A only sees their own appointments
        val flowA: Flow<List<AppointmentEntity>> = appointmentDao.getAppointmentsForUser(userA)
        val resultA: List<AppointmentEntity> = flowA.first()
        Assert.assertEquals(1, resultA.size)
        Assert.assertEquals("app-1", resultA.first().id)
        Assert.assertEquals("Consulta de control A", resultA.first().notes)

        // Verify User B only sees their own appointments
        val flowB: Flow<List<AppointmentEntity>> = appointmentDao.getAppointmentsForUser(userB)
        val resultB: List<AppointmentEntity> = flowB.first()
        Assert.assertEquals(1, resultB.size)
        Assert.assertEquals("app-2", resultB.first().id)
        Assert.assertEquals("Consulta de control B", resultB.first().notes)
    }

    @Test
    fun testOfflineCache_clearingUserCache_doesNotAffectOtherUsers() = runBlocking {
        val userA = "user-patient-a"
        val userB = "user-patient-b"

        val appointments = listOf(
            AppointmentEntity(
                id = "app-1",
                patientId = "patient-a",
                doctorId = "doctor-1",
                startTime = "2026-06-10T10:00:00Z",
                endTime = "2026-06-10T10:30:00Z",
                durationMinutes = 30,
                type = "CONSULTATION",
                status = "SCHEDULED",
                notes = "Consulta A",
                meetingUrl = "http://signaling/room-a",
                ownerUserId = userA,
                cachedAt = System.currentTimeMillis()
            ),
            AppointmentEntity(
                id = "app-2",
                patientId = "patient-b",
                doctorId = "doctor-2",
                startTime = "2026-06-10T11:00:00Z",
                endTime = "2026-06-10T11:30:00Z",
                durationMinutes = 30,
                type = "TELEMEDICINE",
                status = "CONFIRMED",
                notes = "Consulta B",
                meetingUrl = "http://signaling/room-b",
                ownerUserId = userB,
                cachedAt = System.currentTimeMillis()
            )
        )

        appointmentDao.insertAppointments(appointments)

        // Clear only User A's cache (equivalent to User A logging out)
        appointmentDao.clearAppointmentsForUser(userA)

        // Verify User A's cache is empty
        val flowA: Flow<List<AppointmentEntity>> = appointmentDao.getAppointmentsForUser(userA)
        val resultA: List<AppointmentEntity> = flowA.first()
        Assert.assertTrue(resultA.isEmpty())

        // Verify User B's cache is still intact
        val flowB: Flow<List<AppointmentEntity>> = appointmentDao.getAppointmentsForUser(userB)
        val resultB: List<AppointmentEntity> = flowB.first()
        Assert.assertEquals(1, resultB.size)
        Assert.assertEquals("app-2", resultB.first().id)
    }
}
