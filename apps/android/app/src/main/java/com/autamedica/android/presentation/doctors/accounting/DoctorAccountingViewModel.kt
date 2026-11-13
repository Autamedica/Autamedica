package com.autamedica.android.presentation.doctors.accounting

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.DoctorRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.time.LocalDate
import java.time.ZoneId

/**
 * Amounts from doctor_earnings are stored in minor currency units (centavos).
 * The accounting screen does not offer withdrawals: no payout API is connected here.
 */
data class TransactionItem(
    val id: String,
    val date: String,
    val amountCents: Long,
    val currency: String,
    val status: String,
)

data class DoctorAccountingState(
    val isLoading: Boolean = true,
    val totalConsultationsMonth: Int = 0,
    val paidAmountCents: Long = 0,
    val pendingSettlementCents: Long = 0,
    val currency: String? = null,
    val transactions: List<TransactionItem> = emptyList(),
    val error: String? = null,
)

@Serializable
private data class DoctorEarningRow(
    val id: String,
    @SerialName("net_amount") val netAmount: Long,
    val currency: String,
    val status: String,
    @SerialName("created_at") val createdAt: String,
)

@Serializable
private data class CompletedAppointmentId(val id: String)

@HiltViewModel
class DoctorAccountingViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val doctorRepository: DoctorRepository,
    private val supabaseClient: SupabaseClient,
) : ViewModel() {
    private val _state = MutableStateFlow(DoctorAccountingState())
    val state: StateFlow<DoctorAccountingState> = _state.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            runCatching {
                val user = authRepository.getCurrentUser()
                    ?: error("Debe iniciar sesión para consultar sus honorarios.")
                val doctor = doctorRepository.getDoctorProfile(user.id).getOrThrow()

                // Authenticated/RLS-limited query, further scoped to the current doctor.
                val earnings = supabaseClient.postgrest.from("doctor_earnings")
                    .select(Columns.list("id", "net_amount", "currency", "status", "created_at")) {
                        filter { eq("doctor_id", doctor.id) }
                        order("created_at", Order.DESCENDING)
                    }
                    .decodeList<DoctorEarningRow>()

                val currencies = earnings.map { it.currency }.distinct()
                require(currencies.size <= 1) {
                    "Existen liquidaciones en varias monedas; deben consultarse por separado."
                }

                val monthStart = LocalDate.now().withDayOfMonth(1)
                    .atStartOfDay(ZoneId.systemDefault()).toOffsetDateTime()
                val nextMonthStart = monthStart.plusMonths(1)
                val completedMonth = supabaseClient.postgrest.from("appointments")
                    .select(Columns.list("id")) {
                        filter {
                            eq("doctor_id", doctor.id)
                            eq("status", "completed")
                            gte("start_time", monthStart.toString())
                            lt("start_time", nextMonthStart.toString())
                        }
                    }
                    .decodeList<CompletedAppointmentId>().size

                DoctorAccountingState(
                    isLoading = false,
                    totalConsultationsMonth = completedMonth,
                    paidAmountCents = earnings.filter { it.status == "paid" }.sumOf { it.netAmount },
                    pendingSettlementCents = earnings.filter {
                        it.status == "pending" || it.status == "approved" || it.status == "processing"
                    }.sumOf { it.netAmount },
                    currency = currencies.singleOrNull(),
                    transactions = earnings.map {
                        TransactionItem(
                            id = it.id,
                            date = it.createdAt.take(10),
                            amountCents = it.netAmount,
                            currency = it.currency,
                            status = it.status,
                        )
                    },
                )
            }.onSuccess { loaded ->
                _state.value = loaded
            }.onFailure {
                _state.value = DoctorAccountingState(
                    isLoading = false,
                    error = "No se pudieron verificar las liquidaciones. Reintentá la consulta.",
                )
            }
        }
    }
}
