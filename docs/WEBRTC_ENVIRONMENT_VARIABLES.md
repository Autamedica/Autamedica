# 📡 Variables de Entorno WebRTC - AutaMedica

Esta guía documenta todas las variables de entorno necesarias para configurar la funcionalidad de telemedicina WebRTC en AutaMedica.

## 🔧 Variables de Signaling Server

### `NEXT_PUBLIC_WEBRTC_SIGNALING_URL`

- **Descripción**: URL del servidor de signaling WebSocket
- **Tipo**: `string`
- **Requerido**: Opcional
- **Default**: `wss://autamedica-signaling-server.marques-eduardo95466020.workers.dev/signaling`
- **Ejemplo**:
  ```bash
  NEXT_PUBLIC_WEBRTC_SIGNALING_URL=wss://your-signaling-server.com/signaling
  ```

### `NEXT_PUBLIC_SIGNALING_IMPL`

- **Descripción**: Implementación de signaling a usar
- **Tipo**: `'node' | 'cloudflare' | 'auto'`
- **Requerido**: Opcional
- **Default**: `auto`
- **Ejemplo**:
  ```bash
  NEXT_PUBLIC_SIGNALING_IMPL=cloudflare
  ```

## 🧊 Variables de ICE Servers (STUN/TURN)

### `NEXT_PUBLIC_ICE_SERVERS` (Recomendado)

- **Descripción**: Configuración completa de servidores ICE en formato JSON
- **Tipo**: `string` (JSON válido)
- **Requerido**: Opcional
- **Default**: Servidores STUN públicos de Google
- **Formato**:
  ```json
  [
    {
      "urls": "stun:stun.l.google.com:19302"
    },
    {
      "urls": ["turn:turn.autamedica.com:3478", "turns:turn.autamedica.com:5349"],
      "username": "u-1695920000",
      "credential": "temp-credential-abc123",
      "credentialType": "password"
    }
  ]
  ```
- **Ejemplo**:
  ```bash
  NEXT_PUBLIC_ICE_SERVERS='[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:turn.autamedica.com:3478","username":"user","credential":"pass"}]'
  ```

### `NEXT_PUBLIC_STUN_SERVER` (Fallback)

- **Descripción**: Servidor STUN único (usado si `NEXT_PUBLIC_ICE_SERVERS` no está configurado)
- **Tipo**: `string`
- **Requerido**: Opcional
- **Default**: `stun:stun.l.google.com:19302`
- **Ejemplo**:
  ```bash
  NEXT_PUBLIC_STUN_SERVER=stun:custom-stun.autamedica.com:19302
  ```

## 🔄 Variables de TURN Server

### `TURN_SERVER_URL`

- **Descripción**: URL del servidor TURN
- **Tipo**: `string`
- **Requerido**: Opcional (recomendado para producción)
- **Formato**: `turn:hostname:puerto` o `turns:hostname:puerto`
- **Ejemplo**:
  ```bash
  TURN_SERVER_URL=turn:turn.autamedica.com:3478
  ```

### `TURN_USERNAME`

- **Descripción**: Usuario para autenticación TURN (credenciales estáticas)
- **Tipo**: `string`
- **Requerido**: Opcional
- **Ejemplo**:
  ```bash
  TURN_USERNAME=autamedica-user
  ```

### `TURN_PASSWORD`

- **Descripción**: Contraseña para autenticación TURN (credenciales estáticas)
- **Tipo**: `string`
- **Requerido**: Opcional
- **Ejemplo**:
  ```bash
  TURN_PASSWORD=secure-turn-password
  ```

### `TURN_SECRET`

- **Descripción**: Secreto compartido para generar credenciales TURN temporales
- **Tipo**: `string`
- **Requerido**: Opcional (alternativa a credenciales estáticas)
- **Ejemplo**:
  ```bash
  TURN_SECRET=your-turn-server-shared-secret
  ```

### `TURN_REALM`

- **Descripción**: Realm del servidor TURN
- **Tipo**: `string`
- **Requerido**: Opcional
- **Default**: `autamedica.com`
- **Ejemplo**:
  ```bash
  TURN_REALM=autamedica.com
  ```

## 🔧 Configuraciones por Entorno

### Desarrollo Local

```bash
# .env.local
NEXT_PUBLIC_WEBRTC_SIGNALING_URL=ws://localhost:8080/signaling
NEXT_PUBLIC_SIGNALING_IMPL=node
NEXT_PUBLIC_ICE_SERVERS='[{"urls":"stun:stun.l.google.com:19302"}]'
```

### Staging

```bash
# .env.staging
NEXT_PUBLIC_WEBRTC_SIGNALING_URL=wss://staging-signaling.autamedica.com/signaling
NEXT_PUBLIC_SIGNALING_IMPL=cloudflare
NEXT_PUBLIC_ICE_SERVERS='[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:turn-staging.autamedica.com:3478","username":"staging-user","credential":"staging-pass"}]'
```

### Producción

```bash
# .env.production (Cloudflare Pages)
NEXT_PUBLIC_WEBRTC_SIGNALING_URL=wss://signaling.autamedica.com/signaling
NEXT_PUBLIC_SIGNALING_IMPL=cloudflare
NEXT_PUBLIC_ICE_SERVERS='[{"urls":"stun:stun.l.google.com:19302"},{"urls":["turn:turn.autamedica.com:3478","turns:turn.autamedica.com:5349"],"username":"prod-user","credential":"secure-credential"}]'
TURN_SECRET=your-production-turn-secret
```

## 🧪 Configuración de Testing

### Para Tests E2E

```bash
# .env.test
NEXT_PUBLIC_WEBRTC_SIGNALING_URL=ws://localhost:8081/signaling
NEXT_PUBLIC_SIGNALING_IMPL=node
NEXT_PUBLIC_ICE_SERVERS='[{"urls":"stun:stun.l.google.com:19302"}]'
```

## 🔍 Validación de Configuración

Para validar que las variables están correctamente configuradas, usa el helper de validación:

```typescript
import { getIceServersConfig, validateIceServersConfig } from "@autamedica/telemedicine";

// Obtener configuración actual
const servers = getIceServersConfig();

// Validar configuración
const isValid = validateIceServersConfig(servers);

if (!isValid) {
  console.error("ICE servers configuration is invalid");
}
```

## 🚨 Troubleshooting

### Error: "Connection failed behind NAT"

- **Causa**: No hay servidores TURN configurados
- **Solución**: Configurar `TURN_SERVER_URL` y credenciales

### Error: "Invalid ICE servers JSON"

- **Causa**: JSON malformado en `NEXT_PUBLIC_ICE_SERVERS`
- **Solución**: Validar JSON usando `JSON.parse()` o herramientas online

### Error: "TURN authentication failed"

- **Causa**: Credenciales TURN incorrectas o expiradas
- **Solución**: Verificar `TURN_USERNAME`/`TURN_PASSWORD` o `TURN_SECRET`

## 📋 Checklist de Configuración

- [ ] `NEXT_PUBLIC_WEBRTC_SIGNALING_URL` configurado para el entorno
- [ ] `NEXT_PUBLIC_SIGNALING_IMPL` apropiado para la infraestructura
- [ ] `NEXT_PUBLIC_ICE_SERVERS` con JSON válido
- [ ] Al menos un servidor STUN configurado
- [ ] Servidor TURN configurado para producción
- [ ] Credenciales TURN válidas y seguras
- [ ] Variables agregadas a Cloudflare Pages (producción)
- [ ] Configuración validada con helpers de testing

## 🔗 Referencias

- [RTCIceServer - MDN](https://developer.mozilla.org/en-US/docs/Web/API/RTCIceServer)
- [STUN/TURN Protocols](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Protocols)
- [Cloudflare Pages Environment Variables](https://developers.cloudflare.com/pages/configuration/build-configuration/)

## 📝 Ejemplo Completo

```bash
# Configuración completa para producción
NEXT_PUBLIC_WEBRTC_SIGNALING_URL=wss://signaling.autamedica.com/signaling
NEXT_PUBLIC_SIGNALING_IMPL=cloudflare
NEXT_PUBLIC_ICE_SERVERS='[
  {
    "urls": "stun:stun.l.google.com:19302"
  },
  {
    "urls": "stun:stun1.l.google.com:19302"
  },
  {
    "urls": ["turn:turn.autamedica.com:3478", "turns:turn.autamedica.com:5349"],
    "username": "autamedica-user",
    "credential": "secure-credential-2024",
    "credentialType": "password"
  }
]'
TURN_SECRET=your-turn-server-shared-secret-2024
TURN_REALM=autamedica.com
```
