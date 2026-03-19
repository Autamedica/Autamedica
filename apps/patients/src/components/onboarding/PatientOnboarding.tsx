'use client';

import { useOnboardingContext } from '@/hooks/useOnboardingContext';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useCallback, useEffect, useState } from 'react';
import { generateAutaMiniChatHTML } from './onboarding-helpers';

interface PatientOnboardingProps {
  autoStart?: boolean;
  renderLauncher?: boolean;
  launcherVariant?: 'floating' | 'sidebar';
}

export function PatientOnboarding({
  autoStart = false,
  renderLauncher = true,
  launcherVariant = 'floating',
}: PatientOnboardingProps) {
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(true);
  const { steps: onboardingSteps } = useOnboardingContext();

  const startOnboarding = useCallback(() => {
    const driverObj = driver({
      showProgress: true,
      showButtons: ['next', 'previous', 'close'],
      progressText: '{{current}} de {{total}}',
      nextBtnText: 'Siguiente →',
      prevBtnText: '← Anterior',
      doneBtnText: '¡Entendido!',
      popoverClass: 'autamedica-onboarding-popover',
      popoverOffset: 20,

      steps: [
        {
          popover: {
            title: '🏥 Bienvenido/a a AutaMedica',
            description: `
              <div style="text-align: center; padding: 0.5rem 0;">
                <p style="margin-bottom: 1rem; font-size: 1.1rem; font-weight: 600;">Tu plataforma integral de salud</p>
                <p style="margin-bottom: 1rem;">AutaMedica es tu <strong>centro de salud digital</strong> donde puedes:</p>
                <ul style="text-align: left; margin: 1rem 0; padding-left: 1.5rem; font-size: 0.95rem;">
                  <li>🎥 <strong>Hacer videoconsultas</strong> con médicos certificados</li>
                  <li>📋 <strong>Gestionar tu historia clínica</strong> completa</li>
                  <li>🛡️ <strong>Prevenir enfermedades</strong> con chequeos programados</li>
                  <li>💊 <strong>Recibir recetas digitales</strong> y recordatorios</li>
                  <li>💬 <strong>Conectar con la comunidad</strong> de pacientes</li>
                </ul>
                <p style="margin-top: 1rem; color: #0369a1; font-weight: 600;">Vamos a hacer un recorrido rápido (2 minutos) 🚀</p>
                ${generateAutaMiniChatHTML(onboardingSteps[0])}
              </div>
            `,
          }
        },
        {
          element: 'aside:first-of-type',
          popover: {
            title: '📱 Menú de Navegación',
            description: `
              Este es tu <strong>menú principal</strong> donde encontrarás todas las secciones:
              <ul style="margin-top: 0.5rem; padding-left: 1rem; font-size: 0.9rem;">
                <li>• <strong>Inicio:</strong> Dashboard con videoconsulta</li>
                <li>• <strong>Mi Historia Clínica:</strong> Anamnesis, estudios y registros en un solo lugar</li>
                <li>• <strong>Salud Preventiva:</strong> Chequeos y screenings</li>
                <li>• <strong>Salud Reproductiva:</strong> IVE/ILE según Ley 27.610</li>
                <li>• <strong>Mis Citas:</strong> Agenda y consultas</li>
              </ul>
              <p style="margin-top: 0.5rem; color: #059669;"><strong>Tip:</strong> Puedes navegar en cualquier momento</p>
            `,
            side: 'right',
            align: 'start'
          }
        },
        {
          element: 'a[href="/"]',
          popover: {
            title: '🏠 Inicio - Tu Centro de Control',
            description: `
              Tu <strong>página principal</strong> incluye:
              <ul style="margin-top: 0.5rem; padding-left: 1rem; font-size: 0.9rem;">
                <li>🎥 <strong>Videoconsulta instantánea:</strong> Conecta con médicos en minutos</li>
                <li>📊 <strong>Resumen de salud:</strong> Métricas, medicamentos, alergias</li>
                <li>⚡ <strong>Acciones rápidas:</strong> Agendar citas, medir signos vitales</li>
                <li>🏆 <strong>Gamificación:</strong> Gana puntos cuidando tu salud</li>
              </ul>
              <p style="margin-top: 0.5rem; color: #7c3aed;"><strong>Siempre volvé aquí</strong> para acceso rápido</p>
            `,
            side: 'right',
            align: 'start'
          }
        },
        {
          element: 'a[href="/medical-history"]',
          popover: {
            title: '📋 Mi Historia Clínica - Todo en un solo lugar',
            description: `
              Aquí concentras <strong>toda tu información clínica</strong>:
              <ul style="margin-top: 0.5rem; padding-left: 1rem; font-size: 0.9rem;">
                <li>📖 <strong>Anamnesis:</strong> Completa tus antecedentes sin entrar a otra sección principal</li>
                <li>🩺 <strong>Signos vitales:</strong> Presión, temperatura, peso, etc.</li>
                <li>💊 <strong>Medicamentos:</strong> Actuales y pasados con recordatorios</li>
                <li>⚠️ <strong>Alergias:</strong> Medicamentosas y alimentarias</li>
                <li>🧬 <strong>Análisis:</strong> Laboratorio, imágenes, estudios</li>
                <li>🔍 <strong>Auditoría:</strong> Sabes quién accedió a tu información y cuándo</li>
                <li>📥 <strong>Exportar:</strong> Descarga todo en PDF o JSON</li>
              </ul>
              <p style="margin-top: 0.5rem; color: #0369a1;"><strong>Una sola puerta de entrada</strong> para evitar repetición y confusión</p>
            `,
            side: 'right',
            align: 'start'
          }
        },
        {
          element: 'a[href="/preventive-health"]',
          popover: {
            title: '🛡️ Salud Preventiva - Prevenir es Curar',
            description: `
              <strong>Mantén tu salud bajo control</strong> con:
              <ul style="margin-top: 0.5rem; padding-left: 1rem; font-size: 0.9rem;">
                <li>📊 <strong>Calculadora personalizada:</strong> Qué estudios te corresponden</li>
                <li>⏰ <strong>Línea de tiempo:</strong> Screenings por edad y género</li>
                <li>📅 <strong>Recordatorios automáticos:</strong> No olvides tus chequeos</li>
                <li>🩺 <strong>22 tipos de screening:</strong> Desde PAP hasta mamografía</li>
                <li>✅ <strong>Basado en evidencia:</strong> Guías argentinas 2025</li>
              </ul>
              <p style="margin-top: 0.5rem; color: #059669;"><strong>Detectar temprano salva vidas:</strong> Prevención > Tratamiento</p>
            `,
            side: 'right',
            align: 'start'
          }
        },
        {
          element: 'a[href="/pregnancy-prevention"]',
          popover: {
            title: '💜 Salud Reproductiva - IVE/ILE',
            description: `
              <strong>Información confiable según Ley 27.610</strong>:
              <ul style="margin-top: 0.5rem; padding-left: 1rem; font-size: 0.9rem;">
                <li>📜 <strong>Tus derechos legales:</strong> IVE/ILE en Argentina</li>
                <li>🏥 <strong>Métodos disponibles:</strong> Medicamentos y quirúrgico</li>
                <li>👨‍⚕️ <strong>Especialistas certificados:</strong> Atención profesional</li>
                <li>📞 <strong>Líneas de ayuda:</strong> 0800-345-4266 gratuito</li>
                <li>🤝 <strong>Acompañamiento:</strong> Psicológico y emocional</li>
                <li>🔒 <strong>100% confidencial:</strong> Tu privacidad protegida</li>
              </ul>
              <p style="margin-top: 0.5rem; color: #9333ea;"><strong>Es tu derecho</strong>, estamos para acompañarte</p>
            `,
            side: 'right',
            align: 'start'
          }
        },
        {
          element: 'a[href="/appointments"]',
          popover: {
            title: '📅 Mis Citas - Gestión Inteligente',
            description: `
              <strong>Organiza tus consultas médicas</strong>:
              <ul style="margin-top: 0.5rem; padding-left: 1rem; font-size: 0.9rem;">
                <li>🔍 <strong>Buscar especialistas:</strong> Por especialidad y disponibilidad</li>
                <li>📆 <strong>Agendar online:</strong> Sin llamadas telefónicas</li>
                <li>🎥 <strong>Video o presencial:</strong> Tú eliges el formato</li>
                <li>📝 <strong>Preparación:</strong> Lista de preguntas y síntomas</li>
                <li>🔔 <strong>Recordatorios:</strong> No faltes a tus citas</li>
                <li>💳 <strong>Historial completo:</strong> Todas tus consultas pasadas</li>
              </ul>
              <p style="margin-top: 0.5rem; color: #ea580c;"><strong>Prepárate bien:</strong> Citas efectivas ahorran tiempo</p>
            `,
            side: 'right',
            align: 'start'
          }
        },
        {
          element: 'div.flex.h-screen > div:first-child > div:first-child',
          popover: {
            title: '🎥 Centro de Telemedicina - El Corazón de AutaMedica',
            description: `
              Este es el <strong>motor de videoconsultas</strong>:
              <ul style="margin-top: 0.5rem; padding-left: 1rem; font-size: 0.9rem;">
                <li>📹 <strong>Video HD:</strong> Calidad profesional para diagnóstico</li>
                <li>🎙️ <strong>Audio cristalino:</strong> Comunicación clara</li>
                <li>💬 <strong>Chat integrado:</strong> Comparte imágenes y documentos</li>
                <li>📋 <strong>Info médica en vivo:</strong> El médico ve tu historial</li>
                <li>🔒 <strong>Cifrado end-to-end:</strong> Máxima seguridad</li>
                <li>📊 <strong>Signos vitales:</strong> Comparte datos en tiempo real</li>
              </ul>
              <p style="margin-top: 0.5rem; color: #0891b2;"><strong>Tan efectivo como presencial</strong>, desde tu casa</p>
            `,
            side: 'bottom',
            align: 'center'
          }
        },
        {
          element: 'aside:last-of-type',
          popover: {
            title: '📊 Panel Dinámico - Información Contextual',
            description: `
              Este panel <strong>cambia según donde estés</strong>:
              <ul style="margin-top: 0.5rem; padding-left: 1rem; font-size: 0.9rem;">
                <li>💬 <strong>Comunidad:</strong> Conecta con otros pacientes</li>
                <li>🏆 <strong>Progreso:</strong> Gamificación y logros</li>
                <li>⚡ <strong>Acciones rápidas:</strong> Tareas frecuentes</li>
                <li>📱 <strong>Chat médico:</strong> Durante videollamadas</li>
                <li>📋 <strong>Preparación citas:</strong> Lista de síntomas</li>
              </ul>
              <p style="margin-top: 0.5rem; color: #7c3aed;"><strong>Siempre útil:</strong> Herramientas según el contexto</p>
            `,
            side: 'left',
            align: 'start'
          }
        },
        {
          popover: {
            title: '🎓 Funcionalidades Avanzadas',
            description: `
              <div style="padding: 0.5rem 0;">
                <p style="margin-bottom: 1rem; font-weight: 600;">También tienes acceso a:</p>
                  <ul style="text-align: left; margin: 0.5rem 0; padding-left: 1.5rem; font-size: 0.9rem;">
                    <li>🤖 <strong>Auta AI:</strong> Asistente inteligente 24/7 (botón abajo derecha)</li>
                    <li>📚 <strong>Guías interactivas:</strong> Tours paso a paso desde el sidebar</li>
                    <li>🔔 <strong>Notificaciones:</strong> Alertas de salud importantes</li>
                    <li>📊 <strong>Reportes PDF:</strong> Exporta tu información médica</li>
                    <li>🔐 <strong>Seguridad HIPAA:</strong> Máxima protección de datos</li>
                  <li>📱 <strong>Responsivo:</strong> Funciona en móvil, tablet y desktop</li>
                </ul>
              </div>
            `,
          }
        },
        {
          popover: {
            title: '🎉 ¡Listo para comenzar!',
            description: `
              <div style="text-align: center; padding: 0.5rem 0;">
                <p style="margin-bottom: 1rem; font-size: 1.1rem; font-weight: 600;">Ya conoces AutaMedica 🚀</p>
                <div style="background: #f0fdf4; border: 2px solid #86efac; border-radius: 0.5rem; padding: 1rem; margin: 1rem 0;">
                  <p style="font-weight: 600; color: #166534; margin-bottom: 0.5rem;">✅ Recuerda lo esencial:</p>
                  <ul style="text-align: left; margin: 0.5rem 0; padding-left: 1.5rem; font-size: 0.9rem; color: #15803d;">
                    <li>💾 <strong>Auto-guardado:</strong> Tu información se guarda automáticamente</li>
                    <li>🔒 <strong>Privacidad total:</strong> Controla quién ve tu historial</li>
                    <li>🎥 <strong>Video disponible:</strong> Consultas médicas cuando necesites</li>
                    <li>🏆 <strong>Gamificación:</strong> Gana puntos cuidando tu salud</li>
                    <li>💬 <strong>Comunidad:</strong> Comparte experiencias con otros pacientes</li>
                    <li>📞 <strong>Soporte 24/7:</strong> Auta AI siempre disponible</li>
                  </ul>
                </div>
                <p style="margin-top: 1rem; font-size: 1.2rem; color: #059669; font-weight: 700;">¡Empecemos a cuidar tu salud! 🌟</p>
                <p style="margin-top: 0.5rem; font-size: 0.85rem; color: #64748b;">Puedes volver a ver este tutorial desde el botón "Tutorial" del sidebar</p>
              </div>
            `,
          }
        }
      ],

      onDestroyStarted: () => {
        // Marcar onboarding como completado
        localStorage.setItem('autamedica_onboarding_completed', 'true');
        setHasSeenOnboarding(true);
        driverObj.destroy();
      }
    });

    driverObj.drive();
  }, [onboardingSteps]);

  useEffect(() => {
    // Verificar si el usuario ya vio el onboarding
    const seen = localStorage.getItem('autamedica_onboarding_completed');
    setHasSeenOnboarding(!!seen);

    if (!seen && autoStart) {
      // Pequeño delay para que el DOM esté completamente cargado
      setTimeout(() => {
        startOnboarding();
      }, 500);
    }
  }, [autoStart, startOnboarding]);

  // Botón flotante para reiniciar el onboarding
  if (hasSeenOnboarding && renderLauncher) {
    const buttonClassName = launcherVariant === 'sidebar'
      ? 'flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900'
      : 'fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-full bg-stone-800 px-4 py-2 text-white shadow-lg transition-all hover:scale-105 hover:bg-stone-700 hover:shadow-xl';

    return (
      <button
        onClick={startOnboarding}
        className={buttonClassName}
        title="Ver tutorial de nuevo"
      >
        <span className={launcherVariant === 'sidebar' ? 'text-lg' : 'text-xl'}>🎓</span>
        <span className="text-sm font-medium">Tutorial</span>
      </button>
    );
  }

  return null;
}
