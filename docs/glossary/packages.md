# Glosario Packages - Exports por Package

## 🎯 Propósito

Documentación de todos los exports públicos de cada package de Autamedica.

---

## @autamedica/types

**Ubicación**: `packages/types/src/index.ts`

```typescript
// Primitivos: Fechas
export type { ISODateString } from "./primitives/date";
export { toISODateString, fromISODateString, nowAsISODateString } from "./primitives/date";

// Primitivos: API
export type { APIResponse, APIError, APISuccessResponse, APIErrorResponse } from "./primitives/api";
export { createSuccessResponse, createErrorResponse } from "./primitives/api";

// Primitivos: IDs
export type { UUID, PatientId, DoctorId, CompanyId, AppointmentId, FacilityId, SpecialtyId } from "./primitives/id";
export { createUUID, createPatientId, createDoctorId, createCompanyId } from "./primitives/id";

// Auth
export type { UserRole, Portal, User, UserProfile, UserSession } from "./auth/user";
export { ROLE_TO_PORTALS, canAccessPortal } from "./auth/user";

// Entidades
export type { Patient, PatientAddress, EmergencyContact } from "./entities/patient";

export type { Doctor, DoctorEducation, DoctorExperience } from "./entities/doctor";

export type { Company, CompanySize, CompanyAddress, CompanyContact } from "./entities/company";

export type { Appointment } from "./entities/appointment";
```

---

## @autamedica/shared

**Ubicación**: `packages/shared/src/index.ts`

```typescript
// Utilidades de entorno
export { ensureEnv, ensureClientEnv, ensureServerEnv, validateEnvironment, validateEnvironmentSecurity, validateProductionEnvironment, validateStagingEnvironment, validateEnvironmentByType, isProduction, isDevelopment } from "./env";

// Configuración de aplicaciones (migrado de @autamedica/config)
export { getAppEnv, getLoginUrlBuilder, type AppName, type AppEnvironmentConfig, type LoginUrlBuilder } from "./env/app-config";

// UI utilities (migrado de @autamedica/utils)
export { cn } from "./ui-utils";

// Type guards y async utilities (migrado de @autamedica/utils)
export { isString, isNumber, isBoolean, delay } from "./type-guards";
export type { EnvironmentConfig, EnvironmentValidation } from "./env";

// Validaciones
export { validateEmail, validatePhone } from "./validators";

// Logger centralizado
export { logger } from "./services/logger.service";
export type { Logger, LogLevel } from "./services/logger.service";

// Role-based routing
export { BASE_URL_BY_ROLE, HOME_BY_ROLE, AUTH_URLS, PORTAL_TO_ROLE, getTargetUrlByRole, getCookieDomain, getPortalForRole, getRoleForPortal, getLoginUrl } from "./role-routing";

// Session management
export { getSession, hasRole } from "./session";

// Security helpers
export { isAllowedRedirect, safeRedirectOrFallback, buildSafeLoginUrl, isSameOrigin, sanitizeReturnUrl } from "./security/redirects";

// Role types (re-exported from types package)
export type { UserRole } from "./auth/portals";
```

---

## @autamedica/auth

**Ubicación**: `packages/auth/src/index.ts`

```typescript
// Tipos compartidos de autenticación
export type { UserRole, AppName, UserProfile, UserMetadata, AuthState, Environment, DomainConfig, RedirectConfig, SessionConfig, AuthErrorType } from "./types";

export { ROLE_APP_MAPPING, APP_ALLOWED_ROLES, AuthError } from "./types";

export { APP_NAMES } from "./constants";

export type { AppNameConstant } from "./constants";

// Clientes Supabase (browser)
export { createBrowserClient, getSupabaseClient, signOutGlobally } from "./client/supabase";

// Clientes Supabase (server-side)
export { createServerClient, createMiddlewareClient, createRouteHandlerClient } from "./server";

// Manejo de sesiones
export { getSession, requireSession, requirePortalAccess, signOut, getCurrentUser, hasRole, hasPortalAccess } from "./session";

// Middleware y hooks de aplicación
export { AuthProvider, useAuth, useRequireAuth, useRequireRole } from "./hooks/useAuth";

export { useSupabase } from "./hooks/useSupabase";

export { authMiddleware, createAppMiddleware } from "./middleware/auth";

// Utilidades de configuración y redirección
export { getEnvironment, getDomainConfig, getSessionConfig, getSupabaseConfig, isSameOrigin, sanitizeReturnUrl, getRedirectUrl, getLoginUrl } from "./utils";
```

---

## @autamedica/hooks

**Ubicación**: `packages/hooks/src/index.ts`

```typescript
// React hooks médicos
export { usePatients } from "./usePatients";
export { useAppointments } from "./useAppointments";

// React hooks de utilidad
export { useAsync } from "./useAsync";
export { useDebounce } from "./useDebounce";

// Telemedicine hooks (re-exported from @autamedica/telemedicine)
export { useTelemedicineClient, useMediaControls, useRtcStats } from "@autamedica/telemedicine";

export type { TelemedicineClientState, TelemedicineClientActions, TelemedicineClientHook, MediaControlsState, MediaControlsActions, MediaControlsHook, RtcStatsData, RtcStatsState, RtcStatsActions, RtcStatsHook } from "@autamedica/telemedicine";
```

---

## @autamedica/ui

**Ubicación**: `packages/ui/src/index.ts`

```typescript
// Componentes compartidos de UI
export { Button } from "./components/Button";
export { Card } from "./components/Card";
export { Input } from "./components/Input";
export { Modal } from "./components/Modal";
```

---

## @autamedica/tailwind-config

**Ubicación**: `packages/tailwind-config/tailwind.config.ts`

```typescript
// Configuración compartida de Tailwind CSS
export { default } from "./tailwind.config";
```

---

<!-- AUTOGEN_PACKAGES:START -->
<!-- Esta sección es auto-generada por scripts/validate-exports.mjs -->
<!-- AUTOGEN_PACKAGES:END -->

**Última actualización**: 2025-10-04
**Mantenido por**: Sistema de validación automática (`pnpm docs:validate`)
