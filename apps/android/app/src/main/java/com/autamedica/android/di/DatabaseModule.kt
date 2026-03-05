package com.autamedica.android.di

import android.content.Context
import androidx.room.Room
import com.autamedica.android.data.local.room.AppDatabase
import com.autamedica.android.data.local.room.dao.AppointmentDao
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideAppDatabase(@ApplicationContext context: Context): AppDatabase {
        return Room.databaseBuilder(
            context,
            AppDatabase::class.java,
            AppDatabase.DATABASE_NAME
        ).build()
    }

    @Provides
    fun provideAppointmentDao(appDatabase: AppDatabase): AppointmentDao {
        return appDatabase.appointmentDao()
    }
}
