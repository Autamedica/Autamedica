package com.autamedica.android.presentation.main

import android.content.Context
import android.content.Intent
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.autamedica.android.MainActivity
import com.autamedica.android.R
import com.autamedica.android.data.local.SecurePreferences
import com.autamedica.android.navigation.NotificationRouteResolver
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class NotificationRoutingActivityTest {

    // We use createEmptyComposeRule because ActivityScenario will manage the MainActivity lifecycle
    @get:Rule
    val composeTestRule = createEmptyComposeRule()

    private lateinit var securePreferences: SecurePreferences
    private val context: Context = ApplicationProvider.getApplicationContext()

    @Before
    fun setup() {
        securePreferences = SecurePreferences(context)
        // Clean session before each test
        securePreferences.clear()
    }

    @After
    fun tearDown() {
        securePreferences.clear()
    }

    @Test
    fun testNotificationRouting_whenLoggedOut_stopsAtLogin() {
        val intent = Intent(context, MainActivity::class.java).apply {
            putExtra(NotificationRouteResolver.EXTRA_CHAT_ROOM_ID, "chat-test-1")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }

        // Launch MainActivity with the active locale and read its resources.
        ActivityScenario.launch<MainActivity>(intent).use { scenario ->
            lateinit var loginTitle: String
            lateinit var noAccount: String
            lateinit var registerNow: String
            scenario.onActivity { activity ->
                loginTitle = activity.getString(R.string.login_title)
                noAccount = activity.getString(R.string.auth_no_account)
                registerNow = activity.getString(R.string.auth_register_now)
            }

            composeTestRule.waitForIdle()

            // Assertions use the Activity locale, not hard-coded Spanish text or
            // the application context, which may have a different configuration.
            composeTestRule.onNodeWithText(loginTitle).assertIsDisplayed()
            composeTestRule.onNodeWithText(noAccount, substring = true).assertIsDisplayed()
            composeTestRule.onNodeWithText(registerNow, substring = true).assertIsDisplayed()
        }
    }

    @Test
    fun testNotificationRouting_whenLoggedIn_routesToChatConversation() {
        // Hydrate preferences to simulate logged-in patient session
        securePreferences.putString(SecurePreferences.KEY_USER_ID, "user-patient-1")
        securePreferences.putString(SecurePreferences.KEY_USER_ROLE, "patient")

        val intent = Intent(context, MainActivity::class.java).apply {
            putExtra(NotificationRouteResolver.EXTRA_CHAT_ROOM_ID, "chat-test-1")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }

        ActivityScenario.launch<MainActivity>(intent).use {
            composeTestRule.waitForIdle()

            // Verify the chat screen is loaded and it shows the text field / action buttons
            composeTestRule.onNodeWithText("Escribe un mensaje...").assertIsDisplayed()
        }
    }

    @Test
    fun testNotificationRouting_whenLoggedIn_routesToVideoCall() {
        // Hydrate preferences to simulate logged-in patient session
        securePreferences.putString(SecurePreferences.KEY_USER_ID, "user-patient-1")
        securePreferences.putString(SecurePreferences.KEY_USER_ROLE, "patient")

        val intent = Intent(context, MainActivity::class.java).apply {
            putExtra(NotificationRouteResolver.EXTRA_APPOINTMENT_ID, "app-test-123")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }

        ActivityScenario.launch<MainActivity>(intent).use {
            composeTestRule.waitForIdle()

            // Verify it routed to VideoCallScreen
            composeTestRule.onNodeWithText("Conectando con la sala...").assertIsDisplayed()
        }
    }
}
