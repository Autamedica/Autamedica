// Fuente canónica de traducciones en español.
// Todas las claves en inglés (snake_case), todos los valores en español.
// Este archivo define el tipo TranslationDict que pt.ts extiende parcialmente.

export const es = {
  common: {
    backToHome: 'Volver al inicio',
    privacy: 'Privacidad',
    terms: 'Términos',
    accessibility: 'Accesibilidad',
    secureConnection: 'Conexión segura y cifrada',
    bioSecureInfra: 'Infraestructura Bio-Segura',
    hipaaLegend: 'Infraestructura Segura HIPAA Compliant',
  },

  layout: {
    defaultTitle: 'AutaMedica – Telemedicina sin fricciones',
    defaultDescription: 'Plataforma de telemedicina innovadora. Consultas médicas online, gestión de pacientes y herramientas clínicas en un solo lugar.',
    tagline: 'Tu salud, sin complicaciones.',
  },

  auth: {
    preparing: 'Preparando tu acceso',
    preparingSubtitle: 'Validando tu identidad para una conexión segura y sin fricciones.',
    accessMode: 'Modo de Acceso',
    continueWithGoogle: 'Continuar con Google',
    emailLabel: 'Email Institucional',
    emailPlaceholder: 'usuario@autamedica.com',
    passwordLabel: 'Contraseña',
    passwordPlaceholder: '••••••••',
    showPassword: 'Mostrar contraseña',
    hidePassword: 'Ocultar contraseña',
    recover: 'Recuperar',
    noAccount: '¿Sin cuenta?',
    startToday: 'Empieza hoy',
    enterSession: 'Iniciando sesión...',
    wrongCredentials: 'Credenciales incorrectas. Revisa tu correo y tu contraseña.',
    loginError: 'No pudimos iniciar sesión. Intenta nuevamente.',
    googleError: 'Error al conectar con Google.',
    googleErrorUnexpected: 'Error inesperado con Google. Intenta nuevamente.',
    pkceError: 'La sesión de autenticación expiró. Reintentando automáticamente...',
    pkceErrorManual: 'No se pudo completar la autenticación con Google. Por favor, intenta de nuevo.',
    joinTitle: 'Únete a AutaMedica',
    notYourRole: '¿No es tu rol?',
    changeHere: 'Cambiar aquí',
    alreadyHaveAccount: '¿Ya tienes cuenta en AutaMedica?',
    signIn: 'Iniciar sesión',
    createAccount: 'Crear mi cuenta',
    creating: 'Creando cuenta...',
    emailConfirmation: 'Te hemos enviado un enlace de confirmación a tu email. Revisa tu bandeja de entrada para activar tu cuenta.',
    emailAlreadyRegistered: 'Este email ya está registrado. ¿Quieres iniciar sesión?',
    selectRoleFirst: 'Debes seleccionar un rol antes de registrarte',
    minPasswordLength: 'La contraseña debe tener al menos 8 caracteres',
    passwordsDoNotMatch: 'Las contraseñas no coinciden',
    needMinPassword: 'Necesitas al menos 8 caracteres',
    passwordMinHint: 'Mínimo 8 caracteres',
    chooseProfile: 'Elige tu perfil de acceso',
    chooseProfileSubtitle: 'Entrarás al portal correcto al terminar el login.',
    continueToLogin: 'Continuar al login',
    preparingAccess: 'Preparando acceso...',
    directAccess: 'Ingreso directo',
    alreadyHaveAccountQ: '¿Ya tienes cuenta?',
    registerAs: 'Registro como',
    recoverAccess: 'Recuperar Acceso',
    recoverSubtitle: 'Introduce tu email para recibir un enlace de recuperación',
    registeredEmail: 'Correo electrónico registrado',
    sendRecoveryLink: 'Enviar enlace de recuperación',
    resendIn: 'Reenviar en',
    seconds: 's',
    rememberPassword: '¿Recordaste tu contraseña?',
    backToLogin: 'Volver al inicio de sesión',
    recoverySecure: 'Recuperación segura y cifrada',
    recoveryEmailSent: 'Te hemos enviado un enlace de recuperación a tu email. Revisa tu bandeja de entrada.',
    newPassword: 'Nueva Contraseña',
    newPasswordSubtitle: 'Introduce tu nueva contraseña para tu cuenta AutaMedica',
    newPasswordLabel: 'Nueva contraseña',
    confirmPasswordLabel: 'Confirmar contraseña',
    confirmPasswordPlaceholder: 'Repite tu contraseña',
    updatePassword: 'Actualizar contraseña',
    passwordUpdated: 'Contraseña actualizada correctamente. Serás redirigido al login...',
    requestNewLink: 'Solicitar nuevo enlace de recuperación',
    updateSecure: 'Actualización segura y cifrada',
    invalidLink: 'Enlace de recuperación inválido o expirado. Solicita uno nuevo.',
    acceptTermsPrefix: 'Acepto los',
    termsLink: 'Términos y Condiciones',
    acceptTermsMiddle: 'y la',
    privacyLink: 'Política de Privacidad',
    email: 'Correo electrónico',
    password: 'Contraseña',
    confirmPassword: 'Confirmar contraseña',
  },

  roles: {
    patient: {
      label: 'Paciente',
      shortLabel: 'Paciente',
      description: 'Agenda turnos y revisa tu historial',
      title: 'Portal de Pacientes',
      subtitle: 'Gestiona tu salud con precisión y agilidad.',
      buttonLabel: 'Entrar como Paciente',
    },
    doctor: {
      label: 'Médico',
      shortLabel: 'Médico',
      description: 'Gestiona agenda, consultas y pacientes',
      title: 'Portal Médico',
      subtitle: 'Infraestructura clínica de alto rendimiento.',
      buttonLabel: 'Entrar como Médico',
    },
    pharmacist: {
      label: 'Farmacéutico',
      shortLabel: 'Farmacia',
      description: 'Valida y dispensa recetas médicas',
      title: 'Portal de Farmacia',
      subtitle: 'Dispensación segura con trazabilidad completa.',
      buttonLabel: 'Entrar como Farmacéutico',
    },
    company_admin: {
      label: 'Empresa',
      shortLabel: 'Empresa',
      description: 'Controla la salud corporativa del equipo',
      title: 'Portal Corporativo',
      subtitle: 'Estrategias de bienestar para tu organización.',
      buttonLabel: 'Entrar como Empresa',
    },
  },

  navbar: {
    product: 'Producto',
    professionals: 'Profesionales',
    specialties: 'Especialidades',
    access: 'Acceso',
    openMenu: 'Abrir accesos de cuenta',
    quickAccess: 'Ingreso Rápido',
    chooseProfile: 'Elegir perfil',
    chooseProfileSubtitle: 'Elige tu perfil y entra en segundos',
    enterAs: 'Ingresar como',
  },

  landing: {
    symptomTitle: '¿Qué necesitas hoy?',
    symptomSubtitle: 'Selecciona un síntoma y te recomendamos la especialidad adecuada',
    premiumNarrative: {
      kicker: 'No es solo una videollamada',
      title: 'La sala de espera era el problema, no el médico',
      copy: 'En LATAM, millones de consultas se posponen por distancia, tiempo o costo del traslado. AutaMedica conecta pacientes con médicos verificados — en Buenos Aires, Bogotá, Lima o donde estés.',

      sideTitle: 'Lo que sí podemos prometerte',
      pillars: [
        {
          title: 'Sin traslado, sin espera',
          detail: 'Consultas desde tu barrio, desde el trabajo, desde Mendoza si estás de viaje. El médico es el que conecta.',
        },
        {
          title: 'Médicos con matrícula verificada',
          detail: 'Cada profesional tiene matrícula activa en su país. No es IA ni chatbot — es un médico real que firma la receta.',
        },
        {
          title: 'Tu historial en tu celular',
          detail: 'Recetas, indicaciones y seguimiento en tu teléfono. La farmacia acepta la receta digital.',
        },
      ],
    },
    testimonials: {
      title: 'Casos reales, no marketing',
      subtitle: 'Lo que escribieron pacientes y médicos de Argentina, Colombia y Perú que usan AutaMedica',
      items: [
        {
          name: 'Carlos Ruiz',
          role: 'Paciente · Córdoba, Argentina',
          avatar: '/images/testi_carlos.webp',
          context: 'Reacción alérgica un domingo a las 3pm',
          quote: 'Con la cara hinchada, encontré turno con una dermatóloga en 4 minutos. Me mandó la receta al celular y a las 5 ya tenía el antihistamínico. Un domingo en Córdoba, sin ir a urgencias.',
          result: 'Resuelto en menos de 2 horas',
        },
        {
          name: 'Dra. María González',
          role: 'Clínica Médica · Bogotá, Colombia',
          avatar: '/images/testi_maria.webp',
          context: 'Consultorio con 40+ pacientes semanales',
          quote: 'Antes perdía 2 horas por día en papelería y coordinación. La historia clínica digital me devolvió ese tiempo para atender mejor. Mis pacientes en Bogotá ahora hacen seguimiento desde el celular sin llamar al consultorio.',
          result: '2 horas/día de vuelta con los pacientes',
        },
        {
          name: 'Ana Martínez',
          role: 'Directora de RRHH · Lima, Perú — 200 empleados',
          avatar: '/images/testi_ana.webp',
          context: 'Empleados perdían medio día por consultas presenciales en Lima',
          quote: 'En Lima, ir al médico puede ser medio día perdido entre tráfico y espera. Implementamos AutaMedica y los empleados agendan en el almuerzo, desde su escritorio. En el primer trimestre, el ausentismo bajó 40%.',
          result: '-40% ausentismo en 3 meses',
        },
        {
          name: 'Federico Torres',
          role: 'Paciente · Buenos Aires, Argentina',
          avatar: '/images/testi_federico.webp',
          context: 'Control cardiológico a 1.000 km de su médico de cabecera',
          quote: 'Mi cardiólogo está en Buenos Aires. Estando de viaje de trabajo en Mendoza, tuve la consulta de control por video. Vio mis estudios en el historial y ajustó la medicación ese mismo día. No postergué nada.',
          result: 'Control médico sin cancelar el viaje',
        },
      ],
    },
    valueProps: {
      label: 'La Diferencia',
      tagline: 'Menos burocracia. Más medicina.',
      items: [
        {
          title: 'Privacidad por diseño',
          description: 'Cifrado de extremo a extremo. AutaMedica cumple con las normativas HIPAA y la Ley 25.326 de Protección de Datos Personales.',
        },
        {
          title: 'El médico mira al paciente, no al teclado',
          description: 'En una consulta clínica tradicional, el profesional pasa el 40% del tiempo escribiendo. En AutaMedica, un agente de IA transcribe y estructura la historia clínica en tiempo real durante la videollamada.',
        },
        {
          title: 'Especialistas al instante',
          description: 'Infraestructura P2P que conecta pacientes con profesionales de la salud sin intermediarios geográficos ni listas de espera.',
        },
      ],
    },
    process: {
      title: 'Así funciona, en serio',
      subtitle: 'De buscar el médico a tener la receta. Sin llamar a nadie.',
      steps: [
        {
          title: 'Busca tu especialidad',
          description: 'Escribes lo que te pasa. Ves los médicos disponibles ahora mismo, con especialidad, años de experiencia y reseñas de otros pacientes.',
        },
        {
          title: 'Elige el horario que te conviene',
          description: 'Hoy, mañana, en 20 minutos — tú eliges. No hay lista de espera ni secretaria que te dé turno para el mes que viene.',
        },
        {
          title: 'Consulta por videollamada',
          description: 'Te conectas desde el celular o la computadora. Si ya consultaste antes, el médico ve tu historial y el contexto completo.',
        },
        {
          title: 'La receta llega al celular',
          description: 'Terminando la consulta, la receta digital te llega al teléfono. La farmacia la acepta. No hay papel, no hay escáner.',
        },
      ],
    },
    doctorDirectory: {
      title: 'Especialistas verificados en tu país',
      subtitle: 'Profesionales matriculados en Argentina, Colombia, Perú y más. Disponibles hoy, no la semana que viene.',
      available: 'Disponible',
      yearsExp: 'años exp.',
      today: 'hoy',
      tomorrow: 'mañana',
      ctaText: 'Médicos matriculados disponibles en AutaMedica',
      ctaLink: 'Ver todas las especialidades',
      doctors: [
        { name: 'Médico/a General', specialty: 'Medicina General', languages: ['Español'] },
        { name: 'Cardiólogo/a', specialty: 'Cardiología', languages: ['Español', 'Inglés'] },
        { name: 'Dermatólogo/a', specialty: 'Dermatología', languages: ['Español'] },
        { name: 'Pediatra', specialty: 'Pediatría', languages: ['Español', 'Portugués'] },
        { name: 'Neurólogo/a', specialty: 'Neurología', languages: ['Español', 'Inglés'] },
        { name: 'Ginecólogo/a', specialty: 'Ginecología y Obstetricia', languages: ['Español'] },
      ],
    },
    healthContent: {
      title: 'Para entender lo que te pasa',
      subtitle: 'Artículos escritos por los médicos que atienden en AutaMedica, no por redactores de contenido',
      articles: [
        {
          tag: 'Prevención',
          title: '5 señales de alerta cardíaca que no hay que ignorar',
          excerpt: 'El dolor de pecho no es la única señal. Hay síntomas sutiles que pueden indicar un problema cardiovascular y que muchas veces se confunden con estrés o cansancio.',
          author: 'Equipo AutaMedica',
          authorRole: 'Cardiología',
          date: 'Feb 2026',
        },
        {
          tag: 'Telemedicina',
          title: 'Consulta virtual o presencial: cuándo conviene cada una',
          excerpt: 'No toda consulta requiere ir al consultorio. Esta guía explica cuándo una videoconsulta es igual de efectiva, y cuándo es mejor ir en persona.',
          author: 'Equipo AutaMedica',
          authorRole: 'Medicina General',
          date: 'Feb 2026',
        },
        {
          tag: 'Salud Mental',
          title: 'Ansiedad crónica: herramientas que funcionan sin medicación',
          excerpt: 'Estrategias basadas en evidencia para gestionar la ansiedad del día a día. Técnicas que puedes aplicar ahora mismo, respaldadas por la ciencia.',
          author: 'Equipo AutaMedica',
          authorRole: 'Psiquiatría',
          date: 'Ene 2026',
        },
      ],
    },
    newsletter: {
      title: 'AutaMedica Semanal',
      subtitle: 'Un resumen semanal de salud escrito por nuestros medicos. Sin spam, solo informacion que importa.',
      placeholder: 'Tu email',
      button: 'Suscribirme',
      note: 'Sin spam. Un email por semana.',
    },
    symptomChecker: {
      symptoms: [
        { id: 'headache', label: 'Dolor de cabeza', specialty: 'Neurología', description: 'Un neurólogo puede evaluar cefaleas frecuentes, migrañas y otros trastornos del sistema nervioso.' },
        { id: 'chest', label: 'Dolor en el pecho', specialty: 'Cardiología', description: 'Un cardiólogo puede evaluar dolor torácico, palpitaciones, presión arterial y salud cardiovascular.' },
        { id: 'skin', label: 'Problemas de piel', specialty: 'Dermatología', description: 'Un dermatólogo puede evaluar erupciones, acné, manchas, alergias cutáneas y lesiones de piel.' },
        { id: 'stomach', label: 'Problemas digestivos', specialty: 'Gastroenterología', description: 'Un gastroenterólogo puede evaluar acidez, reflujo, dolor abdominal y trastornos digestivos.' },
        { id: 'anxiety', label: 'Ansiedad o estrés', specialty: 'Psiquiatría', description: 'Un psiquiatra puede evaluar ansiedad, estrés crónico, insomnio y trastornos del ánimo.' },
        { id: 'joints', label: 'Dolor articular', specialty: 'Reumatología', description: 'Un reumatólogo puede evaluar dolor en articulaciones, rigidez matutina y enfermedades autoinmunes.' },
        { id: 'child', label: 'Fiebre en niños', specialty: 'Pediatría', description: 'Un pediatra puede evaluar fiebre, infecciones, crecimiento y salud general de niños y adolescentes.' },
        { id: 'fatigue', label: 'Cansancio persistente', specialty: 'Endocrinología', description: 'Un endocrinólogo puede evaluar fatiga crónica, problemas de tiroides, metabolismo y desequilibrios hormonales.' },
      ],
    },
    horizontalScroll: {
      portals: [
        {
          name: 'Pacientes',
          description: 'Portal clínico personal con acceso a recetas, historial propio y triage virtual.',
          features: ['Videoconsultas P2P', 'Historia clínica unificada', 'Gestor de turnos', 'Emisión de recetas digitales'],
          cta: 'Acceder como paciente',
        },
        {
          name: 'Profesionales',
          description: 'Infraestructura para telemedicina y gestión electrónica de pacientes.',
          features: ['Consultorio virtual seguro', 'Vademécum integrado', 'Transcripción clínica por IA', 'Firma digital de documentos'],
          cta: 'Portal médico',
        },
        {
          name: 'Empresas',
          description: 'Panel de control para seguimiento de ausentismo y medicina ocupacional.',
          features: ['Dashboard de métricas agregadas', 'Subida de aptos físicos', 'Validación de certificados', 'Asignación de coberturas'],
          cta: 'Portal corporativo',
        },
      ],
    },
    intentLinks: {
      title: '¿Qué necesitas hacer hoy?',
      subtitle: 'Elige tu caso y empieza sin formularios largos ni llamadas telefónicas.',
      items: [
        {
          title: 'Me siento mal y quiero hablar con un médico hoy',
          copy: 'Encuentra turno con un médico ahora mismo, sin guardia y sin traslado. La receta digital llega al celular.',
          cta: 'Buscar médico disponible',
        },
        {
          title: 'Atiendo pacientes y quiero organizar mi agenda',
          copy: 'Agenda digital, videoconsulta y historia clínica en un solo lugar. Sin administración de más.',
          cta: 'Ver portal para médicos',
        },
        {
          title: 'Gestiono salud en una empresa',
          copy: 'Menos ausentismo, más salud. Tus empleados consultan desde el trabajo o su casa, sin perder medio día.',
          cta: 'Ver solución para empresas',
        },
        {
          title: 'Quiero ver mis recetas y mi historial',
          copy: 'Todo tu historial clínico en un solo lugar. Recetas digitales, resultados y seguimiento desde el celular.',
          cta: 'Entrar a mi perfil',
        },
      ],
    },
    productShowcase: {
      title: 'Mira cómo funciona AutaMedica',
      subtitle: 'Cada paso del proceso, en tu celular o computadora',
      features: [
        {
          title: 'Agendamiento inmediato',
          description: 'Eliges la especialidad, ves los horarios disponibles y confirmas en menos de un minuto. Sin llamadas, sin esperas.',
        },
        {
          title: 'Consulta virtual en HD',
          description: 'Videollamada con tu médico desde cualquier dispositivo. Compartir pantalla, chat en tiempo real y conexión estable.',
        },
        {
          title: 'Historia clínica digital',
          description: 'Tu historial completo accesible en todo momento. Tus médicos ven el contexto, tú ves tus resultados.',
        },
        {
          title: 'Seguimiento post-consulta',
          description: 'Receta digital, indicaciones y seguimiento automático. Todo en tu teléfono, listo para la farmacia.',
        },
      ],
    },
    faq: {
      title: 'Preguntas frecuentes',
      subtitle: 'Respuestas rápidas para decidir tu primera consulta.',
      items: [
        {
          question: '¿Cuánto tarda una consulta médica online?',
          answer: 'La atención suele comenzar en minutos. Las consultas estándar duran entre 15 y 30 minutos, según la especialidad y la complejidad del caso.',
        },
        {
          question: '¿Puedo obtener receta digital al finalizar?',
          answer: 'Sí. Los profesionales habilitados pueden emitir recetas digitales con validez legal al terminar la consulta. La recibirás directamente en tu perfil y por email.',
        },
        {
          question: '¿La plataforma sirve para equipos médicos y empresas?',
          answer: 'Sí. AutaMedica tiene portales específicos para médicos, empresas y organizaciones de salud, con herramientas de gestión, agenda y bienestar corporativo.',
        },
        {
          question: '¿Qué nivel de seguridad tiene la plataforma?',
          answer: 'Se opera con estándares HIPAA-compliant, cifrado extremo a extremo y auditoría de accesos. Tus datos clínicos son tuyos y están protegidos.',
        },
      ],
    },
    footer: {
      platformTitle: 'PLATAFORMA',
      resourcesTitle: 'RECURSOS',
      legalTitle: 'LEGAL',
      patients: 'Pacientes',
      doctors: 'Médicos',
      companies: 'Empresas',
      howItWorks: 'Cómo funciona',
      security: 'Seguridad',
      support: 'Soporte',
      privacy: 'Privacidad',
      terms: 'Términos',
      hipaaCompliance: 'HIPAA Compliance',
      allRights: 'Todos los derechos reservados.',
      tagline: 'Telemedicina sin fricciones.\nDesarrollado por profesionales de salud – UBA.',
    },
    authLayout: {
      testimonials: [
        {
          quote: '"Gestión de turnos y recetas en minutos. AutaMedica transformó mi práctica clínica por completo."',
          name: 'Dra. Elena Rossi',
          role: 'Cardióloga',
        },
        {
          quote: '"La mejor experiencia de telemedicina que he tenido. Simple, rápida y con doctores de primer nivel."',
          name: 'Marcos Viale',
          role: 'Paciente',
        },
        {
          quote: '"Implementamos AutaMedica en nuestra empresa y el bienestar de los empleados subió un 40%."',
          name: 'Sofía Méndez',
          role: 'Directora de RRHH',
        },
      ],
    },
  },

  portals: {
    patients: {
      badge: 'Portal de Pacientes',
      title: 'Portal de Pacientes',
      description: 'Consulta médica digital, seguimiento de historial y turnos en una sola experiencia.',
      quickLinksTitle: 'Accesos rápidos del portal',
      links: {
        appointments: 'Turnos y reservas',
        history: 'Historial médico',
        prevention: 'Prevención y seguimiento',
      },
    },
    doctors: {
      badge: 'Portal para Médicos',
      title: 'Portal para Médicos',
      description: 'Agenda clínica, teleconsulta y herramientas de productividad médica.',
      quickLinksTitle: 'Accesos rápidos del portal',
      links: {
        agenda: 'Agenda de consultas',
        consultations: 'Consultas en curso',
        patients: 'Panel de pacientes',
      },
    },
    companies: {
      badge: 'Portal Corporativo',
      title: 'Portal Corporativo',
      description: 'Administra la salud corporativa de tu organización.',
    },
    admin: {
      badge: 'Panel de Administración',
      title: 'Panel de Administración',
    },
  },

  dashboard: {
    patient: {
      badge: 'Panel de paciente',
      greeting: 'Resumen de salud de',
    },
    doctor: {
      badge: 'Panel médico',
      greeting: 'Bienvenido,',
    },
    company: {
      badge: 'Panel corporativo',
    },
  },

  pages: {
    notFound: {
      title: '404 – Página no encontrada',
      message: 'La página que buscas no existe o fue movida.',
      backHome: 'Volver al inicio',
    },
    eliminarCuenta: {
      title: 'Eliminar cuenta',
      description: 'Solicitar la eliminación permanente de tu cuenta AutaMedica.',
    },
    unauthorized: {
      title: 'Acceso no autorizado',
      message: 'No tienes permisos para acceder a esta sección.',
      backHome: 'Volver al inicio',
    },
  },

  language: {
    switchTo: 'Cambiar idioma',
    es: 'ES',
    pt: 'PT',
  },
} as const;

export type TranslationDict = typeof es;
