# 📋 Changelog

## [Unreleased]

### 🚀 Nuevas Funcionalidades
- 677dd39 feat(telemedicine): secure rpc fallback and supabase deploy workflow
- fb40253 feat(db): storage buckets, audit system, RLS cleanup

### 🔧 Mejoras y Optimizaciones
- 159ae48 chore: agregar apps/web/.env.example como referencia

### 🐛 Correcciones
- 713636e fix(deploy): update compatibility_date + nodejs_compat_v2
- 0d316e1 fix(ci): repair supabase deploy workflow yaml
- 8983672 fix(ci): usar pnpm dlx wrangler en vez de npx para deploy
- 189b5e9 fix(ci): cambiar security-scan a warning (no bloqueador)
- da302a2 fix(ci): simplificar lógica del security-scan
- ab55f05 fix(ci): mejorar security-scan para excluir source maps y directorios de build
- bf83764 fix: agregar @autamedica/session a build:packages:core
- 64f8030 fix(ci): consolidar versión de pnpm a 9.15.2 en todos los workflows
- e847d8b fix: actualizar pnpm-lock.yaml después de agregar dependencias ESLint
- 6c76619 fix(ci): corregir workflow CI/CD Monorepo y dependencias ESLint

### 🔒 Seguridad
- 00f73fa security: hardening producción - RLS, índices, CHECK constraints

### 📚 Documentación
- 3b37233 docs: production readiness report 2026-02-19
- 818f80c 📝 docs: actualizar changelog automático
- ffbb70c 📝 docs: actualizar changelog automático
- 88a8d37 📝 docs: actualizar changelog automático
- 9df8e35 📝 docs: actualizar changelog automático
- c372944 📝 docs: actualizar changelog automático
- 2eab369 📝 docs: actualizar changelog automático
- d316b0a 📝 docs: actualizar changelog automático
- 146e4e2 📝 docs: actualizar changelog automático
- 8925c01 docs: agregar información clara de Supabase AutaMedica a CLAUDE.md
- f3c127b 📝 docs: actualizar changelog automático
- 1c5f76c 📝 docs: actualizar changelog automático
- e3073a7 📝 docs: actualizar changelog automático
- fd1d4e5 📝 docs: actualizar changelog automático
- 312c837 📝 docs: actualizar changelog automático
- 28c01d3 📝 docs: actualizar changelog automático
- af3c5f6 📝 docs: actualizar changelog automático
- 5478c50 📝 docs: actualizar changelog automático
- 4e1b7af 📝 docs: actualizar changelog automático

### ⚙️ DevOps e Infraestructura
- 77e094f ci: trigger supabase telemedicine deploy on main pushes

---

### 🔄 Otros Cambios
- 4b36803 infra: migrar a Supabase knywotiidsydsaveqkjs + Cloudflare Pages autamedica-web

*Generado automáticamente el 2026-02-19 13:05:30*
