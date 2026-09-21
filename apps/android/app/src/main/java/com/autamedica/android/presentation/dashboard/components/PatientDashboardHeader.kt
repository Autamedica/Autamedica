package com.autamedica.android.presentation.dashboard.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.MonetizationOn
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.presentation.theme.AuAccent
import com.autamedica.android.presentation.theme.AuBorder
import com.autamedica.android.presentation.theme.AuSurface
import com.autamedica.android.presentation.theme.AuSurfaceHover
import com.autamedica.android.presentation.theme.AuTextPrimary
import com.autamedica.android.presentation.theme.AuTextSecondary
import com.autamedica.android.presentation.theme.AuTextTertiary
import com.autamedica.android.presentation.theme.PortalPatients
import java.text.NumberFormat
import java.util.Locale

@Composable
fun PatientDashboardHeader(
    userName: String,
    subscriptionTier: String,
    subscriptionStatus: String,
    walletBalanceCents: Long,
    hasUpcomingAppointment: Boolean,
    unreadNotificationsCount: Int = 0,
    onWalletClick: () -> Unit,
    onNotificationsClick: () -> Unit,
    onProfileClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val firstName = userName.split(" ").firstOrNull()?.ifBlank { "Paciente" } ?: "Paciente"
    val initial = firstName.firstOrNull()?.uppercase() ?: "P"

    Surface(
        modifier = modifier.fillMaxWidth(),
        color = Color.White.copy(alpha = 0.95f),
        border = BorderStroke(1.dp, Color(0xFFF1F5F9)),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Left: Avatar + Name + Tier Badge
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .weight(1f, fill = false)
                    .sizeIn(minWidth = 48.dp, minHeight = 48.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .clickable(
                        onClickLabel = "Ver perfil de $firstName",
                        onClick = onProfileClick,
                    )
                    .padding(4.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(38.dp)
                        .clip(CircleShape)
                        .background(PortalPatients),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = initial,
                        color = Color.White,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }

                Spacer(modifier = Modifier.width(10.dp))

                Text(
                    text = firstName,
                    style = MaterialTheme.typography.titleMedium,
                    color = AuTextPrimary,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
            }

            // Right: Wallet Button + Notification Bell
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                val walletText = formatCents(walletBalanceCents)

                // Wallet chip (48dp min touch target)
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = Color(0xFFF8FAFC),
                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                    modifier = Modifier
                        .sizeIn(minWidth = 48.dp, minHeight = 48.dp)
                        .clip(RoundedCornerShape(999.dp))
                        .clickable(
                            onClickLabel = "Ver saldo disponible en billetera",
                            onClick = onWalletClick,
                        ),
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.AccountBalanceWallet,
                            contentDescription = "Billetera: $walletText",
                            modifier = Modifier.size(16.dp),
                            tint = Color(0xFF475569),
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = walletText,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFF1E293B),
                        )
                    }
                }

                // Notification Bell with unread indicator (48dp touch target)
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier.size(48.dp),
                ) {
                    IconButton(
                        onClick = onNotificationsClick,
                        modifier = Modifier.size(48.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Notifications,
                            contentDescription = if (hasUpcomingAppointment) "Notificaciones, tienes un turno próximo" else "Notificaciones",
                            tint = AuTextSecondary,
                            modifier = Modifier.size(22.dp),
                        )
                    }
                    if (unreadNotificationsCount > 0) {
                        Box(
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .padding(top = 4.dp, end = 4.dp)
                                .sizeIn(minWidth = 16.dp, minHeight = 16.dp)
                                .clip(CircleShape)
                                .background(Color(0xFFDC2626)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                text = if (unreadNotificationsCount > 9) "9+" else unreadNotificationsCount.toString(),
                                color = Color.White,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 3.dp),
                            )
                        }
                    } else if (hasUpcomingAppointment) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .align(Alignment.TopEnd)
                                .padding(top = 8.dp, end = 8.dp)
                                .clip(CircleShape)
                                .background(AuAccent),
                        )
                    }
                }
            }
        }
    }
}

fun formatCents(cents: Long): String {
    val amount = cents / 100.0
    return NumberFormat.getCurrencyInstance(Locale.getDefault()).apply {
        maximumFractionDigits = 0
    }.format(amount)
}
