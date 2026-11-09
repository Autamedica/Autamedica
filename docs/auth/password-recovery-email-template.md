# Plantilla de recuperación de contraseña de AutaMedica

## Objetivo y diagnóstico

La plantilla de recuperación no debe enviar al usuario directamente al enlace de verificación de un solo uso `{{ .ConfirmationURL }}`. Los clientes de correo y sus sistemas de protección pueden inspeccionar o previsualizar enlaces antes de que la persona los abra. En los registros de producción del 9 de noviembre de 2026 se observaron solicitudes repetidas a `/auth/v1/verify` y errores `One-time token not found`; los registros muestran contexto de Gmail/Android, pero no permiten afirmar por sí solos que el origen fuera un escáner automático.

## Configuración en Supabase

En Supabase Dashboard → Authentication → Email Templates → Reset Password:

- **Subject:** `Restablece tu contraseña de AutaMedica`
- **Body:** sustituir el contenido por el HTML siguiente.

La plantilla utiliza el nombre de marca como encabezado de texto. No depende de una imagen externa que pueda quedar bloqueada por el cliente de correo.

```html
<div style="margin:0;padding:30px 12px;background:#F8FBFF;font-family:Arial,sans-serif;color:#0F172A;">
  <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #DCE9F5;border-radius:16px;overflow:hidden;">
    <div style="background:#0F172A;text-align:center;padding:28px 20px;">
      <h1 style="margin:0;color:#FFFFFF;font-size:27px;font-weight:700;letter-spacing:-1px;">AutaMedica</h1>
      <p style="margin:7px 0 0;color:#BAE6FD;font-size:11px;letter-spacing:2px;">SALUD DIGITAL</p>
    </div>
    <div style="padding:32px 26px;">
      <h2 style="margin:0 0 18px;font-size:25px;color:#0F172A;">Restablecer contraseña</h2>
      <p style="font-size:15px;line-height:1.7;color:#475569;">Recibimos una solicitud para restablecer la contraseña de tu cuenta de AutaMedica.</p>
      <div style="text-align:center;margin:30px 0;">
        <a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=recovery"
           style="display:inline-block;background:#0EA5E9;color:#FFFFFF;text-decoration:none;font-weight:bold;padding:16px 28px;border-radius:10px;font-size:15px;">
          Restablecer mi contraseña
        </a>
      </div>
      <p style="font-size:13px;line-height:1.7;color:#64748B;">Si no solicitaste este cambio, puedes ignorar este correo. Tu contraseña actual seguirá siendo la misma.</p>
      <p style="font-size:13px;color:#64748B;">Por seguridad, este enlace es de un solo uso.</p>
    </div>
    <div style="background:#F8FBFF;border-top:1px solid #DCE9F5;text-align:center;padding:20px;">
      <p style="margin:0;font-size:12px;color:#64748B;">AutaMedica · Salud digital para todos.</p>
    </div>
  </div>
</div>
```

## Intercambio del token

La aplicación recibe `/auth/reset-password?token_hash=...&type=recovery` y no consume el token durante la carga inicial. Solo la acción explícita del usuario debe ejecutar:

```ts
await supabase.auth.verifyOtp({
  token_hash,
  type: 'recovery',
});
```

La sesión resultante habilita el formulario de nueva contraseña. El mínimo de contraseña configurado actualmente para producción es de 12 caracteres.

## Reglas de seguridad y validación

- Mantener la lista de URLs de redirección limitada a los orígenes y rutas reales de AutaMedica; no añadir comodines ni dominios externos innecesarios.
- Desactivar el seguimiento o reescritura de enlaces SMTP para los correos de Auth si el proveedor lo permite.
- No insertar tokens en analítica, logs ni herramientas de reproducción de sesión.
- Probar con una cuenta de prueba dedicada: solicitar recuperación, inspeccionar el enlace recibido, abrirlo una vez, confirmar explícitamente el enlace en la página, establecer una contraseña de al menos 12 caracteres, iniciar sesión con la nueva y comprobar que la anterior ya no funciona.

**Gate de despliegue:** esta plantilla es una configuración del Dashboard de Supabase, no un archivo de configuración remoto controlado por el commit de aplicación. Actualizar el repositorio no modifica automáticamente la plantilla de producción. El flujo no se considera completado hasta guardar y releer la plantilla remota y ejecutar el E2E.
