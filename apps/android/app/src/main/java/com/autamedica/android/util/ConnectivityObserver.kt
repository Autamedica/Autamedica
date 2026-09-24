package com.autamedica.android.util

import kotlinx.coroutines.flow.Flow

interface ConnectivityObserver {
    enum class Status {
        Available,
        Losing,
        Lost,
        Unavailable,
    }

    val status: Flow<Status>
    val isConnected: Boolean
}
