package com.autamedica.android.di

import com.autamedica.android.data.repository.AppointmentRepositoryImpl
import com.autamedica.android.data.repository.AuthRepositoryImpl
import com.autamedica.android.data.repository.ProfileRepositoryImpl
import com.autamedica.android.domain.repository.AppointmentRepository
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.ProfileRepository
import com.autamedica.android.domain.repository.TelemedicineRepository
import com.autamedica.android.data.repository.TelemedicineRepositoryImpl
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {

    @Binds
    @Singleton
    abstract fun bindAuthRepository(impl: AuthRepositoryImpl): AuthRepository

    @Binds
    @Singleton
    abstract fun bindAppointmentRepository(impl: AppointmentRepositoryImpl): AppointmentRepository

    @Binds
    @Singleton
    abstract fun bindProfileRepository(impl: ProfileRepositoryImpl): ProfileRepository

    @Binds
    @Singleton
    abstract fun bindTelemedicineRepository(impl: TelemedicineRepositoryImpl): TelemedicineRepository
}
