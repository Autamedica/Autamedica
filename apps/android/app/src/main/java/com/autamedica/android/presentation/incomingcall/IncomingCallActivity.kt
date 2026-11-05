package com.autamedica.android.presentation.incomingcall

import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.content.pm.ActivityInfo
import android.graphics.Bitmap
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autamedica.android.MainActivity
import com.autamedica.android.util.CareCountryLocale
import com.autamedica.android.R
import com.autamedica.android.domain.model.NotificationType
import com.autamedica.android.domain.repository.TelemedicineRepository
import com.autamedica.android.navigation.NotificationRouteResolver
import com.autamedica.android.presentation.theme.AutamedicaTheme
import com.autamedica.android.service.IncomingCallNotificationManager
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

private val CallSurface = Color(0xFF0F172A)
private val CallGlow = Color(0xFF0284C7)
private val CallHighlight = Color(0xFF38BDF8)
private val CallAccent = Color(0xFF0EA5E9)
private val BrandObsidian = Color(0xFF09090B)
private val BrandRing = Color(0x1AFFFFFF)
private val PillText = Color(0xFFF1F5F9)
private val MutedText = Color(0xFF94A3B8)
private val SuccessDot = Color(0xFF22C55E)

@AndroidEntryPoint
class IncomingCallActivity : ComponentActivity() {

    @Inject
    lateinit var telemedicineRepository: TelemedicineRepository

    override fun attachBaseContext(newBase: Context) {
        super.attachBaseContext(CareCountryLocale.wrap(newBase))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        }
        @Suppress("DEPRECATION")
        window.addFlags(
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
            WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val keyguardManager = getSystemService(KeyguardManager::class.java)
            keyguardManager?.requestDismissKeyguard(this, null)
        }
        enableEdgeToEdge()
        setContent {
            AutamedicaTheme {
                IncomingCallContent(
                    callerName = intent.getStringExtra(IncomingCallNotificationManager.EXTRA_CALLER_NAME).orEmpty()
                        .ifBlank { getString(R.string.notification_incoming_call_title) },
                    avatarUrl = intent.getStringExtra(IncomingCallNotificationManager.EXTRA_CALLER_AVATAR_URL).orEmpty(),
                    onAnswer = { answer() },
                    onDecline = { decline() },
                )
            }
        }
    }

    private fun answer() {
        val rawNotificationType = intent.getStringExtra(NotificationRouteResolver.EXTRA_NOTIFICATION_TYPE).orEmpty()
        val appointmentId = intent.getStringExtra(IncomingCallNotificationManager.EXTRA_APPOINTMENT_ID).orEmpty()
        val callId = intent.getStringExtra(IncomingCallNotificationManager.EXTRA_CALL_ID).orEmpty()
        val roomId = intent.getStringExtra(IncomingCallNotificationManager.EXTRA_ROOM_ID).orEmpty()
        val notificationId = intent.getIntExtra(IncomingCallNotificationManager.EXTRA_NOTIFICATION_ID, -1)

        IncomingCallNotificationManager.stopRingtone()
        IncomingCallNotificationManager.dismissCall(this, notificationId)

        val isDispatchCall = rawNotificationType == NotificationType.PHARMACY_DISPATCH_INCOMING.name ||
            rawNotificationType.equals("pharmacy_dispatch_incoming", ignoreCase = true)

        val resolvedId = callId.ifBlank { appointmentId }
        if (resolvedId.isNotBlank() && !isDispatchCall) {
            CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
                try {
                    telemedicineRepository.updateCallStatus(resolvedId, "accepted")
                } catch (e: Exception) {
                    Timber.e(e, "[IncomingCall] Failed updating call status to accepted for $resolvedId")
                }
            }
        }

        // Navigate to the VideoCall screen via MainActivity
        // For on-demand pharmacy dispatch or direct room calls: appointmentId = '', roomId = roomId, isIncomingCall = true
        val resolvedAppointmentId = if (isDispatchCall) "" else appointmentId
        val launchIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                Intent.FLAG_ACTIVITY_SINGLE_TOP
            action = IncomingCallNotificationManager.ACTION_ANSWER_CALL
            putExtra(NotificationRouteResolver.EXTRA_APPOINTMENT_ID, resolvedAppointmentId)
            putExtra(NotificationRouteResolver.EXTRA_ROOM_ID, roomId)
            putExtra(
                NotificationRouteResolver.EXTRA_NOTIFICATION_TYPE,
                if (isDispatchCall) NotificationType.PHARMACY_DISPATCH_INCOMING.name else "CALL_STARTED"
            )
            putExtra(IncomingCallNotificationManager.EXTRA_CALL_ID, callId)
            putExtra(IncomingCallNotificationManager.EXTRA_IS_INCOMING_CALL, true)
        }
        startActivity(launchIntent)
        finish()
    }

    private fun decline() {
        val appointmentId = intent.getStringExtra(IncomingCallNotificationManager.EXTRA_APPOINTMENT_ID).orEmpty()
        val callId = intent.getStringExtra(IncomingCallNotificationManager.EXTRA_CALL_ID).orEmpty()
        val notificationId = intent.getIntExtra(IncomingCallNotificationManager.EXTRA_NOTIFICATION_ID, -1)
        val resolvedId = callId.ifBlank { appointmentId }

        IncomingCallNotificationManager.stopRingtone()
        IncomingCallNotificationManager.dismissCall(this, notificationId)

        if (resolvedId.isNotBlank()) {
            CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
                try {
                    telemedicineRepository.updateCallStatus(resolvedId, "declined")
                } catch (e: Exception) {
                    Timber.e(e, "[IncomingCall] Failed updating call status to declined for $resolvedId")
                }
            }
        }
        finish()
    }
}

@Composable
private fun IncomingCallContent(
    callerName: String,
    avatarUrl: String,
    onAnswer: () -> Unit,
    onDecline: () -> Unit,
) {
    var avatarBitmap by remember { mutableStateOf<Bitmap?>(null) }

    LaunchedEffect(avatarUrl) {
        if (avatarUrl.isNotBlank()) {
            avatarBitmap = IncomingCallNotificationManager.loadCircularAvatarCompat(avatarUrl)
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(CallSurface),
    ) {
        // Radial sky glow over deep navy (matches TelemedicineHeroCard)
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.radialGradient(
                        colors = listOf(
                            CallGlow.copy(alpha = 0.35f),
                            CallSurface,
                        ),
                    ),
                ),
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 24.dp, vertical = 40.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            AutamedicaBrandLockup()

            Spacer(Modifier.height(40.dp))

            CallerAvatar(
                avatarBitmap = avatarBitmap,
                callerName = callerName,
            )

            Spacer(Modifier.height(28.dp))

            Text(
                text = callerName,
                color = Color.White,
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            )

            Spacer(Modifier.height(6.dp))

            Text(
                text = "Videollamada para tu consulta",
                color = MutedText,
                fontSize = 16.sp,
            )

            Spacer(Modifier.height(22.dp))

            SecureCallPill()

            Spacer(Modifier.weight(1f))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Button(
                    onClick = onDecline,
                    modifier = Modifier
                        .weight(1f)
                        .height(64.dp),
                    shape = RoundedCornerShape(16.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFDC2626)),
                ) {
                    Text("Rechazar", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                }

                Button(
                    onClick = onAnswer,
                    modifier = Modifier
                        .weight(1f)
                        .height(64.dp),
                    shape = RoundedCornerShape(16.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF16A34A)),
                ) {
                    Text("Atender", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun AutamedicaBrandLockup() {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Surface(
            modifier = Modifier.size(64.dp),
            shape = RoundedCornerShape(20.dp),
            color = BrandObsidian,
            border = BorderStroke(1.dp, BrandRing),
            shadowElevation = 12.dp,
        ) {
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier.fillMaxSize(),
            ) {
                Image(
                    painter = painterResource(id = R.drawable.logo_autamedica),
                    contentDescription = "AutaMedica",
                    modifier = Modifier
                        .size(52.dp)
                        .clip(RoundedCornerShape(12.dp)),
                    contentScale = ContentScale.Fit,
                )
            }
        }

        Spacer(Modifier.height(10.dp))

        Text(
            text = "AutaMedica",
            color = Color.White,
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.3.sp,
        )

        Spacer(Modifier.height(4.dp))

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(SuccessDot),
            )
            Text(
                text = "Llamada entrante",
                color = PillText,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
            )
        }
    }
}

@Composable
private fun CallerAvatar(
    avatarBitmap: Bitmap?,
    callerName: String,
) {
    val transition = rememberInfiniteTransition(label = "caller_pulse")
    val pulseAlpha by transition.animateFloat(
        initialValue = 0.35f,
        targetValue = 0f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1600),
            repeatMode = RepeatMode.Restart,
        ),
        label = "caller_pulse_alpha",
    )

    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .size(200.dp)
            .background(
                Brush.radialGradient(
                    colors = listOf(CallGlow.copy(alpha = 0.30f), Color.Transparent),
                ),
            ),
    ) {
        // Pulsing halo rings (telemedicine presence)
        Box(
            modifier = Modifier
                .size(180.dp)
                .border(2.dp, CallHighlight.copy(alpha = pulseAlpha * 0.6f), CircleShape),
        )
        Box(
            modifier = Modifier
                .size(150.dp)
                .border(2.dp, CallHighlight.copy(alpha = pulseAlpha * 0.9f), CircleShape),
        )

        Box(
            modifier = Modifier
                .size(120.dp)
                .clip(CircleShape)
                .background(Color(0xFF1E293B))
                .border(3.dp, CallHighlight.copy(alpha = 0.9f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            val bitmap = avatarBitmap
            if (bitmap != null) {
                Image(
                    bitmap = bitmap.asImageBitmap(),
                    contentDescription = callerName,
                    modifier = Modifier
                        .fillMaxSize()
                        .clip(CircleShape),
                    contentScale = ContentScale.Crop,
                )
            } else {
                val initials = callerName
                    .replace("Dr.", "", ignoreCase = true)
                    .replace("Dra.", "", ignoreCase = true)
                    .trim()
                    .split("\\s+".toRegex())
                    .filter { it.isNotBlank() }
                    .take(2)
                    .map { it.first().uppercaseChar() }
                    .joinToString("")
                    .ifBlank { "DR" }

                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            Brush.linearGradient(
                                colors = listOf(Color(0xFF0284C7), Color(0xFF0369A1))
                            )
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = initials,
                        color = Color.White,
                        fontSize = 38.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.sp,
                    )
                }
            }
        }
    }
}

@Composable
private fun SecureCallPill() {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(Color(0x66000000))
            .border(1.dp, Color(0x33FFFFFF), RoundedCornerShape(50))
            .padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Icon(
            imageVector = Icons.Default.Lock,
            contentDescription = null,
            modifier = Modifier.size(14.dp),
            tint = CallHighlight.copy(alpha = 0.8f),
        )
        Text(
            text = "Videollamada segura · cifrada",
            color = MutedText,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
        )
    }
}