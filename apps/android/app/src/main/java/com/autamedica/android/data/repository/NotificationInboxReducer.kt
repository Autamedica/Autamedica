package com.autamedica.android.data.repository

import com.autamedica.android.domain.model.PortalNotification

/**
 * Realtime can replay an INSERT already returned by a previous inbox fetch.
 * Keep the original record (including readAt) when the server ID is known.
 */
internal fun addPortalNotificationIfNew(
    current: List<PortalNotification>,
    incoming: PortalNotification,
): List<PortalNotification> =
    if (current.any { it.id == incoming.id }) current else listOf(incoming) + current
