export interface WelcomeEmailContent {
  paragraphs: string[];
  actionLabel: string;
  actionUrl: string;
}

export function composeWelcomeEmail(
  recipientRole: string,
  actionUrl: string | undefined,
): WelcomeEmailContent {
  const isDoctor = recipientRole === 'doctor';

  return {
    paragraphs: isDoctor
      ? [
          'Tu cuenta profesional en AutaMedica ya esta lista.',
          'Completa tu perfil y validacion profesional para preparar tu agenda, atender pacientes y emitir documentacion clinica desde un mismo lugar.',
        ]
      : [
          'Tu cuenta en AutaMedica ya esta lista.',
          'Completa tu anamnesis, ordena tu informacion clinica y prepara una consulta con mas contexto para el profesional.',
        ],
    actionLabel: isDoctor ? 'Completar perfil profesional' : 'Completar anamnesis',
    actionUrl: actionUrl || (isDoctor
      ? 'https://doctor.autamedica.com/doctors/perfil'
      : 'https://patients.autamedica.com/patients/anamnesis'),
  };
}
