package com.autamedica.android.presentation.theme

import androidx.compose.ui.graphics.Color

// AutaMedica brand colors — matching landing page (dark palette)
// Source: apps/web/src/styles/globals.css

// Core light surfaces (matching Web globals.css / auth.css)
val AuBackground = Color(0xFFFFFFFF)       // --au-bg (clean white)
val AuSurface = Color(0xFFF8FBFF)          // --au-surface (ice white)
val AuSurfaceHover = Color(0xFFEEF6FF)     // --au-surface-hover
val AuHover = Color(0xFFF3F8FF)            // --au-hover

// Borders with subtle sky tint
val AuBorder = Color(0x1F0EA5E9)           // rgba(14, 165, 233, 0.12)
val AuBorderHover = Color(0x3D0EA5E9)      // rgba(14, 165, 233, 0.24)

// Text hierarchy (high contrast clinical)
val AuTextPrimary = Color(0xFF050505)      // --au-text-primary
val AuTextSecondary = Color(0xFF334155)    // --au-text-secondary (slate-700)
val AuTextTertiary = Color(0xFF64748B)     // --au-text-tertiary (slate-500)

// Accent
val AuAccent = Color(0xFF0EA5E9)           // --au-accent (sky-500)
val AuAccentSoft = Color(0x1F0EA5E9)       // rgba(14, 165, 233, 0.12)

// Portal-specific accent colors (matching web role themes)
val PortalPatients = Color(0xFF0EA5E9)        // --portal-patients (sky-500)
val PortalPatientsSoft = Color(0x1F0EA5E9)    // rgba(14, 165, 233, 0.12)
val PortalDoctors = Color(0xFF0891B2)         // --portal-doctors (cyan-600)
val PortalDoctor = PortalDoctors
val PortalDoctorsSoft = Color(0x1F0891B2)     // rgba(8, 145, 178, 0.12)
val PortalDoctorSoft = PortalDoctorsSoft
val PortalPharmacists = Color(0xFF059669)     // --portal-pharmacists (emerald-600)
val PortalPharmacistsSoft = Color(0x1F059669) // rgba(5, 150, 105, 0.12)
val PortalCompanies = Color(0xFF475569)       // --portal-companies (slate-600)
val PortalCompaniesSoft = Color(0x1F475569)   // rgba(71, 85, 105, 0.12)

// Logo Obsidian Jewel (matching Web AuthLogo bg-zinc-950)
val LogoObsidianBg = Color(0xFF09090B)
val LogoRingBorder = Color(0x1AFFFFFF)

// Semantic
val AuSuccess = Color(0xFF22C55E)          // --au-success (green-500)
val AuWarning = Color(0xFFF59E0B)          // --au-warning (amber-500)
val AuDanger = Color(0xFFEF4444)           // --au-danger (red-500)

// Semantic containers
val SuccessContainer = Color(0xFFECFDF5)   // emerald-50
val WarningContainer = Color(0xFFFFFBEB)   // amber-50
val ErrorContainer = Color(0xFFFEF2F2)     // red-50

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
