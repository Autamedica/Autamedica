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
    emailPlaceholder: 'usuario@autamedica.com',
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
    minPasswordLength: 'A senha deve ter pelo menos 6 caracteres',
    passwordsDoNotMatch: 'As senhas não conferem',
    needMinPassword: 'Você precisa de pelo menos 6 caracteres',
    passwordMinHint: 'Mínimo 6 caracteres',
    resetPasswordMinLength: 'A nova senha deve ter pelo menos 12 caracteres.',
    resetPasswordNeedMin: 'A nova senha precisa ter pelo menos 12 caracteres.',
    resetPasswordMinHint: 'Mínimo de 12 caracteres',
    recoveryLinkReady: 'Confirme o link para continuar e abrir o formulário de nova senha.',
    confirmRecoveryLink: 'Continuar para alterar a senha',
    verifyingRecoveryLink: 'Verificando link...',
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
    acceptTermsPrefix: 'Aceito os',
    termsLink: 'Termos e Condições',
    acceptTermsMiddle: 'e a',
    privacyLink: 'Política de Privacidade',
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
    pharmacist: {
      label: 'Farmacêutico',
      shortLabel: 'Farmácia',
      description: 'Valide e dispense receitas médicas',
      title: 'Portal da Farmácia',
      subtitle: 'Dispensação segura com rastreabilidade completa.',
      buttonLabel: 'Entrar como Farmacêutico',
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
      kicker: 'Continuidade Assistencial',
      title: 'Nenhum piloto decola às cegas. A medicina também não.',
      copy: 'Na telemedicina comum, ainda colocam o médico na câmera sem saber o que o paciente tem. Na AutaMedica, o triagem prévio entrega o prontuário estruturado antes do primeiro segundo da consulta.',

      sideTitle: 'Rigor Assistencial',
      pillars: [
        {
          title: 'Triagem e prontuário prévio',
          detail: 'O médico recebe sintomas e histórico estruturados antes de iniciar.',
        },
        {
          title: 'Médicos com CRM verificado',
          detail: 'Registro ativo confirmado e receita digital válida em farmácias.',
        },
        {
          title: 'Histórico longitudinal',
          detail: 'Evolução clínica e prescrições salvas em um único lugar.',
        },
      ],
    },
    plansSection: {
      kicker: 'Preços Transparentes & Reserva de Saúde',
      title: 'Sua saúde cuidada hoje. E o que você não usa, vira crédito.',
      subtitle: 'Escolha entre consulta avulsa sob demanda ou assinatura mensal que acumula créditos para farmácias e exames se você não consultar.',
      billingMonthly: 'Cobrança Mensal',
      billingAnnual: 'Cobrança Anual',
      annualDiscountBadge: '2 meses grátis (-20%)',
      freeBadge: 'Sem mensalidade',
      freeTitle: 'Plano Livre',
      freeSubtitle: 'Por Consulta · Atendimento pontual sem taxas fixas',
      freePrice: 'R$ 0',
      freePeriod: 'Para sempre',
      freeDescription: 'Atendimento médico pontual quando surge um sintoma, sem mensalidade nem fidelidade.',
      freePriceNote: 'Você paga exclusivamente o valor da consulta médica avulsa que realizar.',
      freeFeatures: [
        'Videoconsulta direta com especialistas de referência com CRM ativo',
        'Receita médica digital oficial válida em todas as farmácias',
        'Prontuário clínico digital criptografado e disponível 24/7 no celular',
        'Pedidos de exames laboratoriais e atestados com validade nacional',
        'Zero mensalidade, sem taxa de manutenção nem fidelidade',
        'Atendimento 100% web: não precisa baixar aplicativos',
      ],
      freeCta: 'Criar conta gratuita',
      freeCtaSubtext: 'Sem necessidade de cartão de crédito · Cadastro em 1 minuto',
      cuidadoBadge: 'Mais escolhido por famílias',
      cuidadoTitle: 'Plano Cuidado',
      cuidadoSubtitle: 'Prevenção contínua + Reserva de Saúde',
      cuidadoPrice: 'R$ 49,90',
      cuidadoPriceAlt: 'via Pix ou cartão',
      cuidadoPeriod: '/ mês via Pix',
      cuidadoPriceMonthly: 'R$ 49,90',
      cuidadoPriceMonthlyAlt: 'via Pix ou cartão',
      cuidadoPeriodMonthly: '/ mês via Pix',
      cuidadoPriceAnnual: 'R$ 39,90',
      cuidadoPriceAnnualAlt: 'R$ 478,80 / ano via Pix ou parcelado',
      cuidadoPeriodAnnual: '/ mês (faturamento anual)',
      cuidadoAnnualBilledNote: 'Cobrança anual de R$ 478,80 (economize R$ 120 · 2 meses grátis)',
      cuidadoDescription: '1 consulta médica mensal inclusa. Consultas não utilizadas acumulam como créditos na Reserva para farmácias e exames.',
      reserveHighlightTag: 'Zero Desperdício Garantido',
      reserveHighlightText: 'O que você não usa em consultas vira saldo para farmácias e laboratórios.',
      creditTag: '+22 AUTA Créditos/mês sem uso',
      creditExplanation: 'Cada mês sem consultas gera 22 créditos acumuláveis para farmácias e laboratórios.',
      cuidadoFeatures: [
        '1 videoconsulta clínica mensal (ou acúmulo automático na Reserva)',
        'Reserva de Saúde: créditos acumuláveis para farmácias e exames',
        'Acesso prioritário ao plantão médico virtual 24/7 sem espera',
        'Créditos que não expiram enquanto sua assinatura estiver ativa',
        'Cobertura de telemedicina extensível a dependentes da família',
        'Até 40% de desconto em medicamentos e exames laboratoriais',
        'Emissão e renovação ilimitada de receitas digitais contínuas',
      ],
      cuidadoCta: 'Assinar Plano Cuidado com Pix',
      cuidadoCtaSubtext: 'Cancele quando quiser com 1 clique · Garantia de reembolso de 30 dias',
      learnMore: 'Conhecer todos os detalhes da Reserva de Saúde →',
      paymentGatewaysLabel: 'Formas de pagamento seguras:',
      paymentGatewaysList: 'Pix instantâneo · Cartões de crédito e débito · Mercado Pago',
      trustPillars: [
        {
          title: 'Plantão médico 24/7',
          desc: 'Atendimento contínuo dia e noite.',
        },
        {
          title: 'Cancele em 1 clique',
          desc: 'Sem fidelidade nem penalidades.',
        },
        {
          title: 'Garantia 30 dias',
          desc: '100% de devolução no 1º mês.',
        },
      ],
      toggleMore: '+ Ver benefícios completos',
      toggleLess: '− Ocultar detalhes',
    },
    testimonials: {
      title: 'Casos reais, não marketing',
      subtitle: 'Histórias de pacientes e médicos que escolhem a AutaMedica na região',
      items: [
        {
          name: 'Carlos Ruiz',
          role: 'Paciente · Córdoba, Argentina',
          avatar: '/images/testi_carlos.webp',
          context: 'Urgência no domingo',
          quote: 'Receita e remédio em mãos em menos de 2 horas no domingo, sem ir ao pronto-socorro.',
          result: 'Resolvido em <2h',
        },
        {
          name: 'Dra. María González',
          role: 'Clínica Médica · Bogotá, Colômbia',
          avatar: '/images/testi_maria.webp',
          context: 'Consultório clínico',
          quote: 'O triagem e o prontuário digital me devolveram 2 horas diárias de burocracia para focar nos pacientes.',
          result: '+2h/dia com pacientes',
        },
        {
          name: 'Ana Martínez',
          role: 'Diretora de RH · Lima, Peru',
          avatar: '/images/testi_ana.webp',
          context: 'Saúde corporativa',
          quote: 'Os colaboradores consultam pelo celular; o absenteísmo caiu 40% em 3 meses.',
          result: '-40% absenteísmo',
        },
        {
          name: 'Federico Torres',
          role: 'Paciente · Buenos Aires, Argentina',
          avatar: '/images/testi_federico.webp',
          context: 'Retorno em viagem',
          quote: 'Retorno cardiológico por vídeo em viagem de trabalho com ajuste imediato da receita.',
          result: 'Consulta sem adiar',
        },
      ],
    },
    valueProps: {
      label: 'Continuidade Assistencial',
      title: 'Nenhum piloto decola às cegas. A medicina também não.',
      subtitle: 'Na telemedicina comum, colocam o médico às cegas. Na AutaMedica, a triagem prévia estrutura o prontuário completo antes do primeiro segundo da consulta.',
      tagline: 'Menos burocracia. Mais medicina.',
      items: [
        {
          title: 'Privacidade por design',
          description: 'Criptografia de ponta a ponta. Conformidade rigorosa com a LGPD e padrões internacionais HIPAA.',
        },
        {
          title: 'O médico olha para o paciente, não para o teclado',
          description: 'Na AutaMedica, a inteligência ambiental estrutura o prontuário em tempo real sem distrair o médico.',
        },
        {
          title: 'Especialistas na hora',
          description: 'Infraestrutura P2P que conecta você a médicos de referência sem intermediários nem filas.',
        },
      ],
    },
    process: {
      title: 'Veja como funciona, de verdade',
      subtitle: 'De buscar o médico a receber a receita. Sem atritos.',
      steps: [
        {
          title: 'Busque sua especialidade',
          description: 'Filtre por sintoma e escolha especialistas disponíveis hoje.',
        },
        {
          title: 'Escolha o horário',
          description: 'Defina o melhor momento sem filas nem listas de espera.',
        },
        {
          title: 'Consulta por videochamada',
          description: 'Conecte-se pelo navegador com áudio e vídeo clínico criptografados.',
        },
        {
          title: 'A receita chega no celular',
          description: 'Receba sua prescrição digital oficial aceita em todas as farmácias.',
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
      subtitle: 'Critério clínico e prevenção por especialistas de referência',
      articles: [
        {
          tag: 'Prevenção',
          title: '5 sinais de alerta cardíaco que você não deve ignorar',
          excerpt: 'Sintomas sutis que alertam sobre problemas cardiovasculares precoces.',
          author: 'Equipe AutaMedica',
          authorRole: 'Cardiologia',
          date: 'Fev 2026',
        },
        {
          tag: 'Telemedicina',
          title: 'Consulta virtual ou presencial: critérios de escolha',
          excerpt: 'Guia médico para definir quando a videoconsulta é indicada.',
          author: 'Equipe AutaMedica',
          authorRole: 'Medicina Geral',
          date: 'Fev 2026',
        },
        {
          tag: 'Saúde Mental',
          title: 'Ferramentas clínicas para o controle da ansiedade',
          excerpt: 'Estratégias baseadas em evidências para gerir o estresse diário.',
          author: 'Equipe AutaMedica',
          authorRole: 'Psiquiatria',
          date: 'Jan 2026',
        },
      ],
    },
    newsletter: {
      title: 'AutaMedica Semanal',
      subtitle: 'Um resumo semanal de saude escrito pelos nossos medicos. Sem spam, so informacao que importa.',
      placeholder: 'Seu email',
      button: 'Assinar',
      note: 'Sem spam. Um email por semana.',
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
      subtitle: 'Tecnologia clínica de alta precisão no seu celular ou computador',
      features: [
        {
          title: 'Agendamento imediato',
          description: 'Horários em tempo real com especialistas de referência sem esperas.',
        },
        {
          title: 'Consulta virtual em HD',
          description: 'Videochamada clínica criptografada em alta definição pelo navegador.',
        },
        {
          title: 'Prontuário digital',
          description: 'Registro longitudinal interoperável (HL7 FHIR) acessível 24/7 no celular.',
        },
        {
          title: 'Acompanhamento pós-consulta',
          description: 'Receita digital oficial e orientações imediatas no seu telefone.',
        },
      ],
    },
    faq: {
      title: 'Perguntas frequentes',
      subtitle: 'Respostas diretas sobre a plataforma.',
      items: [
        {
          question: 'Quanto tempo demora uma consulta?',
          answer: 'Atendimento ágil em minutos. Consultas de 15 a 30 min conforme o caso.',
        },
        {
          question: 'A receita é aceita em farmácias?',
          answer: 'Sim. Assinatura digital válida em todas as farmácias do país.',
        },
        {
          question: 'Atendem empresas e equipes?',
          answer: 'Sim. Portais dedicados para cobertura corporativa e medicina do trabalho.',
        },
        {
          question: 'Como meus dados são protegidos?',
          answer: 'Criptografia TLS 1.3 de ponta a ponta em conformidade com a LGPD e HIPAA.',
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

  patientPortal: {
    greetings: {
      morning: 'Bom dia',
      afternoon: 'Boa tarde',
      evening: 'Boa noite',
      hello: 'Olá',
    },
    immediateCare: {
      tag: 'Atendimento sem agendamento',
      title: 'Atendimento médico imediato',
      subtitle: 'Consultas médicas, atestados e receitas na hora, onde você estiver ou direto do balcão da farmácia.',
      chips: {
        consultation: 'Consulta médica',
        documents: 'Atestados e receitas',
        pharmacy: 'Direto da farmácia',
      },
      cta: 'Solicitar atendimento agora',
      hint: 'Sem agendamento · Médico disponível',
      scheduledCta: 'Consulta agendada · Agendar horário',
    },
    subscription: {
      planCuidadoActive: 'Plano Cuidado • Ativo',
      planCuidadoPastDue: 'Plano Cuidado • Pagamento pendente',
      planFree: 'Plano Gratuito',
      activatePlan: 'Ativar Plano Cuidado',
      creditsLabel: 'Créditos',
    },
    tabs: {
      inicio: 'Início',
      agenda: 'Agenda',
      consultar: 'Consultar',
      recetas: 'Receitas',
      comunidad: 'Comunidade',
    },
    services: {
      onlineDoctor: 'Médico online',
      onlineDoctorDesc: 'Consultas imediatas ou agendadas',
      mySchedule: 'Minha agenda',
      myScheduleDesc: 'Consultas e acompanhamento',
      myPrescriptions: 'Meus medicamentos',
      myPrescriptionsDesc: 'Receitas e prescrições digitais',
      myHistory: 'Meu histórico de saúde',
      myHistoryDesc: 'Anamnese e prontuário',
      mentalHealth: 'Saúde mental',
      mentalHealthDesc: 'Psiquiatria e bem-estar',
      subscription: 'Assinatura AutaMedica',
      subscriptionDesc: 'Benefícios acumulativos e resgates',
      prevention: 'Prevenção e exames',
      preventionDesc: 'Planos preventivos e alertas',
      reproductiveHealth: 'Saúde reprodutiva',
      reproductiveHealthDesc: 'Acompanhamento e planejamento',
      community: 'Comunidade de pacientes',
      communityDesc: 'Espaço seguro de troca e apoio',
    },
    metrics: {
      actionRequired: 'Ação necessária',
      active: 'Ativo',
      completeHistory: 'Complete seu histórico clínico',
      clinicalHistory: 'Histórico clínico',
      completeProfile: 'Perfil completo',
      freeConsultations: 'Consultas gratuitas',
      healthInControl: 'sua saúde sob controle',
      allReady: 'Tudo pronto para o seu atendimento médico',
      completeToStart: 'Complete sua anamnese para iniciar o atendimento com os profissionais de saúde.',
      bookAppointment: 'Agendar consulta',
      goToProfile: 'Completar perfil',
    },
    wallet: {
      title: 'Saldo AutaMedica',
      subtitle: 'Seu saldo para consultas',
      balanceAvailable: 'Saldo disponível',
      giftConsults: 'Consultas bônus',
      available: 'disp.',
      none: 'Nenhuma',
      explanation: 'Use seu saldo ou suas consultas bônus para agendar instantaneamente sem precisar de cartão.',
      reserveSaudeBtn: 'Reserva de Saúde (AUTA Créditos)',
      topupBtn: 'Adicionar Saldo',
      myAppointmentsBtn: 'Minhas consultas',
    },
  },
};
