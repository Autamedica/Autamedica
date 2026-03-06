package com.autamedica.android.data.local.room.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.autamedica.android.data.local.room.entity.AppointmentEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface AppointmentDao {

    @Query("SELECT * FROM appointments WHERE ownerUserId = :ownerUserId ORDER BY startTime ASC")
    fun getAppointmentsForUser(ownerUserId: String): Flow<List<AppointmentEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAppointments(appointments: List<AppointmentEntity>)

    @Query("DELETE FROM appointments")
    suspend fun clearAll()

    @Query("DELETE FROM appointments WHERE ownerUserId = :ownerUserId")
    suspend fun clearAppointmentsForUser(ownerUserId: String)
    
    @Query("DELETE FROM appointments WHERE cachedAt < :thresholdTime")
    suspend fun clearOldCache(thresholdTime: Long)
}
