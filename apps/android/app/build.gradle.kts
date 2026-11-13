import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.hilt)
    alias(libs.plugins.ksp)
    alias(libs.plugins.google.services)
    alias(libs.plugins.firebase.crashlytics)
    alias(libs.plugins.firebase.perf)
}

val localProperties = Properties().apply {
    val localPropsFile = rootProject.file("local.properties")
    if (localPropsFile.exists()) {
        load(localPropsFile.inputStream())
    }
}

fun requiredBuildProperty(name: String): String {
    return localProperties.getProperty(name)
        ?: providers.gradleProperty(name).orNull
        ?: System.getenv(name)
        ?: throw GradleException("Missing required build property: $name")
}

fun optionalBuildProperty(name: String, defaultValue: String): String {
    val prop = localProperties.getProperty(name)
        ?: providers.gradleProperty(name).orNull
        ?: System.getenv(name)
    return if (prop.isNullOrBlank()) defaultValue else prop
}

fun quoteForBuildConfig(value: String): String {
    val sanitized = value.trim().removeSurrounding("\"")
    return "\"$sanitized\""
}

android {
    namespace = "com.autamedica.android"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.autamedica.android"
        minSdk = 26
        targetSdk = 36
        versionCode = 32
        versionName = "1.2.22"

        resourceConfigurations += listOf("es", "es-rAR", "pt", "pt-rBR" )

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        buildConfigField(
            "String",
            "SUPABASE_URL",
            quoteForBuildConfig(requiredBuildProperty("SUPABASE_URL"))
        )
        buildConfigField(
            "String",
            "SUPABASE_ANON_KEY",
            quoteForBuildConfig(requiredBuildProperty("SUPABASE_ANON_KEY"))
        )
        buildConfigField(
            "String",
            "WEB_API_URL",
            quoteForBuildConfig(optionalBuildProperty("WEB_API_URL", "https://www.autamedica.com"))
        )
        buildConfigField(
            "String",
            "SIGNALING_URL",
            quoteForBuildConfig(
                optionalBuildProperty(
                    "SIGNALING_URL",
                    "wss://signaling.autamedica.com/signaling"
                )
            )
        )
        buildConfigField(
            "String",
            "GOOGLE_WEB_CLIENT_ID",
            quoteForBuildConfig(
                optionalBuildProperty(
                    "GOOGLE_WEB_CLIENT_ID",
                    "653971537811-inm445akaidgpvre8v4kabfcfe1an04q.apps.googleusercontent.com"
                )
            )
        )
        buildConfigField(
            "String",
            "TURN_URLS",
            quoteForBuildConfig(optionalBuildProperty("TURN_URLS", ""))
        )
        buildConfigField(
            "String",
            "TURN_USERNAME",
            quoteForBuildConfig(optionalBuildProperty("TURN_USERNAME", ""))
        )
        buildConfigField(
            "String",
            "TURN_CREDENTIAL",
            quoteForBuildConfig(optionalBuildProperty("TURN_CREDENTIAL", ""))
        )
    }

    signingConfigs {
        create("release") {
            val ksFile = localProperties.getProperty("RELEASE_STORE_FILE")
                ?: System.getenv("RELEASE_STORE_FILE")
            if (ksFile != null) {
                storeFile = file(ksFile)
                storePassword = localProperties.getProperty("RELEASE_STORE_PASSWORD")
                    ?: System.getenv("AUTAMEDICA_RELEASE_STORE_PASSWORD").orEmpty()
                keyAlias = localProperties.getProperty("RELEASE_KEY_ALIAS")
                    ?: System.getenv("AUTAMEDICA_RELEASE_KEY_ALIAS")
                    ?: "autamedica"
                keyPassword = localProperties.getProperty("RELEASE_KEY_PASSWORD")
                    ?: System.getenv("AUTAMEDICA_RELEASE_KEY_PASSWORD").orEmpty()
            }
        }
    }

    buildTypes {
        debug {
            val releaseConfig = signingConfigs.findByName("release")
            if (releaseConfig?.storeFile != null) {
                signingConfig = releaseConfig
            }
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            val releaseConfig = signingConfigs.findByName("release")
            if (releaseConfig?.storeFile != null) {
                signingConfig = releaseConfig
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }


    buildFeatures {
        compose = true
        buildConfig = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
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
    implementation(libs.core.splashscreen)

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
    implementation(libs.supabase.storage)

    // Ktor (required by supabase-kt)
    implementation(libs.ktor.client.okhttp)

    // One-time Google Play install attribution (pinned library version)
    implementation("com.android.installreferrer:installreferrer:2.2")

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
    implementation(libs.coil.network.okhttp)

    // Logging
    implementation(libs.timber)

    // Firebase
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)
    implementation(libs.firebase.crashlytics)
    implementation(libs.firebase.perf)
    implementation(libs.firebase.analytics)
    implementation(libs.firebase.config)

    // ML Kit (Phase 4)
    implementation(libs.mlkit.face.detection)

    // Room Database (Offline First)
    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    ksp(libs.room.compiler)

    // QR Code Generation
    implementation(libs.zxing.core)

    // Testing
    testImplementation(libs.junit)
    testImplementation(libs.mockk)
    testImplementation(libs.turbine)
    testImplementation(libs.truth)
    testImplementation(libs.robolectric)
    testImplementation(libs.coroutines.test)
    testImplementation(libs.okhttp.mockwebserver)
    androidTestImplementation(libs.compose.ui.test.junit4)
}

tasks.withType<org.gradle.api.tasks.testing.Test>().configureEach {
    testLogging {
        events(
            org.gradle.api.tasks.testing.logging.TestLogEvent.STARTED,
            org.gradle.api.tasks.testing.logging.TestLogEvent.FAILED,
        )
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
    }
}
