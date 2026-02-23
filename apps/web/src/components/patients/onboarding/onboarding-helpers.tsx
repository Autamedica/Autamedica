/**
 * Helpers para integrar Auta AI en el onboarding
 */

import { type OnboardingStepInfo } from '@/hooks/patients/useOnboardingContext';

/**
 * Genera HTML de mini-chat de Auta para un paso del onboarding
 */
export function generateAutaMiniChatHTML(stepInfo: OnboardingStepInfo): string {
  const { autaTip, suggestedQuestions } = stepInfo;

  return `
    <div class="auta-minichat-container" style="margin-top: 1rem; border-radius: 0.75rem; border: 2px solid #e7e5e4; background: linear-gradient(to bottom right, #fafaf9, white); overflow: hidden;">
      <!-- Header -->
      <button
        class="auta-minichat-header"
        onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'; this.querySelector('.chevron').textContent = this.nextElementSibling.style.display === 'none' ? '▼' : '▲';"
        style="width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 0.75rem; background: white; border: none; cursor: pointer; transition: background-color 0.2s;"
        onmouseover="this.style.backgroundColor='#f5f5f4'"
        onmouseout="this.style.backgroundColor='white'"
      >
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <div style="display: flex; align-items: center; justify-center; width: 2rem; height: 2rem; border-radius: 9999px; background: linear-gradient(to bottom right, #57534e, #1c1917); color: white;">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="10" x="3" y="11" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" x2="8" y1="16" y2="16"/><line x1="16" x2="16" y1="16" y2="16"/></svg>
          </div>
          <div style="text-align: left;">
            <p style="font-size: 0.875rem; font-weight: 600; color: #1c1917; margin: 0;">🤖 Pregúntale a Auta</p>
            <p style="font-size: 0.75rem; color: #57534e; margin: 0;">Asistente IA de este paso</p>
          </div>
        </div>
        <span class="chevron" style="color: #57534e;">▼</span>
      </button>

      <!-- Content -->
      <div class="auta-minichat-content" style="display: none; border-top: 1px solid #e7e5e4; background: white; padding: 1rem; max-height: 400px; overflow-y: auto;">
        <!-- Auta's Tip -->
        <div style="border-radius: 0.5rem; background: #fafaf9; border: 1px solid #e7e5e4; padding: 0.75rem; margin-bottom: 0.75rem;">
          <div style="display: flex; align-items: start; gap: 0.5rem;">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#44403c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-top: 0.125rem;"><rect width="18" height="10" x="3" y="11" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" x2="8" y1="16" y2="16"/><line x1="16" x2="16" y1="16" y2="16"/></svg>
            <p style="font-size: 0.875rem; color: #44403c; line-height: 1.5; margin: 0;">${autaTip}</p>
          </div>
        </div>

        <!-- Suggested Questions -->
        <div>
          <p style="font-size: 0.75rem; font-weight: 600; color: #57534e; margin-bottom: 0.5rem;">💬 Preguntas frecuentes:</p>
          <div style="display: flex; flex-direction: column; gap: 0.5rem;">
            ${suggestedQuestions.map((question, idx) => `
              <button
                class="auta-question-btn-${idx}"
                onclick="
                  const answer = this.parentElement.parentElement.querySelector('.auta-answer-${idx}');
                  answer.style.display = answer.style.display === 'none' ? 'block' : 'none';
                  this.style.borderColor = answer.style.display === 'none' ? '#e7e5e4' : '#57534e';
                  this.style.backgroundColor = answer.style.display === 'none' ? 'white' : '#f5f5f4';
                "
                style="width: 100%; text-align: left; border-radius: 0.5rem; border: 1px solid #e7e5e4; padding: 0.5rem 0.75rem; font-size: 0.75rem; background: white; color: #44403c; cursor: pointer; transition: all 0.2s;"
                onmouseover="this.style.borderColor='#a8a29e'; this.style.backgroundColor='#fafaf9'"
                onmouseout="this.style.borderColor='#e7e5e4'; this.style.backgroundColor='white'"
              >
                ${question}
              </button>
              <div class="auta-answer-${idx}" style="display: none; border-radius: 0.5rem; border: 2px solid #bbf7d0; background: #f0fdf4; padding: 0.75rem; margin-bottom: 0.5rem;">
                <div style="display: flex; align-items: start; gap: 0.5rem;">
                  <div style="display: flex; align-items: center; justify-center; width: 1.5rem; height: 1.5rem; border-radius: 9999px; background: #16a34a; color: white; flex-shrink: 0;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="10" x="3" y="11" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" x2="8" y1="16" y2="16"/><line x1="16" x2="16" y1="16" y2="16"/></svg>
                  </div>
                  <p style="font-size: 0.875rem; color: #14532d; line-height: 1.5; margin: 0;">${getQuickAnswer(question)}</p>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Call to Action -->
        <div style="text-align: center; padding-top: 0.5rem; margin-top: 0.75rem; border-top: 1px solid #e7e5e4;">
          <button
            onclick="window.dispatchEvent(new CustomEvent('open-auta-chat'))"
            style="font-size: 0.75rem; font-weight: 600; color: #44403c; text-decoration: underline; background: none; border: none; cursor: pointer;"
            onmouseover="this.style.color='#1c1917'"
            onmouseout="this.style.color='#44403c'"
          >
            💬 Abrir chat completo con Auta AI
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Respuestas rápidas para preguntas frecuentes
 */
function getQuickAnswer(question: string): string {
  const answers: Record<string, string> = {
    '¿Qué puedo hacer en AutaMedica?': 'AutaMedica integra telemedicina, historial médico, screenings preventivos y comunidad. Todo en un solo lugar.',
    '¿Cómo funciona la plataforma?': 'Es simple: navega por el menú, completa tu perfil, agenda citas o inicia videoconsultas. Auta AI te guía en cada paso.',
    '¿Es seguro mi historial médico?': 'Sí, cumplimos con HIPAA. Tu información está encriptada y solo tú y tus médicos autorizados pueden acceder.',
    '¿Dónde veo mis citas?': 'En 📅 Citas Médicas. Ahí puedes agendar, ver próximas y consultar historial.',
    '¿Cómo accedo a mi historial?': 'En 📋 Historial Médico encontrarás medicamentos, alergias, cirugías y condiciones.',
    '¿Qué hay en cada sección?': 'Inicio: dashboard. Anamnesis: historia clínica. Historial: registros. Preventiva: screenings. Citas: agenda. Telemedicina: videoconsultas.',
    '¿Qué es la anamnesis?': 'Es un cuestionario médico completo que ayuda a los doctores a conocer tu salud integral.',
    '¿Por qué debo completarla?': 'Mejora significativamente la calidad de tus consultas. El médico conoce tu historia antes de atenderte.',
    '¿Cuánto tiempo toma?': 'Aproximadamente 10-15 minutos. Puedes guardar y continuar después.',
    '¿Es obligatorio completarla?': 'No, pero es muy recomendado para mejores diagnósticos.',
    '¿Cómo agrego medicamentos?': 'Historial Médico → Medicamentos → ➕ Agregar. Incluye nombre, dosis y frecuencia.',
    '¿Puedo ver mis recetas?': 'Sí, las recetas digitales aparecen automáticamente después de cada consulta.',
    '¿Qué es HIPAA?': 'Ley de privacidad médica que garantiza que tu información de salud esté protegida y confidencial.',
    '¿Los médicos ven todo mi historial?': 'Solo los médicos que tú autorices pueden ver tu información. Tienes control total.',
    '¿Qué screenings necesito?': 'Según tu edad y género, te mostramos screenings personalizados (PSA, mamografía, colonoscopia, etc).',
    '¿Cada cuánto debo hacerme chequeos?': 'Varía por tipo: presión arterial anual, colonoscopia cada 10 años, mamografía cada 2 años.',
    '¿Qué es un screening PSA?': 'Análisis de sangre para detectar problemas de próstata. Recomendado para hombres 50+.',
    '¿Por qué la colonoscopia es importante?': 'Detecta cáncer colorrectal temprano cuando es más tratable. Crucial para mayores de 50.',
    '¿Qué es la Ley 27.610?': 'Garantiza el derecho a la Interrupción Voluntaria y Legal del Embarazo hasta semana 14 en Argentina.',
    '¿Qué derechos tengo?': 'Derecho a información, acceso gratuito, confidencialidad y atención sin discriminación.',
    '¿Es confidencial la información?': 'Sí, toda información es estrictamente confidencial y protegida por secreto médico.',
    '¿Cómo accedo a IVE/ILE?': 'Agenda una consulta con ginecología. Recibirás información completa y acompañamiento profesional.',
    '¿Cómo agendo una cita?': 'Citas Médicas → ➕ Nueva Cita → Selecciona especialidad y horario disponible.',
    '¿Qué especialistas hay?': 'Cardiología, ginecología, urología, medicina general, pediatría y más.',
    '¿Puedo cancelar o reprogramar?': 'Sí, hasta 24hs antes sin cargo. Después aplican políticas de cancelación.',
    '¿Recibo recordatorios?': 'Sí, enviamos recordatorios 24hs antes por email y notificación push.',
    '¿Cómo funcionan las videoconsultas?': 'El médico envía link, haces click, y se abre videollamada. Incluye chat y compartir archivos.',
    '¿Necesito cámara y micrófono?': 'Sí, puede ser desde computadora, tablet o celular con cámara y micrófono.',
    '¿Puedo compartir estudios?': 'Sí, puedes compartir imágenes, PDFs y archivos durante la videoconsulta.',
    '¿Me dan recetas digitales?': 'Sí, el médico envía recetas digitales durante o después de la consulta.',
    '¿Cómo funciona la comunidad?': 'Puedes crear publicaciones, comentar, unirte a grupos temáticos y recibir apoyo.',
    '¿Es anónimo?': 'Puedes usar tu nombre real o pseudónimo. Tú decides cuánta información compartir.',
    '¿Hay grupos de apoyo?': 'Sí, para diabetes, cáncer, salud mental, embarazo y más condiciones.',
    '¿Puedo crear publicaciones?': 'Sí, puedes compartir experiencias, hacer preguntas y apoyar a otros pacientes.',
    '¿Qué son las acciones rápidas?': 'Atajos para tareas frecuentes: medir presión, registrar síntomas, solicitar recetas.',
    '¿Cómo registro mi presión?': 'Acciones Rápidas → 💓 Registrar Presión → Ingresa valores → Guardar.',
    '¿Puedo anotar síntomas?': 'Sí, con intensidad, duración y notas. Útil para consultas médicas.',
    '¿Cómo solicito una receta?': 'Acciones Rápidas → 💊 Solicitar Receta → Medicamento → Médico revisa.',
    '¿Qué es Auta AI?': 'Tu asistente médico inteligente. Responde preguntas sobre tu salud y te ayuda a navegar.',
    '¿Puedo exportar mis datos?': 'Sí, puedes exportar todo tu historial en PDF o JSON desde Perfil → Exportar Datos.',
    '¿Hay tours para cada sección?': 'Sí, accede desde 📚 Centro de Ayuda (botón inferior izquierdo).',
    '¿Cómo activo las notificaciones?': 'Configuración → Notificaciones → Activa las que prefieras (email, push, SMS).',
  };

  // Buscar respuesta exacta o por keyword
  for (const [key, answer] of Object.entries(answers)) {
    if (question === key) return answer;
  }

  return 'Haz click en "💬 Abrir chat completo" para preguntar a Auta AI.';
}
