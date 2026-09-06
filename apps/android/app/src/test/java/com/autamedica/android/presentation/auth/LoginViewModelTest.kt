package com.autamedica.android.presentation.auth

import com.autamedica.android.domain.model.User
import com.autamedica.android.domain.model.UserRole
import com.autamedica.android.domain.repository.AuthRepository
import com.autamedica.android.domain.repository.NotificationRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test
import com.google.common.truth.Truth.assertThat

class FakeAuthRepository : AuthRepository {
    var loginResult: Result<User> = Result.failure(Exception("Not configured"))
    var currentUser: User? = null
    var loginCallCount = 0
    var lastLoginEmail: String? = null
    var lastSelectedRole: UserRole? = null

    override fun observeSession(): Flow<User?> = flowOf(currentUser)
    override suspend fun login(email: String, password: String, selectedRole: UserRole?): Result<User> {
        loginCallCount++
        lastLoginEmail = email
        lastSelectedRole = selectedRole
        return loginResult
    }
    override suspend fun loginWithGoogle(idToken: String, selectedRole: UserRole?): Result<User> {
        lastSelectedRole = selectedRole
        return loginResult
    }
    override suspend fun logout() {}
    override suspend fun getCurrentUser(): User? = currentUser
}

class FakeNotificationRepository : NotificationRepository {
    var registerResult: Result<Unit> = Result.success(Unit)
    var registeredToken: String? = null

    override suspend fun registerFcmToken(token: String): Result<Unit> {
        registeredToken = token
        return registerResult
    }
    override suspend fun clearFcmToken(): Result<Unit> = Result.success(Unit)
    override fun getCachedToken(): String? = registeredToken
}

@OptIn(ExperimentalCoroutinesApi::class)
class LoginViewModelTest {

    private val testDispatcher = UnconfinedTestDispatcher()
    private lateinit var fakeRepo: FakeAuthRepository
    private lateinit var fakeNotificationRepo: FakeNotificationRepository

    private val testUser = User(
        id = "user-123",
        email = "test@autamedica.com",
        role = UserRole.PATIENT,
    )

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        fakeRepo = FakeAuthRepository()
        fakeNotificationRepo = FakeNotificationRepository()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `initial state checks existing session and finds none`() =
        runTest(testDispatcher.scheduler) {
            val viewModel = LoginViewModel(fakeRepo, fakeNotificationRepo)

            assertThat(viewModel.uiState.value.isCheckingSession).isFalse()
            assertThat(viewModel.uiState.value.loggedInUser).isNull()
        }

    @Test
    fun `auto-login when session exists`() = runTest(testDispatcher.scheduler) {
        fakeRepo.currentUser = testUser
        val viewModel = LoginViewModel(fakeRepo, fakeNotificationRepo)

        assertThat(viewModel.uiState.value.loggedInUser).isEqualTo(testUser)
    }

    @Test
    fun `successful login sets loggedInUser`() = runTest(testDispatcher.scheduler) {
        fakeRepo.loginResult = Result.success(testUser)

        val viewModel = LoginViewModel(fakeRepo, fakeNotificationRepo)
        viewModel.onEmailChange("test@autamedica.com")
        viewModel.onPasswordChange("password123")
        viewModel.onLogin()

        assertThat(viewModel.uiState.value.loggedInUser).isEqualTo(testUser)
        assertThat(viewModel.uiState.value.isLoading).isFalse()
        assertThat(viewModel.uiState.value.error).isNull()
        assertThat(fakeRepo.lastLoginEmail).isEqualTo("test@autamedica.com")
    }

    @Test
    fun `failed login shows error`() = runTest(testDispatcher.scheduler) {
        fakeRepo.loginResult = Result.failure(Exception("invalid_credentials"))

        val viewModel = LoginViewModel(fakeRepo, fakeNotificationRepo)
        viewModel.onEmailChange("wrong@email.com")
        viewModel.onPasswordChange("wrongpassword")
        viewModel.onLogin()

        assertThat(viewModel.uiState.value.loggedInUser).isNull()
        assertThat(viewModel.uiState.value.isLoading).isFalse()
        assertThat(viewModel.uiState.value.error).isEqualTo("Correo o contraseña incorrectos")
    }

    @Test
    fun `empty email prevents login`() = runTest(testDispatcher.scheduler) {
        val viewModel = LoginViewModel(fakeRepo, fakeNotificationRepo)
        viewModel.onPasswordChange("password123")
        viewModel.onLogin()

        assertThat(fakeRepo.loginCallCount).isEqualTo(0)
    }

    @Test
    fun `email change clears error`() = runTest(testDispatcher.scheduler) {
        fakeRepo.loginResult = Result.failure(Exception("invalid_credentials"))

        val viewModel = LoginViewModel(fakeRepo, fakeNotificationRepo)
        viewModel.onEmailChange("a@b.com")
        viewModel.onPasswordChange("pass")
        viewModel.onLogin()

        assertThat(viewModel.uiState.value.error).isNotNull()

        viewModel.onEmailChange("new@email.com")
        assertThat(viewModel.uiState.value.error).isNull()
    }

    @Test
    fun `role change updates state and delegates to login`() = runTest(testDispatcher.scheduler) {
        fakeRepo.loginResult = Result.success(testUser)

        val viewModel = LoginViewModel(fakeRepo, fakeNotificationRepo)
        viewModel.onRoleChange(UserRole.DOCTOR)
        assertThat(viewModel.uiState.value.selectedRole).isEqualTo(UserRole.DOCTOR)

        viewModel.onEmailChange("doc@autamedica.com")
        viewModel.onPasswordChange("secret123")
        viewModel.onLogin()

        assertThat(fakeRepo.lastSelectedRole).isEqualTo(UserRole.DOCTOR)
    }
}
