plugins {
    id("com.android.application")
}

android {
    namespace = "com.autamedica.companion"
    compileSdk = 35
    buildFeatures {
        buildConfig = true
    }

    defaultConfig {
        applicationId = "com.autamedica.companion"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
            buildConfigField("int", "CONTROL_PORT", "18765")
            buildConfigField("int", "CDP_PORT", "18766")
        }
        create("repair") {
            initWith(getByName("debug"))
            applicationIdSuffix = ".repair2"
            versionNameSuffix = "-repair2"
            buildConfigField("int", "CONTROL_PORT", "18775")
            buildConfigField("int", "CDP_PORT", "18776")
            matchingFallbacks += listOf("debug")
        }
        release {
            isMinifyEnabled = false
            buildConfigField("int", "CONTROL_PORT", "18765")
            buildConfigField("int", "CDP_PORT", "18766")
        }
    }
}
