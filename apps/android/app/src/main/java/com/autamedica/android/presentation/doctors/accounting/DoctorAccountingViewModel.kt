package com.autamedica.android.presentation.doctors.accounting

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.R
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay

data class TransactionItem(
    val id: String,
    val date: String,
    val patientName: String,
    val amount: Double,
    val status: String,
    val statusRes: Int? = null,
)

data class DoctorAccountingState(
    val isLoading: Boolean = false,
    val balanceAvailable: Double = 145000.0,
    val totalConsultationsMonth: Int = 24,
    val pendingSettlement: Double = 32000.0,
    val isWithdrawalRequested: Boolean = false,
    val transactions: List<TransactionItem> = listOf(
        TransactionItem("1", "05/09/2026", "Carlos Benítez", 8500.0, "Acreditado", R.string.accounting_status_credited),
        TransactionItem("2", "04/09/2026", "María Gómez", 8500.0, "Acreditado", R.string.accounting_status_credited),
        TransactionItem("3", "03/09/2026", "Lucas Silva", 8500.0, "Acreditado", R.string.accounting_status_credited),
        TransactionItem("4", "02/09/2026", "Ana Rivas", 8500.0, "En proceso", R.string.accounting_status_in_process)
    ),
    val message: String? = null,
    val messageRes: Int? = null,
)

class DoctorAccountingViewModel : ViewModel() {
    private val _state = MutableStateFlow(DoctorAccountingState())
    val state: StateFlow<DoctorAccountingState> = _state.asStateFlow()

    fun requestWithdrawal() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, message = null, messageRes = null) }
            delay(1200)
            _state.update { 
                it.copy(
                    isLoading = false,
                    isWithdrawalRequested = true,
                    message = null,
                    messageRes = R.string.accounting_withdrawal_success_message,
                )
            }
        }
    }
}
