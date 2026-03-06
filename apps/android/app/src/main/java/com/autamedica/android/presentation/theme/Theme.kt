package com.autamedica.android.presentation.theme

import android.app.Activity
import android.os.Build
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

/**
 * AutaMedica dark theme — matching the landing page design.
 * Uses Zinc palette + portal accent colors.
 */
private val AutamedicaDarkScheme = darkColorScheme(
    // Core surfaces
    background = AuBackground,
    surface = AuSurface,
    surfaceVariant = AuSurfaceHover,
    surfaceDim = AuHover,

    // Text
    onBackground = AuTextPrimary,
    onSurface = AuTextPrimary,
    onSurfaceVariant = AuTextSecondary,

    // Primary (blue — portals/CTAs)
    primary = PrimaryLight,
    onPrimary = OnPrimary,
    primaryContainer = PrimaryContainer,
    onPrimaryContainer = PrimaryLight,

    // Secondary (sky — patient accent)
    secondary = Secondary,
    onSecondary = OnPrimary,
    secondaryContainer = SecondaryContainer,
    onSecondaryContainer = Secondary,

    // Tertiary (violet — doctor accent)
    tertiary = Tertiary,
    onTertiary = OnPrimary,
    tertiaryContainer = TertiaryContainer,
    onTertiaryContainer = Tertiary,

    // Error
    error = AuDanger,
    onError = OnPrimary,
    errorContainer = ErrorContainer,
    onErrorContainer = AuDanger,

    // Borders/outlines
    outline = AuBorder,
    outlineVariant = AuBorderHover,

    // Inverse (for snackbars, etc.)
    inverseSurface = AuAccent,
    inverseOnSurface = AuBackground,
    inversePrimary = Primary,
)

@Composable
fun AutamedicaTheme(
    content: @Composable () -> Unit,
) {
    val colorScheme = AutamedicaDarkScheme

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
                isAppearanceLightStatusBars = false
                isAppearanceLightNavigationBars = false
            }
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = AutamedicaTypography,
        content = content,
    )
}
