package com.autamedica.android.presentation.theme

import android.app.Activity
import android.os.Build
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

/**
 * AutaMedica clinical theme — matching the clean web design system (globals.css / auth.css).
 * High-contrast white surfaces + role-based portal accents.
 */
private val AutamedicaScheme = lightColorScheme(
    // Core surfaces
    background = AuBackground,
    surface = AuSurface,
    surfaceVariant = AuSurfaceHover,
    surfaceDim = AuHover,

    // Text
    onBackground = AuTextPrimary,
    onSurface = AuTextPrimary,
    onSurfaceVariant = AuTextSecondary,

    // Primary (sky-500 matching web)
    primary = PortalPatients,
    onPrimary = Color.White,
    primaryContainer = PortalPatientsSoft,
    onPrimaryContainer = PortalPatients,

    // Secondary (cyan-600 doctor accent)
    secondary = PortalDoctors,
    onSecondary = Color.White,
    secondaryContainer = PortalDoctorsSoft,
    onSecondaryContainer = PortalDoctors,

    // Tertiary (emerald-600 pharmacy accent)
    tertiary = PortalPharmacists,
    onTertiary = Color.White,
    tertiaryContainer = PortalPharmacistsSoft,
    onTertiaryContainer = PortalPharmacists,

    // Error
    error = AuDanger,
    onError = Color.White,
    errorContainer = ErrorContainer,
    onErrorContainer = AuDanger,

    // Borders/outlines
    outline = AuBorder,
    outlineVariant = AuBorderHover,

    // Inverse
    inverseSurface = AuTextPrimary,
    inverseOnSurface = AuBackground,
    inversePrimary = Primary,
)

@Composable
fun AutamedicaTheme(
    content: @Composable () -> Unit,
) {
    val colorScheme = AutamedicaScheme

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            @Suppress("DEPRECATION")
            window.statusBarColor = Color.Transparent.toArgb()
            @Suppress("DEPRECATION")
            window.navigationBarColor = Color.Transparent.toArgb()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                window.isNavigationBarContrastEnforced = false
            }
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = true
                isAppearanceLightNavigationBars = true
            }
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = AutamedicaTypography,
        content = content,
    )
}
