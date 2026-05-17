"use client";

import { useEffect, useRef } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase-browser";
import { logger } from "@autamedica/shared";

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos

/**
 * Hook: Doctor Presence Heartbeat.
 * Envía una señal periódica a la base de datos mientras el dashboard esté abierto.
 * Permite medir el uptime real de los profesionales.
 */
export function useDoctorHeartbeat(doctorId?: string): void {
  const supabase = getBrowserSupabaseClient();
  const lastSentRef = useRef<number>(0);

  useEffect(() => {
    if (!doctorId) return;

    const sendHeartbeat = async () => {
      // Evitar envíos duplicados si el efecto se dispara rápido
      const now = Date.now();
      if (now - lastSentRef.current < 30000) return; // 30 segundos de cooldown
      
      try {
        const { error } = await supabase
          .from("doctor_heartbeats")
          .insert({
            doctor_id: doctorId,
            metadata: {
              url: window.location.pathname,
              userAgent: navigator.userAgent,
            },
          });

        if (error) {
          logger.error("[useDoctorHeartbeat] Error sending heartbeat", error);
        } else {
          lastSentRef.current = now;
        }
      } catch (err) {
        logger.error("[useDoctorHeartbeat] Unexpected error", err);
      }
    };

    // Enviar primer latido al montar
    void sendHeartbeat();

    // Configurar intervalo
    const intervalId = setInterval(() => {
      void sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [doctorId, supabase]);
}
