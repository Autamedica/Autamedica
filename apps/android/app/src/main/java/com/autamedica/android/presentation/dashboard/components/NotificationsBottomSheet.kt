package com.autamedica.android.presentation.dashboard.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Forum
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.domain.model.PortalNotification
import com.autamedica.android.presentation.theme.AuAccent
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import java.time.Duration
import java.time.Instant

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsBottomSheet(
    notifications: List<PortalNotification>,
    unreadCount: Int,
    onDismiss: () -> Unit,
    onNotificationClick: (PortalNotification) -> Unit,
    onMarkAllAsRead: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = Color.White,
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
        modifier = modifier,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .padding(bottom = 32.dp),
        ) {
            // Header: Title + Unread badge + Mark all read button
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .clip(CircleShape)
                            .background(Color(0xFFF1F5F9)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Notifications,
                            contentDescription = null,
                            tint = Color(0xFF0F172A),
                            modifier = Modifier.size(20.dp),
                        )
                    }

                    Spacer(modifier = Modifier.width(10.dp))

                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = "Notificaciones",
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Bold,
                                color = AuTextPrimary,
                            )
                            if (unreadCount > 0) {
                                Spacer(modifier = Modifier.width(8.dp))
                                Surface(
                                    shape = RoundedCornerShape(999.dp),
                                    color = Color(0xFFEF4444).copy(alpha = 0.12f),
                                ) {
                                    Text(
                                        text = "$unreadCount ${if (unreadCount == 1) "nueva" else "nuevas"}",
                                        color = Color(0xFFDC2626),
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                                    )
                                }
                            }
                        }
                        Text(
                            text = "Turnos, recetas y avisos en tiempo real",
                            fontSize = 12.sp,
                            color = AuTextTertiary,
                        )
                    }
                }

                if (unreadCount > 0) {
                    TextButton(
                        onClick = onMarkAllAsRead,
                        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Check,
                            contentDescription = null,
                            tint = Color(0xFF0284C7),
                            modifier = Modifier.size(16.dp),
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = "Leer todas",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFF0284C7),
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Notifications List
            if (notifications.isEmpty()) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 40.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Box(
                        modifier = Modifier
                            .size(56.dp)
                            .clip(CircleShape)
                            .background(Color(0xFFF1F5F9)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.CheckCircle,
                            contentDescription = null,
                            tint = Color(0xFF10B981),
                            modifier = Modifier.size(32.dp),
                        )
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = "Estás al día",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = AuTextPrimary,
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "No tenés notificaciones pendientes.",
                        fontSize = 13.sp,
                        color = AuTextSecondary,
                    )
                }
            } else {
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    items(notifications, key = { it.id }) { item ->
                        NotificationCard(
                            notification = item,
                            onClick = { onNotificationClick(item) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun NotificationCard(
    notification: PortalNotification,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val isUnread = !notification.isRead
    val (icon, bgTint, iconTint) = resolveCategoryStyle(notification.category)

    Surface(
        shape = RoundedCornerShape(16.dp),
        color = if (isUnread) Color(0xFFF8FAFC) else Color.White,
        border = BorderStroke(
            1.dp,
            if (isUnread) Color(0xFFBAE6FD) else Color(0xFFF1F5F9),
        ),
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .clickable(onClick = onClick),
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.Top,
        ) {
            // Icon Pill
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(bgTint),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = iconTint,
                    modifier = Modifier.size(20.dp),
                )
            }

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = notification.title,
                        fontSize = 13.5.sp,
                        fontWeight = if (isUnread) FontWeight.Bold else FontWeight.SemiBold,
                        color = AuTextPrimary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false),
                    )

                    Row(verticalAlignment = Alignment.CenterVertically) {
                        val timeStr = formatRelativeTime(notification.createdAt)
                        if (timeStr.isNotBlank()) {
                            Text(
                                text = timeStr,
                                fontSize = 11.sp,
                                color = AuTextTertiary,
                            )
                        }
                        if (isUnread) {
                            Spacer(modifier = Modifier.width(6.dp))
                            Box(
                                modifier = Modifier
                                    .size(8.dp)
                                    .clip(CircleShape)
                                    .background(AuAccent),
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(4.dp))

                Text(
                    text = notification.body,
                    fontSize = 12.5.sp,
                    color = if (isUnread) Color(0xFF334155) else AuTextSecondary,
                    lineHeight = 17.sp,
                )

                if (!notification.actionLabel.isNullOrBlank()) {
                    Spacer(modifier = Modifier.height(10.dp))
                    Button(
                        onClick = onClick,
                        shape = RoundedCornerShape(999.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color(0xFF0F172A),
                            contentColor = Color.White,
                        ),
                        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp),
                        modifier = Modifier.height(34.dp),
                    ) {
                        Text(
                            text = notification.actionLabel,
                            fontSize = 11.5.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                            contentDescription = null,
                            modifier = Modifier.size(13.dp),
                        )
                    }
                }
            }
        }
    }
}

private data class CategoryStyle(
    val icon: ImageVector,
    val bgTint: Color,
    val iconTint: Color,
)

private fun resolveCategoryStyle(category: String?): CategoryStyle {
    return when (category?.lowercase()) {
        "appointment" -> CategoryStyle(
            icon = Icons.Outlined.CalendarMonth,
            bgTint = Color(0xFFE0F2FE),
            iconTint = Color(0xFF0284C7),
        )
        "prescription" -> CategoryStyle(
            icon = Icons.Outlined.Description,
            bgTint = Color(0xFFEDE9FE),
            iconTint = Color(0xFF6366F1),
        )
        "message", "chat" -> CategoryStyle(
            icon = Icons.Outlined.Forum,
            bgTint = Color(0xFFCCFBF1),
            iconTint = Color(0xFF0D9488),
        )
        else -> CategoryStyle(
            icon = Icons.Outlined.Notifications,
            bgTint = Color(0xFFFEF3C7),
            iconTint = Color(0xFFD97706),
        )
    }
}

private fun formatRelativeTime(dateStr: String?): String {
    if (dateStr.isNullOrBlank()) return ""
    return runCatching {
        val instant = Instant.parse(dateStr)
        val duration = Duration.between(instant, Instant.now())
        val mins = duration.toMinutes()
        when {
            mins < 1 -> "Ahora"
            mins < 60 -> "Hace ${mins}m"
            mins < 1440 -> "Hace ${duration.toHours()}h"
            else -> "Hace ${duration.toDays()}d"
        }
    }.getOrElse { "" }
}
