package com.autamedica.android.presentation.ondemand

import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.autamedica.android.MainActivity
import com.autamedica.android.navigation.NotificationRouteResolver
import com.autamedica.android.presentation.theme.AutamedicaTheme
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class OnDemandEntryActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        }
        enableEdgeToEdge()

        val initialTier = extractTierFromIntent(intent)
        val initialInQueue = intent?.getBooleanExtra("in_queue", false) == true ||
            intent?.getStringExtra("step") == "queue"

        setContent {
            androidx.compose.material3.MaterialTheme {
                OnDemandEntryScreen(
                    initialTier = initialTier,
                    initialInQueue = initialInQueue,
                    onBack = { finish() },
                    onJoinCall = { roomId ->
                        launchCallInMainActivity(roomId)
                    },
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
    }

    private fun extractTierFromIntent(intent: Intent?): String {
        if (intent == null) return "general"
        val uri = intent.data
        val tierParam = uri?.getQueryParameter("tier")?.trim()?.lowercase()
        if (!tierParam.isNullOrEmpty()) {
            return tierParam
        }
        val data = intent.dataString ?: return "general"
        val clean = data.substringAfter("://").substringBefore('?').substringBefore('#').trim('/')
        val parts = clean.split('/').filter { it.isNotBlank() }
        val nonKeywords = parts.map { it.lowercase() }.filter {
            it != "on-demand" && it != "ondemand" && it != "express" && it != "intake" && it != "entry"
        }
        return nonKeywords.firstOrNull() ?: "general"
    }

    private fun launchCallInMainActivity(roomId: String) {
        val launchIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(NotificationRouteResolver.EXTRA_ROOM_ID, roomId)
            putExtra(NotificationRouteResolver.EXTRA_NOTIFICATION_TYPE, "CALL_STARTED")
            putExtra("is_on_demand", true)
        }
        startActivity(launchIntent)
        finish()
    }
}
