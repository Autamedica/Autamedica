// Traducciones en portugués (Brasil).
// Solo sobreescribe las claves que difieren del español.
// El helper deepMerge en index.ts combina esto con es.ts.

import type { TranslationDict } from './es';

/** Convierte recursivamente readonly arrays y string literals a sus tipos base. */
type Widen<T> =
  T extends readonly (infer U)[]
    ? Widen<U>[]
    : T extends string
      ? string
      : T extends number
        ? number
        : T extends boolean
          ? boolean
          : T extends object
            ? { [K in keyof T]: Widen<T[K]> }
            : T;

type DeepPartial<T> = T extends object
  ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T;

export const pt: DeepPartial<Widen<TranslationDict>> = {
  common: {
    backToHome: 'Voltar ao início',
    privacy: 'Privacidade',
    terms: 'Termos',
    accessibility: 'Acessibilidade',
    secureConnection: 'Conexão segura e criptografada',
    bioSecureInfra: 'Infraestrutura Bio-Segura',
    hipaaLegend: 'Infraestrutura Segura HIPAA Compliant',
  },

  layout: {
    defaultTitle: 'AutaMedica – Telemedicina sem atritos',
    defaultDescription: 'Plataforma de telemedicina inovadora. Consultas médicas online, gestão de pacientes e ferramentas clínicas em um só lugar.',
    tagline: 'Sua saúde, sem complicações.',
  },

  auth: {
    preparing: 'Preparando seu acesso',
    preparingSubtitle: 'Validando sua identidade para uma conexão segura e sem atritos.',
    accessMode: 'Modo de Acesso',
    continueWithGoogle: 'Continuar com Google',
    emailLabel: 'E-mail Institucional',
    emailPlaceholder: 'seu@email.com',
    passwordLabel: 'Senha',
    passwordPlaceholder: '••••••••',
    showPassword: 'Mostrar senha',
    hidePassword: 'Ocultar senha',
    recover: 'Recuperar',
    noAccount: 'Sem conta?',
    startToday: 'Comece hoje',
    enterSession: 'Entrando...',
    wrongCredentials: 'Credenciais incorretas. Verifique seu e-mail e senha.',
    loginError: 'Não foi possível entrar. Tente novamente.',
    googleError: 'Erro ao conectar com o Google.',
    googleErrorUnexpected: 'Erro inesperado com o Google. Tente novamente.',
    joinTitle: 'Junte-se à AutaMedica',
    notYourRole: 'Não é o seu perfil?',
    changeHere: 'Mudar aqui',
    alreadyHaveAccount: 'Já tem conta na AutaMedica?',
    signIn: 'Entrar',
    createAccount: 'Criar minha conta',
    creating: 'Criando conta...',
    emailConfirmation: 'Enviamos um link de confirmação para o seu e-mail. Verifique sua caixa de entrada para ativar sua conta.',
    emailAlreadyRegistered: 'Este e-mail já está cadastrado. Quer fazer login?',
    selectRoleFirst: 'Você deve selecionar um perfil antes de se cadastrar',
    minPasswordLength: 'A senha deve ter pelo menos 8 caracteres',
    passwordsDoNotMatch: 'As senhas não conferem',
    needMinPassword: 'Você precisa de pelo menos 8 caracteres',
    passwordMinHint: 'Mínimo 8 caracteres',
    chooseProfile: 'Escolha seu perfil de acesso',
    chooseProfileSubtitle: 'Você será direcionado ao portal correto após o login.',
    continueToLogin: 'Continuar para o login',
    preparingAccess: 'Preparando acesso...',
    directAccess: 'Acesso direto',
    alreadyHaveAccountQ: 'Já tem conta?',
    recoverAccess: 'Recuperar Acesso',
    recoverSubtitle: 'Insira seu e-mail para receber um link de recuperação',
    registeredEmail: 'E-mail cadastrado',
    sendRecoveryLink: 'Enviar link de recuperação',
    resendIn: 'Reenviar em',
    seconds: 's',
    rememberPassword: 'Lembrou sua senha?',
    backToLogin: 'Voltar ao login',
    recoverySecure: 'Recuperação segura e criptografada',
    recoveryEmailSent: 'Enviamos um link de recuperação para o seu e-mail. Verifique sua caixa de entrada.',
    newPassword: 'Nova Senha',
    newPasswordSubtitle: 'Insira sua nova senha para sua conta AutaMedica',
    newPasswordLabel: 'Nova senha',
    confirmPasswordLabel: 'Confirmar senha',
    confirmPasswordPlaceholder: 'Repita sua senha',
    updatePassword: 'Atualizar senha',
    passwordUpdated: 'Senha atualizada com sucesso. Você será redirecionado para o login...',
    requestNewLink: 'Solicitar novo link de recuperação',
    updateSecure: 'Atualização segura e criptografada',
    invalidLink: 'Link de recuperação inválido ou expirado. Solicite um novo.',
    email: 'Endereço de e-mail',
    password: 'Senha',
    confirmPassword: 'Confirmar senha',
  },

  roles: {
    patient: {
      label: 'Paciente',
      shortLabel: 'Paciente',
      description: 'Agende consultas e revise seu histórico',
      title: 'Portal do Paciente',
      subtitle: 'Gerencie sua saúde com precisão e agilidade.',
      buttonLabel: 'Entrar como Paciente',
    },
    doctor: {
      label: 'Médico',
      shortLabel: 'Médico',
      description: 'Gerencie agenda, consultas e pacientes',
      title: 'Portal Médico',
      subtitle: 'Infraestrutura clínica de alto desempenho.',
      buttonLabel: 'Entrar como Médico',
    },
    company_admin: {
      label: 'Empresa',
      shortLabel: 'Empresa',
      description: 'Controle a saúde corporativa da equipe',
      title: 'Portal Corporativo',
      subtitle: 'Estratégias de bem-estar para sua organização.',
      buttonLabel: 'Entrar como Empresa',
    },
  },

  navbar: {
    product: 'Produto',
    professionals: 'Profissionais',
    specialties: 'Especialidades',
    access: 'Acesso',
    openMenu: 'Abrir acessos da conta',
    quickAccess: 'Acesso Rápido',
    chooseProfile: 'Escolher perfil',
    chooseProfileSubtitle: 'Escolha seu perfil e entre em segundos',
    enterAs: 'Entrar como',
  },

  landing: {
    symptomTitle: 'O que você precisa hoje?',
    symptomSubtitle: 'Selecione um sintoma e recomendamos a especialidade adequada',
    faq: {
      title: 'Perguntas frequentes',
      subtitle: 'Respostas rápidas para decidir sua primeira consulta.',
      items: [
        {
          question: 'Quanto tempo dura uma consulta médica online?',
          answer: 'O atendimento geralmente começa em minutos. As consultas padrão duram entre 15 e 30 minutos, dependendo da especialidade e da complexidade do caso.',
        },
        {
          question: 'Posso obter receita digital ao finalizar?',
          answer: 'Sim. Os profissionais habilitados podem emitir receitas digitais com validade legal ao término da consulta. Você a receberá diretamente no seu perfil e por e-mail.',
        },
        {
          question: 'A plataforma serve para equipes médicas e empresas?',
          answer: 'Sim. AutaMedica tem portais específicos para médicos, empresas e organizações de saúde, com ferramentas de gestão, agenda e bem-estar corporativo.',
        },
        {
          question: 'Qual é o nível de segurança da plataforma?',
          answer: 'Operamos com padrões HIPAA-compliant, criptografia ponta a ponta e auditoria de acessos. Seus dados clínicos são seus e estão protegidos.',
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
      howItWorks: 'Como funciona',
      security: 'Segurança',
      support: 'Suporte',
      privacy: 'Privacidade',
      terms: 'Termos',
      hipaaCompliance: 'HIPAA Compliance',
      allRights: 'Todos os direitos reservados.',
      tagline: 'Telemedicina sem atritos.\nDesenvolvido por profissionais de saúde.',
    },
    authLayout: {
      testimonials: [
        {
          quote: '"Gestão de consultas e receitas em minutos. AutaMedica transformou minha prática clínica."',
          name: 'Dra. Elena Rossi',
          role: 'Cardiologista',
        },
        {
          quote: '"A melhor experiência de telemedicina que já tive. Simples, rápida e com médicos de alto nível."',
          name: 'Marcos Viale',
          role: 'Paciente',
        },
        {
          quote: '"Implementamos AutaMedica na empresa e o bem-estar dos funcionários subiu 40%."',
          name: 'Sofia Méndez',
          role: 'Diretora de RH',
        },
      ],
    },
  },

  portals: {
    patients: {
      badge: 'Portal do Paciente',
      title: 'Portal do Paciente',
      description: 'Consulta médica digital, histórico e agendamentos em uma só experiência.',
      quickLinksTitle: 'Acessos rápidos do portal',
      links: {
        appointments: 'Consultas e agendamentos',
        history: 'Histórico médico',
        prevention: 'Prevenção e acompanhamento',
      },
    },
    doctors: {
      badge: 'Portal para Médicos',
      title: 'Portal para Médicos',
      description: 'Agenda clínica, teleconsulta e ferramentas de produtividade médica.',
      quickLinksTitle: 'Acessos rápidos do portal',
      links: {
        agenda: 'Agenda de consultas',
        consultations: 'Consultas em andamento',
        patients: 'Painel de pacientes',
      },
    },
    companies: {
      badge: 'Portal Corporativo',
      title: 'Portal Corporativo',
      description: 'Administre a saúde corporativa da sua organização.',
    },
    admin: {
      badge: 'Painel de Administração',
      title: 'Painel de Administração',
    },
  },

  dashboard: {
    patient: {
      badge: 'Painel do paciente',
      greeting: 'Resumo de saúde de',
    },
    doctor: {
      badge: 'Painel médico',
      greeting: 'Bem-vindo,',
    },
    company: {
      badge: 'Painel corporativo',
    },
  },

  pages: {
    notFound: {
      title: '404 – Página não encontrada',
      message: 'A página que você busca não existe ou foi movida.',
      backHome: 'Voltar ao início',
    },
    eliminarCuenta: {
      title: 'Excluir conta',
      description: 'Solicitar a exclusão permanente da sua conta AutaMedica.',
    },
    unauthorized: {
      title: 'Acesso não autorizado',
      message: 'Você não tem permissão para acessar esta seção.',
      backHome: 'Voltar ao início',
    },
  },

  language: {
    switchTo: 'Trocar idioma',
    es: 'ES',
    pt: 'PT',
  },
};
