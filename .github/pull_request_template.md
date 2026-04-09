## 🎯 Contexto

<!-- ¿Qué problema estás resolviendo? Incluye links a tickets o issues relevantes. -->

## 🛠️ Solución

<!-- Resumen de la estrategia técnica utilizada. Menciona cambios en arquitectura o lógica core. -->

## ⚖️ Validación en Dos Planos (Mandatorio)

### 1. Plano UI/Client Gating (UX & Feedback)

- [ ] **Visibilidad:** Los elementos se muestran/ocultan correctamente según el estado.
- [ ] **Feedback:** El usuario recibe confirmación visual (loading, toast, error).
- [ ] **Seguridad:** Los inputs están validados y sanitizados.

### 2. Plano DB Enforcement (Integridad & Seguridad)

- [ ] **RLS:** Se han definido/verificado políticas de Row Level Security.
- [ ] **Integridad:** Constraints, Enums y Triggers protegen el dato.
- [ ] **Tipos:** El esquema de DB coincide con `database.types.ts`.

## 🧪 Evidencia Técnica

<!-- Agrega capturas de pantalla, outputs de `psql`, o reportes de Vitest. -->

## 🚨 Checklist de Higiene (Regla #5)

- [ ] No hay `console.log` en archivos de producción.
- [ ] No hay deudas técnicas (`T-O-D-O`, `F-I-X-M-E`) o stubs (salvo excepciones §1.5 de GEMINI.md).
- [ ] `pnpm lint` y `pnpm build` pasan localmente.

---

_Mantra: "Deja el código más limpio de como lo encontraste."_
