import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.hilt)
    alias(libs.plugins.ksp)
}

val localProperties = Properties().apply {
    val localPropsFile = rootProject.file("local.properties")
    if (localPropsFile.exists()) {
        load(localPropsFile.inputStream())
    }
}

android {
    namespace = "com.autamedica.android"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.autamedica.android"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        buildConfigField(
            "String",
            "SUPABASE_URL",
            "\"${localProperties.getProperty("SUPABASE_URL", "https://qxjjrpksmwwrmubhvjew.supabase.co")}\""
        )
        buildConfigField(
            "String",
            "SUPABASE_ANON_KEY",
            "\"${localProperties.getProperty("SUPABASE_ANON_KEY", "")}\""
        )
        buildConfigField(
            "String",
            "SIGNALING_URL",
            "\"${localProperties.getProperty("SIGNALING_URL", "wss://autamedica-signaling-server.marques-eduardo95466020.workers.dev/signaling")}\""
        )
        buildConfigField(
            "String",
            "GOOGLE_WEB_CLIENT_ID",
            "\"${localProperties.getProperty("GOOGLE_WEB_CLIENT_ID", "491151556566-6h58b6279rdq05rs65smol0lq8uoue48.apps.googleusercontent.com")}\""
        )
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    // Compose BOM
    val composeBom = platform(libs.compose.bom)
    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation(libs.compose.ui)
    implementation(libs.compose.ui.graphics)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons)
    debugImplementation(libs.compose.ui.tooling)
    debugImplementation(libs.compose.ui.test.manifest)

    // Core
    implementation(libs.core.ktx)
    implementation(libs.activity.compose)

    // Navigation
    implementation(libs.navigation.compose)

    // Lifecycle
    implementation(libs.lifecycle.runtime.compose)
    implementation(libs.lifecycle.viewmodel.compose)

    // Hilt
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.hilt.navigation.compose)

    // Supabase
    implementation(platform(libs.supabase.bom))
    implementation(libs.supabase.auth)
    implementation(libs.supabase.postgrest)
    implementation(libs.supabase.realtime)
    implementation(libs.supabase.functions)

    // Ktor (required by supabase-kt)
    implementation(libs.ktor.client.android)

    // Network
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)

    // WebRTC
    implementation(libs.webrtc)

    // Serialization
    implementation(libs.kotlinx.serialization)

    // Coroutines
    implementation(libs.coroutines.android)

    // Google Sign-In (Credential Manager)
    implementation(libs.credentials)
    implementation(libs.credentials.play.services)
    implementation(libs.googleid)

    // Security
    implementation(libs.security.crypto)
    implementation(libs.biometric)

    // Image loading
    implementation(libs.coil.compose)

    // Logging
    implementation(libs.timber)

    // Testing
    testImplementation(libs.junit)
    testImplementation(libs.mockk)
    testImplementation(libs.turbine)
    testImplementation(libs.truth)
    testImplementation(libs.coroutines.test)
    androidTestImplementation(libs.compose.ui.test.junit4)
}
