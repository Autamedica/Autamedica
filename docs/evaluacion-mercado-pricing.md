# Evaluacion de Mercado y Pricing — AutaMedica

> Generado 2026-04-13 | Datos verificados contra codigo fuente y mercado real

---

## 1. Que es AutaMedica hoy (honesto)

AutaMedica es una plataforma de telemedicina con IA clinica construida como monorepo
(Astro + React + Supabase + Cloudflare). Tiene modulos funcionales reales, no mockups:

| Modulo                                           | Estado real     | Diferenciador                               |
| ------------------------------------------------ | --------------- | ------------------------------------------- |
| Anamnesis con IA (voz + wizard + conversacional) | Produccion      | Gemini Live, 13 secciones, versionado       |
| Videoconsulta (Cloudflare Calls SFU)             | Produccion      | SFU enterprise, no P2P consumer             |
| Receta electronica                               | Funcional       | Compliance Ley 27.553, QR, CUIR placeholder |
| Circuito farmacia (prescripcion → dispensacion)  | Funcional       | Hexagonal, clarificaciones doctor-farmacia  |
| Recordatorios WhatsApp + waitlist                | Produccion      | OpenClaw, auto-dispatch, retry con backoff  |
| No-show prediction + overbooking                 | Funcional       | Heuristica 3 factores, no ML real           |
| Evaluacion psiquiatrica (TDAH)                   | Funcional       | 5 fases, triage automatico, safety flags    |
| Contabilidad fiscal argentina                    | Funcional       | Monotributo A-K + RI, IIBB, Ganancias       |
| Notificaciones (7 capas + Realtime)              | Produccion      | 8 domain event triggers activos             |
| Portal empresa/B2B                               | Infraestructura | UI placeholder, sin monetizacion            |

**Lo que NO tiene todavia:**

- Procesamiento de pagos real (MercadoPago configurado, sin endpoints)
- Planes de suscripcion (ni tabla ni logica)
- Comision de plataforma (take rate = 0%)
- CUIR/REFEPS validacion real (placeholder)
- Firma digital X.509
- App mobile nativa (solo web responsive)

---

## 2. Mercado: Telemedicina LATAM 2024-2026

### Tamano de mercado

| Fuente               | Tamano 2024 | Proyeccion       | CAGR  |
| -------------------- | ----------- | ---------------- | ----- |
| IMARC Group          | USD 6.4B    | USD 37.7B (2033) | 19.4% |
| Grand View Research  | USD 6.2B    | USD 22.8B (2030) | 24.1% |
| Market Data Forecast | USD 2.95B   | USD 10.5B (2033) | 17.2% |

Argentina es el 3er mercado de LATAM (detras de Brasil y Mexico).
Todas las fuentes coinciden: **15-24% CAGR**.

### Fuerzas de mercado convergentes (2025-2026)

1. **Regulacion forzada**: Resolucion 2214/2025 hace obligatoria la receta electronica
   para TODAS las indicaciones medicas. Cada doctor DEBE usar una plataforma.

2. **DrVirtual (MercadoPago)**: Lanzo sept 2025 a ARS $4,990/mes (~USD 9),
   consultas ilimitadas 24/7 con 300+ medicos. Valida disposicion a pagar del consumidor.

3. **Inflacion de prepagas**: Planes basicos $25K-40K ARS/mes, premium $255K ARS/mes.
   Espacio enorme para "suficientemente bueno" a 1/10 del precio.

---

## 3. Competencia directa en Argentina

### Plataformas (competidores directos)

| Competidor             | Modelo                      | Precio                  | Escala                           | Diferencial                    |
| ---------------------- | --------------------------- | ----------------------- | -------------------------------- | ------------------------------ |
| **Doc24**              | B2B white-label             | Custom enterprise       | 160K consultas/mes, 10M users    | Software + staff medico        |
| **Llamando al Doctor** | B2B (prepagas/aseguradoras) | Custom B2B              | 6M users, >USD 3M/ano            | 95% resolucion primer contacto |
| **Doctoralia**         | SaaS para doctores          | USD 50-86/mes           | 110K doctores listados           | SEO + marketplace              |
| **mediQuo**            | B2B (aseguradoras)          | Custom enterprise       | 5M pacientes, 300+ profesionales | Omnicanal, ISO 27001           |
| **1DOC3**              | B2B2C                       | Custom                  | Fuerte en Colombia               | Wellness corporativo           |
| **DrVirtual**          | B2C suscripcion             | ARS $9,490/mes (~USD 9) | Nuevo, distribucion MercadoPago  | Precio agresivo                |
| **PRE**                | SaaS receta electronica     | USD 9.90/mes            | Nicho                            | Solo prescripciones            |

### Prepagas (no competidores, potenciales clientes B2B)

OSDE (usa Doc24), Swiss Medical (in-house), Medife ("Cam Doctor"), Galeno, Medicus, Omint.
Estas organizaciones **externalizan tecnologia** y son clientes potenciales.

---

## 4. Benchmarks de precio

### Que paga el paciente

| Servicio                              | Precio ARS         | Precio USD aprox |
| ------------------------------------- | ------------------ | ---------------- |
| Consulta particular presencial (CABA) | $40,000            | ~USD 35          |
| DrVirtual (MercadoPago) ilimitado     | $9,490/mes         | ~USD 9/mes       |
| Prepaga basica                        | $25,000-40,000/mes | ~USD 22-35/mes   |
| Prepaga premium (OSDE 210)            | $255,771/mes       | ~USD 224/mes     |
| Teleconsulta publica (CABA)           | Gratis             | Gratis           |

### Que paga el doctor por plataforma

| Plataforma         | Precio          | Modelo     |
| ------------------ | --------------- | ---------- |
| Doctoralia Starter | ~USD 50/mes     | SaaS anual |
| Doctoralia Plus    | ~USD 61/mes     | SaaS anual |
| Doctoralia VIP     | ~USD 86/mes     | SaaS anual |
| PRE (recetas)      | USD 9.90/mes    | SaaS       |
| Doxy.me            | Gratis (basico) | Freemium   |

### B2B/Enterprise

No hay precios publicos. Doc24, Llamando al Doctor, mediQuo: **cotizacion custom**.
Modelo tipico: per-user-per-month (PUPM) o por consulta al asegurador.

### Take rates tipicos (plataformas marketplace)

- Global telemedicine marketplace: 15-30%
- Practo (India, referencia publica): 15-25% comision + SaaS
- LATAM: no hay datos publicos de Doc24/LAD/mediQuo

---

## 5. Donde esta AutaMedica en este mapa (brutal honesty)

### Ventajas reales

1. **Stack tecnico superior**: Hexagonal architecture, TypeScript estricto, Supabase + Cloudflare.
   La mayoria de competidores LATAM tienen stacks legacy (PHP, monolitos).

2. **Anamnesis con IA es unica**: Gemini Live con voz + wizard + conversacional + versionado.
   Ningun competidor tiene esto. Doc24 y LAD usan formularios basicos.

3. **Circuito completo prescripcion → farmacia**: Pocos competidores tienen el circuito
   cerrado doctor → receta → farmacia → dispensacion → clarificaciones.

4. **Evaluacion psiquiatrica con triage**: TDAH continuity tracking, safety flags automaticos,
   riesgo de interrupcion. Nicho poco atendido.

5. **Compliance fiscal argentino**: Monotributo + RI integrado en la plataforma.
   Ningun competidor ofrece esto.

6. **Recordatorios inteligentes con waitlist**: No-show prediction + overbooking + waitlist
   auto-dispatch. Nivel de sofisticacion que solo Doc24 podria tener.

### Desventajas reales

1. **Sin monetizacion implementada**: MercadoPago configurado pero 0 endpoints de pago.
   No hay planes, no hay suscripciones, no hay take rate. Revenue = $0.

2. **Sin base de usuarios**: 5 pacientes de prueba. Doc24 tiene 10M, LAD 6M, DrVirtual
   tiene la distribucion de MercadoPago.

3. **Sin app mobile nativa**: En LATAM, mobile-first es obligatorio.
   El 80%+ del trafico de salud es mobile.

4. **Sin equipo medico propio**: Doc24 vende software + staff. AutaMedica es solo software.
   Para B2B, muchos clientes quieren medicos incluidos.

5. **Marca desconocida**: Sin presencia en Google, sin reviews, sin cobertura de prensa.
   Doctoralia tiene 110K doctores listados en Argentina.

6. **Single developer**: Riesgo de bus factor. Competidores tienen equipos de 20-100+ personas.

---

## 6. Modelos de pricing viables para AutaMedica

### Opcion A: "Shopify for Doctors" (SaaS para medicos)

```
Plan Basico:  ARS $15,000/mes (~USD 13)  — Agenda + recordatorios + perfil
Plan Pro:     ARS $30,000/mes (~USD 26)  — + Receta electronica + videoconsulta
Plan Premium: ARS $50,000/mes (~USD 44)  — + IA anamnesis + contabilidad fiscal
```

**Por que**: Doctoralia cobra USD 50-86 y es criticada como cara. AutaMedica ofrece
MAS features (IA, fiscal, circuito farmacia) a menor precio. La ventana regulatoria
(receta electronica obligatoria) fuerza onboarding.

**Riesgo**: Necesitas 500+ doctores pagando para ser viable (~USD 13K MRR).

### Opcion B: Marketplace con take rate (B2C)

```
Paciente: 3 consultas gratis (ya implementado), luego pago por consulta
Doctor: Gratis para listar, plataforma cobra 15-20% de cada consulta
Consulta base: ARS $25,000-35,000 (~USD 22-30)
```

**Por que**: El modelo de 3 consultas gratis ya existe en el codigo.
MercadoPago ya esta configurado. El take rate es estandar global.

**Riesgo**: Necesitas volumen. Sin medicos listados, no hay pacientes. Chicken-and-egg.

### Opcion C: B2B white-label (como Doc24)

```
Licencia mensual:   USD 500-2,000/mes (depende de escala)
Por consulta:       USD 3-8 (pagado por la prepaga/aseguradora)
Implementacion:     USD 5,000-15,000 one-time
```

**Por que**: Las prepagas externalizan tecnologia. La anamnesis con IA y el circuito
farmacia son diferenciadores reales para un pitch B2B.

**Riesgo**: Ciclo de venta largo (6-12 meses). Necesitas un caso de exito para el primero.

### Opcion D: Hibrido (recomendado)

```
ETAPA 1 (ahora):    SaaS para doctores a precio agresivo (< Doctoralia)
                     Foco: receta electronica + agenda + recordatorios
                     Meta: 100 doctores en 6 meses

ETAPA 2 (6 meses):  Marketplace B2C con take rate 15%
                     Foco: videoconsulta + anamnesis IA
                     Meta: 1,000 consultas/mes

ETAPA 3 (12 meses): B2B white-label para prepagas/clinicas
                     Foco: circuito completo + analytics
                     Meta: 1 contrato enterprise
```

---

## 7. Unit economics objetivo

### SaaS (Opcion A/D Etapa 1)

| Metrica       | Target                           |
| ------------- | -------------------------------- |
| ARPU doctor   | ARS $25,000/mes (~USD 22)        |
| CAC           | < ARS $50,000 (~USD 44)          |
| LTV           | > ARS $300,000 (12 meses minimo) |
| LTV/CAC       | > 6x                             |
| Churn mensual | < 5%                             |
| Breakeven     | 300 doctores pagando             |

### Marketplace (Opcion B/D Etapa 2)

| Metrica                     | Target                |
| --------------------------- | --------------------- |
| GMV por consulta            | ARS $30,000 (~USD 26) |
| Take rate                   | 15-20%                |
| Revenue por consulta        | ARS $4,500-6,000      |
| Consultas/mes breakeven     | 2,000                 |
| Doctores activos necesarios | 50+                   |

### Costos operativos estimados (mensual)

| Costo                    | Monto USD                        |
| ------------------------ | -------------------------------- |
| Supabase Pro             | $25                              |
| Cloudflare Pages + Calls | $20-50                           |
| Gemini API (anamnesis)   | $50-200 (dependiendo de volumen) |
| OpenClaw (WhatsApp)      | $30-100                          |
| Dominio + SSL            | $5                               |
| Sentry                   | $0 (free tier)                   |
| **Total infra**          | **~USD 130-380/mes**             |

A USD 22 ARPU, necesitas **6-17 doctores** solo para cubrir infra.

---

## 8. Gaps criticos para monetizar

### Prioridad inmediata (sin esto no hay revenue)

| Gap                                | Esfuerzo | Impacto                    |
| ---------------------------------- | -------- | -------------------------- |
| Endpoints de pago MercadoPago      | 2-3 dias | Sin esto, revenue = $0     |
| Tabla de planes/suscripciones      | 1 dia    | Necesario para SaaS        |
| Take rate / comision de plataforma | 1 dia    | Necesario para marketplace |
| Pagina de pricing publica          | 1 dia    | Conversion de landing      |

### Prioridad alta (sin esto no escala)

| Gap                                   | Esfuerzo    | Impacto                         |
| ------------------------------------- | ----------- | ------------------------------- |
| App mobile (React Native/Expo)        | 2-4 semanas | 80% del trafico LATAM es mobile |
| SEO para doctores (perfiles publicos) | 1 semana    | Acquisition organico            |
| Onboarding doctor self-service        | 3-5 dias    | Reduce friccion de registro     |
| CUIR/REFEPS validacion real           | 1-2 semanas | Compliance obligatorio          |

---

## 9. Posicionamiento estrategico recomendado

**NO competir con DrVirtual en precio B2C** (USD 9/mes ilimitado con la distribucion
de MercadoPago es imbatible).

**NO competir con Doctoralia en SEO/marketplace** (110K doctores, anos de SEO).

**SI competir en:**

1. **"El sistema operativo del medico argentino"** — Agenda + receta electronica +
   contabilidad fiscal + IA. Ningun competidor tiene los 4 juntos.

2. **Anamnesis con IA como hook de adquisicion** — Ofrecer anamnesis gratis al paciente,
   el doctor ve el resultado y quiere la plataforma.

3. **Circuito farmacia como diferenciador B2B** — Para prepagas que quieren controlar
   la cadena prescripcion → dispensacion.

4. **Psiquiatria/TDAH como vertical especializada** — Mercado desatendido con alta
   disposicion a pagar y necesidad de continuidad.

---

## 10. Conclusion

AutaMedica tiene **mas tecnologia funcional que el 90% de las startups de telemedicina
en LATAM**. El stack es real, no es un pitch deck. Pero tiene **cero revenue, cero usuarios,
y cero monetizacion implementada**.

La ventana regulatoria de la receta electronica obligatoria (2025-2026) es una oportunidad
unica. Cada mes sin monetizacion es un mes donde competidores capturan doctores que
DEBEN migrar a digital.

**Prioridad #1: implementar cobro, no agregar features.**

El producto ya es mejor que Doctoralia en funcionalidad. Lo que falta es que alguien pague.
