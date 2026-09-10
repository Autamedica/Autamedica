package com.autamedica.android.di

import android.content.Context
import androidx.room.Room
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
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

    private val MIGRATION_1_2 = object : Migration(1, 2) {
        override fun migrate(db: SupportSQLiteDatabase) {
            db.execSQL("ALTER TABLE appointments ADD COLUMN ownerUserId TEXT")
        }
    }

    private val MIGRATION_2_3 = object : Migration(2, 3) {
        override fun migrate(db: SupportSQLiteDatabase) {
            db.execSQL("ALTER TABLE appointments ADD COLUMN doctorName TEXT")
            db.execSQL("ALTER TABLE appointments ADD COLUMN doctorSpecialty TEXT")
            db.execSQL("ALTER TABLE appointments ADD COLUMN doctorAvatarUrl TEXT")
            db.execSQL("ALTER TABLE appointments ADD COLUMN doctorFee REAL")
        }
    }

    @Provides
    @Singleton
    fun provideAppDatabase(@ApplicationContext context: Context): AppDatabase {
        return Room.databaseBuilder(
            context,
            AppDatabase::class.java,
            AppDatabase.DATABASE_NAME
        ).addMigrations(MIGRATION_1_2, MIGRATION_2_3)
            .fallbackToDestructiveMigration()
            .build()
    }

    @Provides
    fun provideAppointmentDao(appDatabase: AppDatabase): AppointmentDao {
        return appDatabase.appointmentDao()
    }
}
