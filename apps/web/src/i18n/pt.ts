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
    pkceError: 'A sessão de autenticação expirou. Tentando novamente automaticamente...',
    pkceErrorManual: 'Não foi possível completar a autenticação com Google. Por favor, tente novamente.',
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
    registerAs: 'Registro como',
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
    premiumNarrative: {
      kicker: 'Não é só uma videochamada',
      title: 'A sala de espera era o problema, não o médico',
      copy: 'No Brasil e na América Latina, milhões de consultas são adiadas por distância, tempo ou custo do deslocamento. AutaMedica conecta pacientes com médicos verificados — em São Paulo, Rio, Brasília ou onde você estiver.',
      sideTitle: 'O que podemos prometer',
      pillars: [
        {
          title: 'Sem deslocamento, sem espera',
          detail: 'Consulte do seu bairro, do trabalho ou de viagem. O médico é quem se conecta com você.',
        },
        {
          title: 'Médicos com CRM verificado',
          detail: 'Cada profissional tem registro ativo no seu estado. Não é IA nem chatbot — é um médico real que assina a receita.',
        },
        {
          title: 'Seu histórico no celular',
          detail: 'Receitas, indicações e acompanhamento no seu telefone. A farmácia aceita a receita digital.',
        },
      ],
    },
    testimonials: {
      title: 'Casos reais, não marketing',
      subtitle: 'O que escreveram pacientes e médicos do Brasil, Argentina e Colômbia que usam AutaMedica',
      items: [
        {
          name: 'Carlos Ruiz',
          role: 'Paciente · Córdoba, Argentina',
          avatar: '/images/testi_carlos.webp',
          context: 'Reação alérgica num domingo às 3h da tarde',
          quote: 'Com o rosto inchado, encontrei consulta com uma dermatologista em 4 minutos. Ela enviou a receita para o celular e às 5h eu já tinha o anti-histamínico. Num domingo, sem ir à UPA.',
          result: 'Resolvido em menos de 2 horas',
        },
        {
          name: 'Dra. María González',
          role: 'Clínica Médica · Bogotá, Colômbia',
          avatar: '/images/testi_maria.webp',
          context: 'Consultório com 40+ pacientes semanais',
          quote: 'Antes perdia 2 horas por dia com papelada e coordenação. O prontuário digital me devolveu esse tempo para atender melhor. Meus pacientes agora fazem acompanhamento pelo celular sem ligar para o consultório.',
          result: '2 horas/dia de volta com os pacientes',
        },
        {
          name: 'Ana Martínez',
          role: 'Diretora de RH · Lima, Peru — 200 funcionários',
          avatar: '/images/testi_ana.webp',
          context: 'Funcionários perdiam meio dia em consultas presenciais',
          quote: 'Implementamos AutaMedica e os funcionários agendam no horário de almoço, da mesa deles. No primeiro trimestre, o absenteísmo caiu 40%.',
          result: '-40% de absenteísmo em 3 meses',
        },
        {
          name: 'Federico Torres',
          role: 'Paciente · Buenos Aires, Argentina',
          avatar: '/images/testi_federico.webp',
          context: 'Consulta cardiológica a 1.000 km do seu médico',
          quote: 'Meu cardiologista está em Buenos Aires. Em viagem de trabalho, tive a consulta de controle por vídeo. Ele viu meus exames no histórico e ajustou a medicação no mesmo dia. Não adiou nada.',
          result: 'Consulta médica sem cancelar a viagem',
        },
      ],
    },
    valueProps: {
      label: 'A Diferença',
      tagline: 'Menos burocracia. Mais medicina.',
      items: [
        {
          title: 'Privacidade por design',
          description: 'Criptografia de ponta a ponta. AutaMedica está em conformidade com as normas HIPAA e a LGPD brasileira.',
        },
        {
          title: 'O médico olha para o paciente, não para o teclado',
          description: 'Em uma consulta clínica tradicional, o profissional passa 40% do tempo escrevendo. Na AutaMedica, um agente de IA transcreve e estrutura o prontuário em tempo real durante a videochamada.',
        },
        {
          title: 'Especialistas na hora',
          description: 'Infraestrutura P2P que conecta pacientes com profissionais de saúde sem intermediários geográficos nem filas de espera.',
        },
      ],
    },
    process: {
      title: 'Veja como funciona, de verdade',
      subtitle: 'De buscar o médico até ter a receita. Sem ligar para ninguém.',
      steps: [
        {
          title: 'Busque sua especialidade',
          description: 'Descreva o que está sentindo. Veja os médicos disponíveis agora, com especialidade, anos de experiência e avaliações de outros pacientes.',
        },
        {
          title: 'Escolha o horário que funciona',
          description: 'Hoje, amanhã, em 20 minutos — você decide. Sem fila de espera nem secretária marcando para o mês seguinte.',
        },
        {
          title: 'Consulta por videochamada',
          description: 'Conecte-se pelo celular ou computador. Se já consultou antes, o médico vê seu histórico e o contexto completo.',
        },
        {
          title: 'A receita chega no celular',
          description: 'Ao final da consulta, a receita digital chega no seu telefone. A farmácia aceita. Sem papel, sem escâner.',
        },
      ],
    },
    doctorDirectory: {
      title: 'Especialistas verificados no seu país',
      subtitle: 'Profissionais registrados no Brasil, Argentina, Colômbia e mais. Disponíveis hoje, não na semana que vem.',
      available: 'Disponível',
      yearsExp: 'anos exp.',
      today: 'hoje',
      tomorrow: 'amanhã',
      ctaText: 'Médicos registrados disponíveis na AutaMedica',
      ctaLink: 'Ver todas as especialidades',
      doctors: [
        { name: 'Médico/a Geral', specialty: 'Medicina Geral', languages: ['Espanhol'] },
        { name: 'Cardiologista', specialty: 'Cardiologia', languages: ['Espanhol', 'Inglês'] },
        { name: 'Dermatologista', specialty: 'Dermatologia', languages: ['Espanhol'] },
        { name: 'Pediatra', specialty: 'Pediatria', languages: ['Espanhol', 'Português'] },
        { name: 'Neurologista', specialty: 'Neurologia', languages: ['Espanhol', 'Inglês'] },
        { name: 'Ginecologista', specialty: 'Ginecologia e Obstetrícia', languages: ['Espanhol'] },
      ],
    },
    healthContent: {
      title: 'Para entender o que está acontecendo',
      subtitle: 'Artigos escritos pelos médicos que atendem na AutaMedica, não por redatores de conteúdo',
      comingSoon: 'Mais artigos cada semana, escritos pelos médicos que também atendem na AutaMedica.',
      articles: [
        {
          tag: 'Prevenção',
          title: '5 sinais de alerta cardíaco que não se deve ignorar',
          excerpt: 'A dor no peito não é o único sinal. Há sintomas sutis que podem indicar um problema cardiovascular e que muitas vezes se confundem com estresse ou cansaço.',
          author: 'Equipe AutaMedica',
          authorRole: 'Cardiologia',
          date: 'Fev 2026',
        },
        {
          tag: 'Telemedicina',
          title: 'Consulta virtual ou presencial: quando cada uma convém',
          excerpt: 'Nem toda consulta exige ir ao consultório. Este guia explica quando uma videoconsulta é igualmente eficaz e quando é melhor ir pessoalmente.',
          author: 'Equipe AutaMedica',
          authorRole: 'Medicina Geral',
          date: 'Fev 2026',
        },
        {
          tag: 'Saúde Mental',
          title: 'Ansiedade crônica: ferramentas que funcionam sem medicação',
          excerpt: 'Estratégias baseadas em evidências para gerir a ansiedade do dia a dia. Técnicas que você pode aplicar agora mesmo, respaldadas pela ciência.',
          author: 'Equipe AutaMedica',
          authorRole: 'Psiquiatria',
          date: 'Jan 2026',
        },
      ],
    },
    symptomChecker: {
      symptoms: [
        { id: 'headache', label: 'Dor de cabeça', specialty: 'Neurologia', description: 'Um neurologista pode avaliar cefaleias frequentes, enxaquecas e outros transtornos do sistema nervoso.' },
        { id: 'chest', label: 'Dor no peito', specialty: 'Cardiologia', description: 'Um cardiologista pode avaliar dor torácica, palpitações, pressão arterial e saúde cardiovascular.' },
        { id: 'skin', label: 'Problemas de pele', specialty: 'Dermatologia', description: 'Um dermatologista pode avaliar erupções, acne, manchas, alergias cutâneas e lesões de pele.' },
        { id: 'stomach', label: 'Problemas digestivos', specialty: 'Gastroenterologia', description: 'Um gastroenterologista pode avaliar azia, refluxo, dor abdominal e transtornos digestivos.' },
        { id: 'anxiety', label: 'Ansiedade ou estresse', specialty: 'Psiquiatria', description: 'Um psiquiatra pode avaliar ansiedade, estresse crônico, insônia e transtornos do humor.' },
        { id: 'joints', label: 'Dor articular', specialty: 'Reumatologia', description: 'Um reumatologista pode avaliar dor nas articulações, rigidez matinal e doenças autoimunes.' },
        { id: 'child', label: 'Febre em crianças', specialty: 'Pediatria', description: 'Um pediatra pode avaliar febre, infecções, crescimento e saúde geral de crianças e adolescentes.' },
        { id: 'fatigue', label: 'Cansaço persistente', specialty: 'Endocrinologia', description: 'Um endocrinologista pode avaliar fadiga crônica, problemas de tireoide, metabolismo e desequilíbrios hormonais.' },
      ],
    },
    horizontalScroll: {
      portals: [
        {
          name: 'Pacientes',
          description: 'Portal clínico pessoal com acesso a receitas, histórico próprio e triagem virtual.',
          features: ['Videoconsultas P2P', 'Prontuário unificado', 'Gestor de consultas', 'Emissão de receitas digitais'],
          cta: 'Acessar como paciente',
        },
        {
          name: 'Profissionais',
          description: 'Infraestrutura para telemedicina e gestão eletrônica de pacientes.',
          features: ['Consultório virtual seguro', 'Vademécum integrado', 'Transcrição clínica por IA', 'Assinatura digital de documentos'],
          cta: 'Portal médico',
        },
        {
          name: 'Empresas',
          description: 'Painel de controle para monitoramento de absenteísmo e medicina ocupacional.',
          features: ['Dashboard de métricas agregadas', 'Upload de aptidões físicas', 'Validação de atestados', 'Atribuição de coberturas'],
          cta: 'Portal corporativo',
        },
      ],
    },
    intentLinks: {
      title: 'O que você precisa fazer hoje?',
      subtitle: 'Escolha seu caso e comece sem formulários longos nem ligações.',
      items: [
        {
          title: 'Estou mal e quero falar com um médico hoje',
          copy: 'Encontre consulta com um médico agora mesmo, sem pronto-socorro e sem deslocamento. A receita digital chega no celular.',
          cta: 'Buscar médico disponível',
        },
        {
          title: 'Atendo pacientes e quero organizar minha agenda',
          copy: 'Agenda digital, videoconsulta e prontuário em um só lugar. Sem burocracia extra.',
          cta: 'Ver portal para médicos',
        },
        {
          title: 'Gerencio saúde em uma empresa',
          copy: 'Menos absenteísmo, mais saúde. Seus funcionários consultam do trabalho ou de casa, sem perder meio dia.',
          cta: 'Ver solução para empresas',
        },
        {
          title: 'Quero ver minhas receitas e meu histórico',
          copy: 'Todo o seu histórico clínico em um só lugar. Receitas digitais, resultados e acompanhamento pelo celular.',
          cta: 'Entrar no meu perfil',
        },
      ],
    },
    productShowcase: {
      title: 'Veja como a AutaMedica funciona',
      subtitle: 'Cada etapa do processo, no seu celular ou computador',
      features: [
        {
          title: 'Agendamento imediato',
          description: 'Escolha a especialidade, veja os horários disponíveis e confirme em menos de um minuto. Sem ligações, sem espera.',
        },
        {
          title: 'Consulta virtual em HD',
          description: 'Videochamada com seu médico em qualquer dispositivo. Compartilhe tela, chat em tempo real e conexão estável.',
        },
        {
          title: 'Prontuário digital',
          description: 'Seu histórico completo acessível a qualquer momento. Seus médicos veem o contexto, você vê seus resultados.',
        },
        {
          title: 'Acompanhamento pós-consulta',
          description: 'Receita digital, indicações e acompanhamento automático. Tudo no seu telefone, pronto para a farmácia.',
        },
      ],
    },
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
