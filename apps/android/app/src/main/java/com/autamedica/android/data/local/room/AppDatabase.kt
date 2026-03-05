package com.autamedica.android.data.local.room

import androidx.room.Database
import androidx.room.RoomDatabase
import com.autamedica.android.data.local.room.dao.AppointmentDao
import com.autamedica.android.data.local.room.entity.AppointmentEntity

@Database(entities = [AppointmentEntity::class], version = 1, exportSchema = false)
abstract class AppDatabase : RoomDatabase() {

    abstract fun appointmentDao(): AppointmentDao
    
    companion object {
        const val DATABASE_NAME = "autamedica_db"
    }
}
