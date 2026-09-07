package com.autamedica.android.presentation.patients.reproductive

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class ReproductiveHealthState(
    val activeTab: ReproductiveTab = ReproductiveTab.OVERVIEW,
    val showUrgentContact: Boolean = false
)

enum class ReproductiveTab(val label: String) {
    OVERVIEW("Qué es la IVE"),
    RIGHTS("Derechos"),
    PROCEDURES("Métodos"),
    DOCTORS("Médicos"),
    SUPPORT("Apoyo")
}

class ReproductiveHealthViewModel : ViewModel() {
    private val _state = MutableStateFlow(ReproductiveHealthState())
    val state: StateFlow<ReproductiveHealthState> = _state.asStateFlow()

    fun setTab(tab: ReproductiveTab) {
        _state.value = _state.value.copy(activeTab = tab)
    }

    fun setShowUrgentContact(show: Boolean) {
        _state.value = _state.value.copy(showUrgentContact = show)
    }
}
