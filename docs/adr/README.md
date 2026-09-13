# Architecture Decision Records (ADR)

## 📋 Propósito

Este directorio contiene **Architecture Decision Records** para documentar decisiones técnicas importantes en AutaMedica, especialmente aquellas que afectan:

- 🔒 **Tipos críticos médicos** (Patient, Doctor, MedicalRecord, etc.)
- 🏛️ **Contratos de API** (@autamedica/types breaking changes)
- 🚀 **Arquitectura del sistema** (monorepo, packages, boundaries)
- 🔐 **Compliance HIPAA** (seguridad, privacidad, auditoría)

## 📝 Formato de ADR

Usa el template estándar:

```markdown
# ADR-XXXX: Título de la Decisión

## Estado

[Propuesto | Aceptado | Rechazado | Deprecated | Superseded]

## Contexto

¿Qué problema estamos resolviendo?

## Decisión

¿Qué hemos decidido hacer?

## Consecuencias

### Positivas

- Beneficio 1
- Beneficio 2

### Negativas

- Costo 1
- Limitación 2

## Compliance

### HIPAA

- Impacto en PHI/PII
- Consideraciones de auditoría

### Médico

- Impacto en flujos clínicos
- Validaciones requeridas
```

## 🚨 Cuándo Crear un ADR

### Obligatorio para:

- ✅ **Breaking changes** en tipos críticos
- ✅ **Cambios de arquitectura** que afecten boundaries
- ✅ **Nuevas integraciones** con sistemas médicos
- ✅ **Cambios de compliance** HIPAA
- ✅ **Performance** que afecte flujos críticos

### Tipos Críticos que Requieren ADR:

- `PatientId`, `DoctorId`, `CompanyId`, `UUID`
- `Patient`, `Doctor`, `Appointment`, `MedicalRecord`
- `APIResponse`, `AuthUser`, `UserRole`
- `ISODateString`, `EmailAddress`, `PhoneNumber`

## 📚 Referencias

- [ADR GitHub](https://adr.github.io/)
- [Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
- [HIPAA Compliance Guide](https://www.hhs.gov/hipaa/for-professionals/security/guidance/index.html)

## 🔗 ADRs Existentes

- [ADR-0001: Telemedicina Web + Mobile con arquitectura canonica de llamada](./ADR-0001-telemedicine-web-mobile-canonical-call-architecture.md)
- [ADR-0002: Hexagonal Layered Architecture](./ADR-0002-hexagonal-layered-architecture.md)
- [ADR-0003: Cloudflare Calls SFU como plano de medios canonico (web + Android)](./ADR-0003-cloudflare-calls-sfu-canonical-media-plane.md)

---

**💡 Tip**: Usar `pnpm docs:validate` valida que cambios críticos tengan ADRs correspondientes.
