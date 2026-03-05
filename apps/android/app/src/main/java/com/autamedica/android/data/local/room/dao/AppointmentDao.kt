package com.autamedica.android.data.local.room.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.autamedica.android.data.local.room.entity.AppointmentEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface AppointmentDao {

    @Query("SELECT * FROM appointments")
    fun getAllAppointments(): Flow<List<AppointmentEntity>>

    @Query("SELECT * FROM appointments WHERE doctorId = :doctorId ORDER BY startTime ASC")
    fun getAppointmentsForDoctor(doctorId: String): Flow<List<AppointmentEntity>>
    
    @Query("SELECT * FROM appointments WHERE patientId = :patientId ORDER BY startTime ASC")
    fun getAppointmentsForPatient(patientId: String): Flow<List<AppointmentEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAppointments(appointments: List<AppointmentEntity>)

    @Query("DELETE FROM appointments")
    suspend fun clearAll()
    
    @Query("DELETE FROM appointments WHERE cachedAt < :thresholdTime")
    suspend fun clearOldCache(thresholdTime: Long)
}
