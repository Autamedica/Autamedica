package com.autamedica.android.presentation.main

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.platform.app.InstrumentationRegistry
import com.autamedica.android.R
import com.autamedica.android.domain.model.Appointment
import com.autamedica.android.domain.model.User
import com.autamedica.android.domain.model.UserRole
import com.autamedica.android.domain.repository.AppointmentRepository
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.ChatRepository
import com.autamedica.android.domain.repository.NotificationRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.flowOf
import org.junit.Rule
import org.junit.Test

private class FakeAuthRepository : AuthRepository {
    val sessionFlow = MutableSharedFlow<User?>(replay = 1)

    init {
        sessionFlow.tryEmit(
            User(id = "user-1", email = "ecucondor@gmail.com", role = UserRole.PATIENT)
        )
    }

    override fun observeSession(): Flow<User?> = sessionFlow
    override suspend fun login(email: String, password: String, selectedRole: UserRole?): Result<User> = Result.failure(Exception())
    override suspend fun loginWithGoogle(idToken: String, selectedRole: UserRole?): Result<User> = Result.failure(Exception())
    override suspend fun register(email: String, password: String, selectedRole: UserRole): Result<com.autamedica.android.domain.repository.UserRegistrationResult> =
        Result.success(com.autamedica.android.domain.repository.UserRegistrationResult(User(id = "user-1", email = email, role = selectedRole), false))
    override suspend fun logout() {}
    override suspend fun getCurrentUser(): User? = User(id = "user-1", email = "ecucondor@gmail.com", role = UserRole.PATIENT)
}

private class FakeChatRepository : ChatRepository {
    override fun observeChats(): Flow<List<com.autamedica.android.domain.model.MedicalChat>> = flowOf(emptyList())
    override fun observeMessages(chatId: String): Flow<List<com.autamedica.android.domain.model.MedicalMessage>> = flowOf(emptyList())
    override suspend fun sendMessage(chatId: String, content: String, contentType: String): Result<Unit> = Result.success(Unit)
    override suspend fun markAsRead(chatId: String): Result<Unit> = Result.success(Unit)
    override suspend fun getTotalUnreadCount(): Result<Int> = Result.success(0)
    override suspend fun cleanup() {}
}

private class FakeNotificationRepository : NotificationRepository {
    override suspend fun registerFcmToken(token: String): Result<Unit> = Result.success(Unit)
    override suspend fun clearFcmToken(): Result<Unit> = Result.success(Unit)
    override fun getCachedToken(): String? = "fake-fcm-token"
    override suspend fun getNotifications(limit: Int): Result<List<com.autamedica.android.domain.model.PortalNotification>> = Result.success(emptyList())
    override fun observeNotifications(): kotlinx.coroutines.flow.StateFlow<List<com.autamedica.android.domain.model.PortalNotification>> =
        kotlinx.coroutines.flow.MutableStateFlow(emptyList())
    override fun observeUnreadCount(): kotlinx.coroutines.flow.StateFlow<Int> =
        kotlinx.coroutines.flow.MutableStateFlow(0)
    override suspend fun markAsRead(id: String): Result<Unit> = Result.success(Unit)
    override suspend fun markAllAsRead(): Result<Unit> = Result.success(Unit)
    override suspend fun startRealtimeListener() {}
    override fun showLocalNotification(title: String, body: String, category: String, deepLink: String?) {}
}

private class FakeAppointmentRepository : AppointmentRepository {
    var appointments = emptyList<Appointment>()
    override suspend fun getUpcomingAppointments(): Result<List<Appointment>> = Result.success(appointments)
    override suspend fun getAppointmentById(id: String): Result<Appointment> = Result.failure(Exception())
    override suspend fun updateAppointmentNotes(id: String, notes: String): Result<Unit> = Result.success(Unit)
    override suspend fun clearCachedAppointmentsForCurrentUser(): Result<Unit> = Result.success(Unit)
    override suspend fun getAvailableDoctors(specialty: String?): Result<List<com.autamedica.android.domain.model.DoctorBookingInfo>> = Result.success(emptyList())
    override suspend fun bookAppointment(
        doctorId: String,
        startTime: String,
        endTime: String,
        type: String,
        reason: String?
    ): Result<Appointment> = Result.failure(Exception())
}

class NavigationFlowTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    private val context = InstrumentationRegistry.getInstrumentation().targetContext

    @Test
    fun testNavigationShell_showsHomeByDefault() {
        val authRepo = FakeAuthRepository()
        val chatRepo = FakeChatRepository()
        val notificationRepo = FakeNotificationRepository()
        val appointmentRepo = FakeAppointmentRepository()

        val viewModel = MainViewModel(authRepo, chatRepo, notificationRepo, appointmentRepo)

        composeTestRule.setContent {
            MainScreen(
                onNavigateToVideoCall = {},
                onNavigateToLogin = {},
                viewModel = viewModel
            )
        }

        // Context Strings
        val homeLabel = context.getString(R.string.nav_home)
        val messagesLabel = context.getString(R.string.nav_messages)
        val appointmentsLabel = context.getString(R.string.nav_appointments)
        val healthLabel = context.getString(R.string.nav_health)
        val profileLabel = context.getString(R.string.nav_profile)

        // Verify all navigation tabs are visible
        composeTestRule.onNodeWithText(homeLabel).assertIsDisplayed()
        composeTestRule.onNodeWithText(messagesLabel).assertIsDisplayed()
        composeTestRule.onNodeWithText(appointmentsLabel).assertIsDisplayed()
        composeTestRule.onNodeWithText(healthLabel).assertIsDisplayed()
        composeTestRule.onNodeWithText(profileLabel).assertIsDisplayed()

        // Default content is the Dashboard, verifying standard elements
        composeTestRule.onNodeWithText("Acciones de hoy").assertIsDisplayed()
        composeTestRule.onNodeWithText("Mi anamnesis").assertIsDisplayed()
    }

    @Test
    fun testNavigationShell_tabSwitching_updatesContentView() {
        val authRepo = FakeAuthRepository()
        val chatRepo = FakeChatRepository()
        val notificationRepo = FakeNotificationRepository()
        val appointmentRepo = FakeAppointmentRepository()

        val viewModel = MainViewModel(authRepo, chatRepo, notificationRepo, appointmentRepo)

        composeTestRule.setContent {
            MainScreen(
                onNavigateToVideoCall = {},
                onNavigateToLogin = {},
                viewModel = viewModel
            )
        }

        val appointmentsLabel = context.getString(R.string.nav_appointments)
        val healthLabel = context.getString(R.string.nav_health)
        val profileLabel = context.getString(R.string.nav_profile)

        // Switch to Appointments Tab
        composeTestRule.onNodeWithText(appointmentsLabel).performClick()
        // Verify we are inside AppointmentsScreen (looking for empty state or title text)
        composeTestRule.onNodeWithText("No tienes turnos programados").assertIsDisplayed()

        // Switch to Health Tab
        composeTestRule.onNodeWithText(healthLabel).performClick()
        // Verify we are inside HealthScreen (looking for "Mi salud" or subsections)
        composeTestRule.onNodeWithText("Chequeos Preventivos").assertIsDisplayed()

        // Switch to Profile Tab
        composeTestRule.onNodeWithText(profileLabel).performClick()
        // Verify we are inside ProfileScreen (looking for logout button)
        composeTestRule.onNodeWithText("Cerrar Sesion").assertIsDisplayed()
    }

    @Test
    fun testNavigationShell_dashboardQuickActions_redirectsToCorrectTabs() {
        val authRepo = FakeAuthRepository()
        val chatRepo = FakeChatRepository()
        val notificationRepo = FakeNotificationRepository()
        val appointmentRepo = FakeAppointmentRepository()

        val viewModel = MainViewModel(authRepo, chatRepo, notificationRepo, appointmentRepo)

        composeTestRule.setContent {
            MainScreen(
                onNavigateToVideoCall = {},
                onNavigateToLogin = {},
                viewModel = viewModel
            )
        }

        // Tap on "Ver mi salud" in the dashboard's preventive focus card
        composeTestRule.onNodeWithText("Ver mi salud").performClick()

        // Verify it redirected to Health Tab ("Chequeos Preventivos" title is visible)
        composeTestRule.onNodeWithText("Chequeos Preventivos").assertIsDisplayed()
    }
}
