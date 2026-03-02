package com.autamedica.android.presentation.theme

import androidx.compose.ui.graphics.Color

// AutaMedica brand colors — matching landing page (dark palette)
// Source: apps/web/src/styles/globals.css

// Core dark surfaces (Zinc palette from landing)
val AuBackground = Color(0xFF09090B)       // --au-bg
val AuSurface = Color(0xFF141416)          // --au-surface
val AuSurfaceHover = Color(0xFF1C1C20)     // --au-surface-hover
val AuHover = Color(0xFF18181B)            // --au-hover

// Borders
val AuBorder = Color(0xFF1F1F23)           // rgba(255,255,255,0.08) on #09090b
val AuBorderHover = Color(0xFF2A2A2F)      // --au-hover-border

// Text hierarchy
val AuTextPrimary = Color(0xFFF4F4F5)      // --au-text-primary (zinc-100)
val AuTextSecondary = Color(0xFFA1A1AA)    // --au-text-secondary (zinc-400)
val AuTextTertiary = Color(0xFF71717A)     // --au-text-tertiary (zinc-500)

// Accent
val AuAccent = Color(0xFFE4E4E7)           // --au-accent (zinc-200)
val AuAccentSoft = Color(0x14E4E4E7)       // rgba(228,228,231,0.08)

// Portal-specific accent colors
val PortalPatients = Color(0xFF10B981)     // --portal-patients (emerald)
val PortalDoctors = Color(0xFF3B82F6)      // --portal-doctors (blue)
val PortalCompanies = Color(0xFFF59E0B)    // --portal-companies (amber)

// Semantic
val AuSuccess = Color(0xFF22C55E)          // --au-success (green-500)
val AuWarning = Color(0xFFF59E0B)          // --au-warning (amber-500)
val AuDanger = Color(0xFFEF4444)           // --au-danger (red-500)

// Semantic containers (darker variants for dark theme)
val SuccessContainer = Color(0xFF052E16)   // green-950
val WarningContainer = Color(0xFF451A03)   // amber-950
val ErrorContainer = Color(0xFF450A0A)     // red-950

// Blue primary (from shared design system — used in portals/buttons)
val Primary = Color(0xFF2563EB)            // am-primary-600
val PrimaryDark = Color(0xFF1D4ED8)        // am-primary-700
val PrimaryLight = Color(0xFF3B82F6)       // am-primary-500
val PrimaryContainer = Color(0xFF172554)   // blue-950

// Violet accent (doctor role)
val Tertiary = Color(0xFF7C3AED)           // am-doctor-600
val TertiaryContainer = Color(0xFF2E1065)  // violet-950

// Sky accent (patient role)
val Secondary = Color(0xFF0EA5E9)          // am-patient-500
val SecondaryDark = Color(0xFF0284C7)      // am-patient-600
val SecondaryContainer = Color(0xFF0C4A6E) // sky-950

// Pure white for on-dark text
val OnPrimary = Color(0xFFFFFFFF)

// ── Light theme fallbacks (for potential future light mode) ──
val LightBackground = Color(0xFFF8FAFC)
val LightSurface = Color(0xFFFFFFFF)
val LightOnBackground = Color(0xFF0F172A)
val LightOnSurface = Color(0xFF1E293B)
