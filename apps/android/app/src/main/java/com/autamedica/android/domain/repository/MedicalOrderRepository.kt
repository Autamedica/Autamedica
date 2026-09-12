package com.autamedica.android.domain.repository

import com.autamedica.android.domain.model.CreateMedicalOrderRequest
import com.autamedica.android.domain.model.MedicalOrder

interface MedicalOrderRepository {
    suspend fun getDoctorMedicalOrders(): Result<List<MedicalOrder>>
    suspend fun getPatientMedicalOrders(): Result<List<MedicalOrder>>
    suspend fun getMedicalOrderById(id: String): Result<MedicalOrder>
    suspend fun createMedicalOrder(request: CreateMedicalOrderRequest): Result<MedicalOrder>
    suspend fun cancelMedicalOrder(orderId: String, reason: String): Result<Unit>
}
