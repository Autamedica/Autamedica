# Filosofía Editorial AutaMedica

## "El usuario viene porque necesita, no porque lo empujamos"

> Inspirada en el modelo editorial del New York Times.
> Documento vivo — actualizar cuando cambie la visión del producto.

---

## 1. La Tesis Central

El NYT no abre con un botón gigante que dice "SUSCRIBITE AHORA". Abre con noticias. El valor llega primero; la conversión es consecuencia inevitable.

**AutaMedica aplica lo mismo a la salud:**

> La plataforma no se vende. Se experimenta.
> El usuario registrado es aquel que ya encontró valor antes de crear una cuenta.

---

## 2. El Principio Editorial: Pull vs Push

### Push (lo que NO somos)

- "Unite a miles de profesionales" (social proof vacío)
- "Crear cuenta gratis" en el hero antes de mostrar nada
- Banners de urgencia: "Solo hoy", "Oferta limitada"
- Pop-ups de registro a los 3 segundos de entrar
- Contador de usuarios para generar FOMO

### Pull (lo que SÍ somos)

- Contenido médico verificado que responde preguntas reales
- El usuario llega buscando "¿cuándo ir al médico por fiebre?" y encuentra una respuesta que confía
- La plataforma es la herramienta obvia al final de ese artículo
- La conversión ocurre cuando el usuario decide, no cuando nosotros presionamos

---

## 3. La Newsletter: "AutaMédica Semanal" (inspirada en The Morning)

### ¿Qué es The Morning del NYT?

Un email diario de ~5 minutos que:

- Resume las noticias más importantes
- Tiene voz editorial propia (no robótica)
- No vende nada — informa
- Crea un hábito: el lector abre el email antes del café

### AutaMédica Semanal — El Equivalente

Un email **semanal** de salud que:

- Llega **los martes** (confirmado con engagement data una vez activo)
- Tiene una estructura fija: el usuario sabe qué esperar
- Está escrito por médicos reales, con nombre y especialidad
- No tiene CTAs de registro — solo valor

**Estructura del email:**

```
Asunto: "Esta semana en salud | AutaMédica"

── Esta semana ──────────────────────────
1 tema principal (ej: "La gripe A está subiendo en Argentina")
   → 3 párrafos, firmado por un médico
   → 1 dato sorprendente
   → 1 mito desmentido

── Para tener en cuenta ─────────────────
3 bullets cortos de salud preventiva
  • "Si tomás ibuprofeno con el estómago vacío, esto pasa..."
  • "La vitamina D: cuándo suplementar y cuándo no"
  • "Síntomas que no son emergencia pero sí consulta pronto"

── Pregunta de la semana ─────────────────
"¿Es lo mismo un análisis en ayunas que en reposo?"
  → Respuesta en 2 oraciones
  → "Consultá con un médico si..." (link a la plataforma)

── Pie ──────────────────────────────────
Verificado por el equipo médico de AutaMédica
Unsub · Preferencias
```

### Captura del email — no en el hero

La suscripción a la newsletter se propone **después** de que el usuario consuma contenido:

- Al final de un artículo del blog
- En el footer de la landing (discreta, no invasiva)
- Nunca como pop-up al entrar

---

## 4. Jerarquía de CTAs en el Landing

### Regla de oro: máximo 1 CTA primario visible por pantalla

**Hero (primera pantalla)**

```
CTA primario:  "Explorar la plataforma"  →  scroll interno (#producto)
CTA secundario: NO existe en mobile. En desktop, texto pequeño: "o iniciá sesión →"
```

El usuario no puede registrarse antes de saber qué es AutaMédica.

**Al final del recorrido (después de ver producto, médicos, proceso)**

```
CTA primario:  "Agendá tu consulta"  →  /auth/select-role
Texto soporte: "Los médicos están disponibles ahora"
SIN notas de presión: ❌ "Setup en 30 segundos" ❌ "Sin tarjeta de crédito"
```

**Newsletter (sección propia, antes del footer)**

```
CTA: "Recibí el resumen semanal de salud"
Input: solo email
Botón: "Suscribirme"  ← no "¡Quiero esto!" ni urgencia
Nota: "Sin spam. Un email por semana."
```

### Botones prohibidos en el landing principal

- ❌ `"Crear cuenta gratis"` en el hero
- ❌ `"Unite ahora"` o `"Registrate gratis"`
- ❌ Cualquier botón con ícono de flecha grande + texto en mayúsculas
- ❌ CTAs con colores de alta saturación (rojo, naranja) que generen alerta

---

## 5. Tono de Contenido

### Del NYT aprendemos

- **Autoridad sin arrogancia**: El periodista no grita. Informa con confianza.
- **El lector es inteligente**: No se explica lo básico. Se va al punto.
- **La voz es consistente**: El mismo tono en el hero, en los artículos, en los emails.

### AutaMédica: voz editorial

| Emoción a transmitir | Cómo lograrlo                               | Qué evitar                                        |
| -------------------- | ------------------------------------------- | ------------------------------------------------- |
| Confianza            | Firmar con nombre y especialidad del médico | "Expertos dicen que..."                           |
| Claridad             | Oraciones cortas, sin jerga                 | "Plataforma end-to-end HIPAA-compliant AI-driven" |
| Urgencia real        | "Si tenés estos síntomas, consultá hoy"     | "¡Últimos turnos disponibles!"                    |
| Cercanía             | Voseo argentino, primera persona plural     | Tono corporativo/formal                           |

---

## 6. Métricas de Éxito (no de vanidad)

El NYT no mide cuántas veces se imprimió el botón de suscripción. Mide:

- **Tiempo de lectura promedio** por artículo
- **Open rate de la newsletter** (benchmark saludable: >35%)
- **Click rate en artículos** desde el email
- **Tasa de retención** (usuarios que vuelven sin campaña)

### AutaMédica mide

- ❌ No: "conversiones en el hero" como KPI principal
- ✅ Sí: "consultas agendadas por usuarios que llegaron desde contenido orgánico"
- ✅ Sí: "open rate de la newsletter semanal"
- ✅ Sí: "usuarios activos mensuales que NO vinieron de campaña paga"
- ✅ Sí: "tiempo promedio en la landing antes del primer clic"

---

## 7. Implementación en la Landing — Estado y Roadmap

### Estado actual (Feb 2026)

| Componente    | Estado NYT     | Observaciones                                                                  |
| ------------- | -------------- | ------------------------------------------------------------------------------ |
| Hero          | ⚠️ Parcial     | Tiene 2 CTAs (explorar + crear cuenta). El secundario debe eliminarse del hero |
| HealthContent | 🔴 Placeholder | Dice "Blog completo próximamente". Necesita artículos reales                   |
| CTAFinal      | 🔴 Agresivo    | "Empieza a cuidar tu salud hoy" + botón grande. Debe suavizarse                |
| Newsletter    | 🔴 Inexistente | No hay sección de captura de email                                             |
| Navbar        | ✅ Correcto    | Solo navegación, sin CTA de registro visible                                   |

### Roadmap

1. **Fase 1 — Limpiar CTAs agresivos**
   - Eliminar "Crear cuenta gratis" del Hero (dejar solo "Explorar la plataforma")
   - Reescribir CTAFinal: cambiar copy a "Agendá tu consulta" y eliminar "Sin tarjeta de crédito"

2. **Fase 2 — Contenido real**
   - Conectar HealthContent a un CMS o a datos reales de Supabase
   - Mínimo 6 artículos iniciales firmados por médicos
   - Categorías: Prevención, Síntomas, Telemedicina, Salud Mental, Nutrición

3. **Fase 3 — Newsletter**
   - Crear sección de captura de email entre HealthContent y CTAFinal
   - Integrar con un servicio de email (Resend, Brevo, o similar)
   - Primer envío: cuando haya al menos 50 suscriptores

4. **Fase 4 — Distribución editorial**
   - SEO en artículos del blog (cada artículo = una consulta médica frecuente respondida)
   - Compartir artículos en redes sin CTA, solo valor
   - La newsletter como canal principal de retención

---

## 8. Anti-patrones Concretos a Evitar

### Lo que SaaS de salud malo hace

```
"¡Únete a +50.000 pacientes que ya confían en nosotros!"
[CREAR CUENTA GRATIS →]
★★★★★ "La mejor app del año" — TechCrunch
```

### Lo que AutaMédica hace

```
"5 señales de que tu presión está alta sin saberlo"
Por Dr. Martín Alvarez · Cardiología · 4 min de lectura

[artículo]

¿Querés hablar con un médico ahora?
Agendá una consulta →
```

---

## 9. Referencia NYT — ¿Por Qué Funciona?

El NYT tiene 10 millones de suscriptores de pago porque:

1. **Creó un hábito**: "The Morning" llega todos los días. El lector lo espera.
2. **No depende de virales**: El contenido es evergreen (noticias de calidad duran).
3. **La suscripción es consecuencia del valor**: No es el primer paso.
4. **Nunca compite por atención con urgencia**: Compite con profundidad.

AutaMédica tiene la misma oportunidad en salud: la mayoría de las apps de salud gritan.
Nosotros susurramos. Y eso se recuerda.

---

_Última actualización: Feb 2026_
_Mantener este documento actualizado con cada iteración del landing._
_Referencia cruzada: `apps/web/src/components/` — ver Hero.astro, CTAFinal.astro, HealthContent.astro_
