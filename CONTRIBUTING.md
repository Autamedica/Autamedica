# 🤝 Guía de Contribución - Autamedica

## 🎯 **Bienvenido al Proyecto**

Gracias por tu interés en contribuir a Autamedica. Esta guía te ayudará a contribuir efectivamente siguiendo nuestros estándares de calidad enterprise.

## 🚨 **Reglas Críticas**

### ⛔ **PROHIBICIONES ABSOLUTAS**
- **PROHIBIDO** generar código con deuda técnica
- **PROHIBIDO** crear workarounds temporales
- **PROHIBIDO** código que necesite "ajustes posteriores"
- **PROHIBIDO** hardcodear datos o usuarios ficticios
- **PROHIBIDO** commits que rompan el build

### ⏰ **FILOSOFÍA DE TRABAJO**
- **NO EXISTE PRISA** - Tiempo y tokens son ILIMITADOS
- **CALIDAD PRIMERO** - Prefiere 1 línea perfecta vs 100 líneas mediocres
- **PRODUCCIÓN READY** - Todo código debe ser enterprise-level desde el primer commit

## 🏗️ **Flujo de Desarrollo**

### **📋 Preparación del Entorno**

```bash
# 1. Fork y clone
git clone https://github.com/TU_USUARIO/Autamedica.git
cd Autamedica

# 2. Instalar dependencias
pnpm install

# 3. Verificar que todo funcione
pnpm build:packages
pnpm lint
pnpm type-check

# 4. Ejecutar servidores de desarrollo
pnpm dev
```

### **🌳 Estrategia de Ramas**

```
main (base predeterminada de integración)
├── feat/descripcion-corta
├── fix/descripcion-corta
├── security/descripcion-corta
├── refactor/descripcion-corta
└── docs/descripcion-corta
```

### **🔄 Flujo de Trabajo**

1. **Crear rama** desde `main`:
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feat/nombre-descriptivo
   ```

2. **Desarrollo** siguiendo estándares:
   - Escribir tests ANTES del código
   - Documentar funciones públicas
   - Seguir convenciones de naming

3. **Pre-commit** automático:
   ```bash
   git add .
   git commit -m "✨ nova feature: descripción clara"
   # Husky ejecuta: lint, type-check, tests
   ```

4. **Push y PR**:
   ```bash
   git push -u origin feat/nombre-descriptivo
   # Crear PR via GitHub CLI o web
   gh pr create --base main --title "feat(android): resultado concreto"
   ```

## 💬 **Convención de Commits**

### **🎨 Emojis + Tipos Obligatorios**

| **Emoji** | **Tipo** | **Uso** | **Ejemplo** |
|-----------|----------|---------|-------------|
| ✨ | `nova feature` | Nueva funcionalidad | `✨ nova feature: sistema de citas médicas` |
| 🐛 | `fix` | Corrección de bugs | `🐛 fix: error al cargar historial médico` |
| ⚙️ | `ops tarea` | DevOps, CI/CD, config | `⚙️ ops tarea: agregar workflow de staging` |
| 📋 | `docs` | Documentación | `📋 docs: actualizar guía de API` |
| 🎨 | `style` | Formato, CSS, UI | `🎨 style: mejorar diseño de dashboard` |
| ♻️ | `refactor` | Refactoring sin cambio funcional | `♻️ refactor: optimizar queries de DB` |
| 🧪 | `test` | Agregar/modificar tests | `🧪 test: cobertura para módulo auth` |
| 🔧 | `chore` | Tareas de mantenimiento | `🔧 chore: actualizar dependencias` |

### **📝 Formato del Mensaje**

```
🎨 tipo: descripción concisa en presente (máx 50 chars)

- Detalle 1 del cambio
- Detalle 2 del cambio
- Referencia: closes #123

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

## 📋 **Checklist de PR**

### **✅ Antes de Abrir el PR**

- [ ] **Tests** escritos y pasando (`pnpm test`)
- [ ] **Lint** sin errores (`pnpm lint`)
- [ ] **Types** sin errores (`pnpm type-check`)
- [ ] **Build** exitoso (`pnpm build`)
- [ ] **Documentación** actualizada
- [ ] **Contratos** validados (`pnpm docs:validate`)

### **✅ Contenido del PR**

- [ ] **Título** con formato `tipo(área): resultado concreto`
- [ ] **Descripción** clara del problema y solución
- [ ] **Screenshots** si afecta UI
- [ ] **Tests plan** documentado
- [ ] **Breaking changes** marcados
- [ ] **Tamaño** razonable (<1200 líneas)

## 🧪 **Estándares de Testing**

### **📊 Cobertura Mínima**
- **Funciones críticas**: 100%
- **Módulos médicos**: 95%
- **UI Components**: 80%
- **Utils/Helpers**: 90%

### **🔍 Tipos de Tests**

```bash
# Unit tests (Vitest)
pnpm test:unit

# Integration tests
pnpm test:integration

# E2E tests (Playwright)
pnpm test:e2e

# Coverage report
pnpm test:coverage
```

### **📝 Estructura de Tests**

```typescript
// ✅ BUENO
describe('PatientService', () => {
  describe('createPatient', () => {
    it('should create patient with valid data', () => {
      // Arrange
      const patientData = createValidPatientData()

      // Act
      const result = PatientService.create(patientData)

      // Assert
      expect(result).toMatchSchema(PatientSchema)
    })

    it('should reject invalid medical history', () => {
      // Test error cases
    })
  })
})
```

## 🎨 **Estándares de Código**

### **📁 Estructura de Archivos**

```
apps/doctors/src/
├── app/                    # Next.js app directory
├── components/
│   ├── ui/                # Componentes base (Button, Input)
│   ├── medical/           # Componentes médicos específicos
│   └── layout/            # Layout components
├── hooks/                 # Custom hooks
├── lib/                   # Utilities
├── types/                 # Types específicos de la app
└── __tests__/             # Tests
```

### **🏷️ Naming Conventions**

- **Componentes**: `PascalCase` (`PatientCard.tsx`)
- **Hooks**: `camelCase` con `use` (`usePatientData.ts`)
- **Utils**: `camelCase` (`formatMedicalId.ts`)
- **Constants**: `UPPER_SNAKE_CASE` (`MAX_PATIENT_RECORDS`)
- **Types**: `PascalCase` con sufijo (`PatientData`, `DoctorProfile`)

### **📦 Imports Order**

```typescript
// 1. React/Next.js
import React from 'react'
import { NextPage } from 'next'

// 2. External libraries
import { z } from 'zod'
import clsx from 'clsx'

// 3. Internal packages
import { Patient } from '@autamedica/types'
import { useAuth } from '@autamedica/auth'

// 4. Relative imports
import { PatientCard } from '../components/PatientCard'
import { formatDate } from '../lib/utils'
```

## 🔒 **Seguridad y Compliance**

### **🏥 HIPAA Compliance**
- **NO** loggear datos médicos en plain text
- **Encriptar** datos sensibles en tránsito y reposo
- **Validar** inputs en cliente Y servidor
- **Auditar** accesos a información médica

### **🛡️ Prácticas Seguras**

```typescript
// ✅ BUENO
const patientId = z.string().uuid().parse(rawId)
const sanitizedData = sanitizeInput(userInput)
logger.info('Patient accessed', { patientId: hash(patientId) })

// ❌ MALO
console.log('Patient data:', patientData) // HIPAA violation
const query = `SELECT * FROM patients WHERE id=${userId}` // SQL injection
```

## 📊 **Code Review Process**

### **👥 Revisión**
- No se exige una segunda aprobación humana obligatoria al propietario/admin cuando es el único integrador.
- Los cambios en auth/permissions, `@autamedica/types` y lógica médica deben incluir revisión técnica específica y pruebas documentadas.
- Las reglas de protección de `main` deben permitir el bypass administrativo del propietario.

### **🔍 Criterios de Review**

**Funcionalidad:**
- [ ] Resuelve el problema planteado
- [ ] No introduce regressions
- [ ] Maneja edge cases

**Calidad:**
- [ ] Código limpio y legible
- [ ] Performance adecuado
- [ ] Error handling completo

**Seguridad:**
- [ ] No expone datos sensibles
- [ ] Validación de inputs
- [ ] Principio de menor privilegio

## 🚀 **Release Process**

### **📦 Versionado Semántico**
- **MAJOR** (1.0.0): Breaking changes
- **MINOR** (0.1.0): Nuevas features compatibles
- **PATCH** (0.0.1): Bug fixes

### **🔄 Deployment Pipeline**
1. **PR** → `main` como rama base predeterminada (otra base requiere justificación).
2. **Validaciones** → CI y controles de base de datos/RLS configurados para el repositorio.
3. **Release** → seguir el pipeline de despliegue vigente, sin asumir que merge equivale a deploy.

## 📞 **Obtener Ayuda**

### **💬 Canales de Comunicación**
- **General**: GitHub Discussions
- **Bugs**: GitHub Issues con template
- **Security**: security@autamedica.com (privado)
- **Medical**: medical@autamedica.com

### **📚 Recursos**
- **DevAltamedica**: `/home/edu/Devaltamedica-Independent/` (referencia)
- **Docs**: `docs/` directory
- **Workflows**: `.github/workflows/`

---

**🙏 Gracias por contribuir a la medicina del futuro!**

**📅 Última actualización**: Septiembre 2025
---

## 🧭 Gobernanza Ligera de Pull Requests

### Formato obligatorio del título de PR
```text
tipo(área): resultado concreto
```
- **Tipos permitidos:** `security`, `fix`, `feat`, `refactor`, `test`, `docs`, `chore`, `release`
- **Áreas permitidas:** `android`, `web`, `api`, `supabase`, `pharmacy`, `farmalink`, `memed`, `renaper`, `billing`, `infra`, `governance`
- **Ejemplos válidos:**
  - `security(supabase): revoke anon ACL on social_agent tables`
  - `fix(android): stop Realtime notification feedback loop`

### Formato de rama
```text
tipo/descripcion-corta
```
Ejemplo: `fix/android-realtime-loop`, `security/pharmacy-country-isolation`.

### Etiquetas de prioridad *(fuera del título)*
| Etiqueta | Uso |
|---|---|
| `priority:P0` | Crítico, seguridad o producción |
| `priority:P1` | Bloquea operación importante |
| `priority:P2` | Funcionalidad o mejora |
| `priority:P3` | Mantenimiento menor |
