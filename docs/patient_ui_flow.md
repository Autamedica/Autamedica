# Flujo de Experiencia del Paciente (Patient UI Flow) — AutaMedica

Este documento describe la interfaz y el recorrido del paciente dentro del ecosistema de AutaMedica en máximo detalle, pantalla por pantalla, con un enfoque clínico premium y orientado a la **continuidad de tratamiento**.

---

## 1. Landing Page (Puerta de Entrada)
El punto de entrada principal donde el paciente conecta con la propuesta de valor. Todo el home permanece intacto.

### Pantalla: Inicio
```text
┌──────────────────────────────────────┐
│  ➕ AUTAMEDICA          [ ES | PT ]  │
│                                      │
│  Tu médico,                          │
│  sin salas de                        │
│  guardia.                            │
│                                      │
│  La consulta empieza cuando          │
│  tú quieres.                         │
│                                      │
│  [ Buscar un médico ahora ↓ ]        │ 👈 Click aquí
│                                      │
│  ( Paciente ) ( Médico ) ( Empresa ) │
└──────────────────────────────────────┘
```

---

## 2. Autenticación (Login / Registro sin fricción)
AutaMedica usa un sistema "Passwordless" (OTP) por seguridad y conveniencia. 

### Pantalla: Ingreso de Email
```text
┌──────────────────────────────────────┐
│  ➕ AUTAMEDICA                       │
│                                      │
│  Ingresá a tu cuenta                 │
│                                      │
│  Te enviaremos un código seguro para │
│  iniciar sesión.                     │
│                                      │
│  Email:                              │
│  [ juan.perez@email.com           ]  │
│                                      │
│  [ Continuar → ]                     │ 👈 Click en Continuar
└──────────────────────────────────────┘
```

### Pantalla: Verificación OTP
```text
┌──────────────────────────────────────┐
│  Válida tu identidad                 │
│                                      │
│  Enviamos un código de 6 dígitos a   │
│  juan.perez@email.com                │
│                                      │
│  Ingresá el código:                  │
│  [ 4 ] [ 8 ] [ 2 ] [ 9 ] [ 1 ] [ 1 ] │ 👈 Ingresar código
│                                      │
│  [ Verificar y Entrar ]              │ 👈 Click en Verificar
│                                      │
│  ¿No te llegó? Reenviar en 00:45     │
└──────────────────────────────────────┘
```

---

## 3. Dashboard Principal del Paciente
El paciente entra a su hub personal. Diseño limpio, priorizando la próxima acción.

### Pantalla: Inicio Paciente
```text
┌──────────────────────────────────────┐
│  ≡ Menú              Hola, Juan 👋   │
│                                      │
│  ¿Qué necesitas hoy?                 │
│                                      │
│  [ 🩺 Consulta General            ]  │
│    Guardia médica 24/7               │
│                                      │
│  [ 🧠 Salud Mental y Psiquiatría  ]  │ 👈 Click en Salud Mental
│    Especialistas, renovación de      │
│    recetas y TDAH                    │
│                                      │
│  Tus próximas sesiones:              │
│  No tienes turnos pendientes         │
└──────────────────────────────────────┘
```

---

## 4. Intake Clínico (Bifurcación de Continuidad)
Una vez en el módulo de Psiquiatría, definimos el contexto (Primera vez vs. Seguimiento) adaptando el lenguaje para que sea más clínico y serio.

### Pantalla: Evaluación Previa
```text
┌──────────────────────────────────────┐
│  ← Volver                            │
│                                      │
│  Evaluación previa                   │
│                                      │
│  Para orientarte mejor, necesitamos  │
│  saber en qué tipo de atención estás │
│  hoy.                                │
│                                      │
│  [ 🆕 Primera consulta ]             │
│  [ 🔄 Continuidad / renovación ]     │ 👈 Click en Continuar/Renovación
└──────────────────────────────────────┘
```

### Pantalla: Actualización Clínica (Voz)
Asumiendo que el usuario elige `Continuidad / renovación`, el framing del relato cambia para no pedirle que "cuente todo de cero", sino que actualice su estado.
```text
┌──────────────────────────────────────┐
│  Actualización clínica               │
│                                      │
│  Vamos a actualizar tu estado actual │
│  antes de la consulta. Esto ayuda a  │
│  que el médico revise más rápido tu  │
│  continuidad de tratamiento.         │
│                                      │
│     [ 🎙️ Contarlo por voz ]          │ 👈 Mantiene click para hablar
│                                      │
│  ( Opciones alternativas )           │
│  [ ✍️ Prefiero escribir ]            │
└──────────────────────────────────────┘
```

### Pantalla: Revisión de la Actualización
El sistema (Gemini Live) detecta entidades, pero se presenta en tono asistencial y no como "inteligencia artificial".
```text
┌──────────────────────────────────────┐
│  Revisión de tu actualización        │
│                                      │
│  Registramos lo siguiente:           │
│                                      │
│  💊 Metilfenidato ER 54 mg           │
│  📌 Tratamiento en curso             │
│  ⚠️ Posible interrupción reciente    │
│                                      │
│  ¿Esto refleja bien tu situación?    │
│                                      │
│  [ Sí, continuar ]                   │ 👈 Click en Continuar
│  [ Editar ]                          │
└──────────────────────────────────────┘
```

---

## 5. Triage y Evaluación de Riesgo
Cuando el sistema detecta alertas (protocolo puente, dosis alta), se comunica con el paciente de una forma cuidadosa que insinúa una solución clínica transitoria sin develar la máquina interna.

### Pantalla: Revisión Adicional (Semáforo Amarillo Encubierto)
```text
┌──────────────────────────────────────┐
│  Revisión adicional                  │
│                                      │
│  🟡 Antes de continuar, tu caso      │
│  requiere una revisión médica más    │
│  cuidadosa.                          │
│                                      │
│  El profesional evaluará la mejor    │
│  forma de continuar tu tratamiento   │
│  de manera segura.                   │
│                                      │
│  En algunos casos, el profesional    │
│  puede definir una indicación        │
│  transitoria mientras completa la    │
│  evaluación.                         │
│                                      │
│  [ Entendido, agendar sesión ]       │ 👈 Click en Agendar
└──────────────────────────────────────┘
```

---

## 6. Checkout del Control
El proceso de pago elimina el lenguaje de "compra" y lo enmarca integralmente en un seguimiento de salud.

### Pantalla: Checkout
```text
┌──────────────────────────────────────┐
│  Resumen del control                 │
│                                      │
│  Tipo de atención: Control de        │
│  continuidad                         │
│                                      │
│  Valor total: $35.000                │
│                                      │
│  Medios de Pago:                     │
│  ◉ Tarjeta terminada en •••• 4242    │
│  ○ MercadoPago                       │
│                                      │
│  [ Pagar y continuar ]               │ 👈 Click en Pagar y continuar
│                                      │
│  Tu tarjeta no se cobrará            │
│  si el médico no acepta el caso.     │
└──────────────────────────────────────┘
```

---

## 7. Sala de Espera y Conexión
Tono despojado de marketplace. 100% clínico y serio.

### Pantalla: Sala de Espera
```text
┌──────────────────────────────────────┐
│  Caso recibido                       │
│                                      │
│  ✅ El Dr. Carlos Rodríguez ya está  │
│  revisando tu información clínica.   │
│                                      │
│  Te llamará en breve para realizar   │
│  la consulta.                        │
│                                      │
│  [ Ingresar al Consultorio → ]       │ 👈 Click en Ingresar (cuando on)
└──────────────────────────────────────┘
```

---

## 8. Telemedicina (Consultorio Virtual)
Idéntico a antes: Interfaz directa y sin distracciones.

### Pantalla: Videollamada
```text
┌──────────────────────────────────────┐
│ 🔴 REC          Consultorio Virtual  │
│                                      │
│  [                            ]      │
│  [    (Video del Médico)      ]      │
│  [                            ]      │
│                                      │
│  [ (Tu video) ]                      │
│                                      │
│  ( 🎤 Mute ) ( 📹 Video ) ( ❌ Fin ) │ 👈 Al terminar, click en Fin
└──────────────────────────────────────┘
```

---

## 9. Post-Sesión: Acciones
Una vez emitido el protocolo o receta, la pantalla se enfoca en "receta / medicación" y no en un resumen ambiguo.

### Pantalla: Resultado de Control
```text
┌──────────────────────────────────────┐
│  Consulta finalizada                 │
│                                      │
│  El resultado de tu control ya está  │
│  disponible.                         │
│                                      │
│  ✅ Receta digital emitida           │
│  ✅ Indicaciones cargadas            │
│                                      │
│  [ Ver mi receta ]                   │
│  [ Ver mi medicación ]               │ 👈 Click en Ver mi medicación
└──────────────────────────────────────┘
```

---

## 10. Módulo Farmacia y Dispensación
El QR pasa de ser el protagonista inmediato a ser una herramienta de validación, dándole prioridad a las instrucciones y a la trazabilidad de la farmacia.

### Pantalla: Mi Medicación Activa
```text
┌──────────────────────────────────────┐
│  ← Volver      Medicación activa     │
│                                      │
│  💊 Metilfenidato ER 54 mg           │
│  Cantidad: 7 comprimidos             │
│  Dr. Carlos Rodríguez (MN 12345)     │
│                                      │
│  Estado: 🟢 Lista para retirar       │
│                                      │
│  Farmacia asignada                   │
│  Farmacity Suc. 45                   │
│                                      │
│  [ Ver instrucciones ]               │
│  [ Mostrar código de retiro ]        │ 👈 Click en Mostrar código
└──────────────────────────────────────┘
```

### Pantalla: QR para Mostrador
Se despliega únicamente cuando el paciente está listo para interactuar con el farmacéutico.
```text
┌──────────────────────────────────────┐
│  Código de retiro                    │
│                                      │
│  Mostrá este código en la farmacia   │
│  asignada para validar la entrega.   │
│                                      │
│          █████████████████           │
│          ██ ▄▄▄ ██ ▄ ██ ▄▄           │
│          ██ ███ ██   ██ ██           │
│          ██ ▄▄▄ ██ ▄    ▄▄           │
│          █████████████████           │
│                                      │
│  ID: ORD-2026-0409-TRZ               │
│                                      │
│  [ Cerrar código ]                   │
└──────────────────────────────────────┘
```

---

## 11. Cierre del Flow (Dispensado y Seguimiento)
Al confirmarse el retiro desde la interfaz de la farmacia aliada, el paciente visualiza el cierre de su requerimiento actual pero manteniendo la noción de seguimiento.

### Pantalla: Confirmación de Retiro y Próximo Paso
```text
┌──────────────────────────────────────┐
│  ✅ Medicación retirada              │
│                                      │
│  Retiraste correctamente tu          │
│  medicación.                         │
│                                      │
│  Próximo paso                        │
│  Te recomendamos realizar tu próximo │
│  control antes del 15-04-2026.       │
│                                      │
│  [ Agendar próximo control ]         │
│  [ Volver al Inicio ]                │
└──────────────────────────────────────┘
```
