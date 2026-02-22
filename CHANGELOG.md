# 📋 Changelog

## [Unreleased]

### 🚀 Nuevas Funcionalidades
- 53a0d6d feat(auth): remove role from login flow — detect role automatically post-auth
- f35c7ab feat(web): apply NYT editorial philosophy to landing copy
- 3367525 feat: consolidate auth into autamedica-web, remove deploy-auth job
- 76a5483 feat(web): add portal images and fix landing page completeness
- 3906614 feat(web): replace CSS animations with GSAP ScrollTrigger across landing page
- 677dd39 feat(telemedicine): secure rpc fallback and supabase deploy workflow
- fb40253 feat(db): storage buckets, audit system, RLS cleanup

### 🔧 Mejoras y Optimizaciones
- 880e183 chore(ci): add staged debt and db drift guards to pre-commit
- 159ae48 chore: agregar apps/web/.env.example como referencia

### 🐛 Correcciones
- 265aa29 fix(auth): harden signup trigger recovery and profiles RLS policies
- a198274 fix(security): harden redirect validation and auth login fallback
- 35d84c2 fix(auth): align auth-hub refs and clear lint warnings
- ab39ac9 fix(auth): harden routing, redirects and domain migration
- 7248b9f fix(ci): resolve all remaining build failures in CI/CD
- 5c781fa fix(web-app): declare missing deps — @autamedica/shared, @supabase/ssr, @opennextjs/cloudflare
- 4c05b39 fix(ci): resolve 4 workflow failures — lint, secrets-scan, agentic-os, next-on-pages
- bf2dff6 fix(ci): add --skip-next-build; remove admin roles from select-role; fix glossary exports
- 2d5f2b5 fix(web): satisfy Astro 5 AstroCookieSetOptions strict expires type
- 4ac9a4c fix(web): fix AstroCookieSetOptions type error in auth callback
- 5a19494 fix(hooks): scope pre-push typecheck to changed packages only
- b02b301 fix(ci): retry cloudflare deploy on api rate limits
- e7e25b9 fix(ci): add cloudflare project fallback for doctors and patients
- 01c630d fix(ci): harden deploy workflows for wrangler and supabase auth
- 3061137 fix(ci): unblock patients/doctors and supabase telemedicine deploys
- 10b6040 fix(deploy): read env vars from system env in CI, fix branch=main
- 5854453 fix(deploy): use --branch main for production deployment
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
- a082f54 📝 docs: actualizar changelog automático
- 0760b64 📝 docs: actualizar changelog automático
- d8280f7 📝 docs: actualizar changelog automático
- be32ee1 📝 docs: actualizar changelog automático
- bc66adc 📝 docs: actualizar changelog automático
- d7317da 📝 docs: actualizar changelog automático
- eeafb62 📝 docs: actualizar changelog automático
- 5be4e22 📝 docs: actualizar changelog automático
- 4c5f091 📝 docs: actualizar changelog automático
- 225aded 📝 docs: actualizar changelog automático
- a24b6f3 docs: add editorial philosophy (NYT model) for autamedica-web
- beccc87 📝 docs: actualizar changelog automático
- fec729c 📝 docs: actualizar changelog automático
- 45a0901 📝 docs: actualizar changelog automático
- b057a70 📝 docs: actualizar changelog automático
- ba55e50 📝 docs: actualizar changelog automático
- 0017f46 📝 docs: actualizar changelog automático
- 777443b 📝 docs: actualizar changelog automático
- 090a577 📝 docs: actualizar changelog automático
- 63fa426 📝 docs: actualizar changelog automático
- e525dc1 📝 docs: actualizar changelog automático
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
- 49f4039 ci: link autamedica.com custom domain to Cloudflare Pages on deploy
- 77e094f ci: trigger supabase telemedicine deploy on main pushes

---

### 🔄 Otros Cambios
- 3740074 test(auth): update legacy auth domain references
- 4b36803 infra: migrar a Supabase knywotiidsydsaveqkjs + Cloudflare Pages autamedica-web

*Generado automáticamente el 2026-02-22 00:47:20*
