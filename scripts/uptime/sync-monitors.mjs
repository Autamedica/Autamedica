#!/usr/bin/env node

/**
 * AutaMedica Uptime Kuma Sync Script
 * 
 * Este script sincroniza los monitores de Uptime Kuma con la infraestructura actual de AutaMedica.
 * Utiliza la API de Uptime Kuma (requiere un bridge REST o soporte nativo de API key).
 */

import 'dotenv/config';
import { env } from 'process';

const UPTIME_KUMA_URL = env.UPTIME_KUMA_URL || 'http://localhost:3010';
const API_KEY = env.UPTIME_KUMA_API_KEY;

if (!API_KEY) {
  console.error('❌ Error: UPTIME_KUMA_API_KEY no encontrada en .env');
  process.exit(1);
}

const MONITORS = [
  {
    name: 'AutaMedica - Web App',
    url: 'https://autamedica-web-app.pages.dev',
    type: 'http',
    interval: 60,
    tags: ['frontend', 'production']
  },
  {
    name: 'AutaMedica - Doctors Portal',
    url: 'https://autamedica-doctors.pages.dev',
    type: 'http',
    interval: 60,
    tags: ['frontend', 'doctors']
  },
  {
    name: 'AutaMedica - Patients Portal',
    url: 'https://autamedica-patients.pages.dev',
    type: 'http',
    interval: 60,
    tags: ['frontend', 'patients']
  },
  {
    name: 'AutaMedica - Supabase API',
    url: 'https://qxjjrpksmwwrmubhvjew.supabase.co/rest/v1/',
    type: 'http',
    interval: 30,
    tags: ['backend', 'database']
  },
  {
    name: 'AutaMedica - Signaling Server',
    url: 'wss://autamedica-signaling-server.pages.dev',
    type: 'tcp-port',
    port: 443,
    interval: 30,
    tags: ['backend', 'webrtc']
  }
];

async function syncMonitors() {
  console.log(`📡 Sincronizando monitores con ${UPTIME_KUMA_URL}...`);

  for (const monitor of MONITORS) {
    try {
      // Intentamos crear o actualizar vía REST (asumiendo wrapper compatible con Authorization header)
      const response = await fetch(`${UPTIME_KUMA_URL}/api/monitors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify(monitor)
      });

      if (response.ok) {
        console.log(`✅ Monitor sincronizado: ${monitor.name}`);
      } else {
        const error = await response.text();
        console.warn(`⚠️  Fallo al sincronizar ${monitor.name}: ${error}`);
        
        // Fallback: Si el endpoint /api/monitors no existe, 
        // probablemente se requiera Socket.io o la versión de Uptime Kuma sea diferente.
        if (response.status === 404) {
          console.error('❌ Error: No se encontró el endpoint de API. Asegúrate de tener habilitada la API REST o el bridge correspondiente.');
          break;
        }
      }
    } catch (error) {
      console.error(`❌ Error de conexión: ${error.message}`);
    }
  }
}

syncMonitors().then(() => console.log('🏁 Sincronización completada.'));
