import landingCopyEs from '@/config/landing-copy.json';
import { buildRoleAuthPath } from './auth-flow';
import type { AuthPage, EntryRole } from './auth-flow';
import type { Locale } from '../i18n/index';

type LandingCopyConfig = typeof landingCopyEs;
export type LandingCopyVariant = keyof LandingCopyConfig['variants'];
type LandingCopyVariantConfig = LandingCopyConfig['variants'][LandingCopyVariant];

interface RoleShortcutConfig {
  accent: string;
  authPage?: Exclude<AuthPage, 'select-role'>;
  href?: string;
  label: string;
  role?: EntryRole;
  returnTo?: string;
}

type HeroConfigResolved = Omit<LandingCopyVariantConfig['hero'], 'roleQuickAccess'> & {
  roleQuickAccess: Array<{
    accent: string;
    href: string;
    label: string;
  }>;
};

export interface ResolvedLandingCopy {
  cta: LandingCopyVariantConfig['cta'];
  hero: HeroConfigResolved;
  seo: LandingCopyVariantConfig['seo'];
  variant: LandingCopyVariant;
}

// Config PT inlinada (evita problemas con imports .pt.json en Cloudflare Workers)
const landingCopyPt = {
  defaultVariant: 'a',
  variants: {
    a: {
      seo: {
        title: 'AutaMedica | Especialistas de Referência e Telemedicina',
        description:
          'Atendimento com médicos especialistas certificados sem deslocamentos. Privacidade dos seus dados, atendimento rápido e receita digital válida para farmácias.',
      },
      hero: {
        badge: 'Atendimento médico online',
        title: 'Atendimento médico, onde você estiver.',
        titleAccent: 'Conecte-se pelo celular.',
        subtitle:
          'Encontre um médico, faça sua consulta por vídeo e receba sua receita digital e acompanhamento em um só lugar.',
        primaryCtaLabel: 'Buscar atendimento',
        primaryCtaHref: '/farmacia/solicitar',
        secondaryCtaLabel: '',
        secondaryCtaHref: '',
        metrics: [
          { value: '100%', label: 'médicos com CRM ativo e verificado' },
          { value: 'Oficial', label: 'receita digital válida em farmácias' },
          { value: 'Seguimento', label: 'acompanhamento clínico e evolução' },
        ],
        roleQuickAccess: [
          { label: 'Pacientes', href: '/auth/login?role=patient', accent: 'var(--portal-patients)' },
          { label: 'Farmácias / Plantão Express', href: '/farmacia/solicitar', accent: '#0EA5E9' },
          { label: 'Médicos', href: '/auth/login?role=doctor', accent: 'var(--portal-doctors)' },
          { label: 'Empresas', href: '/auth/login?role=company_admin', accent: 'var(--portal-companies)' },
        ],
      },
      cta: {
        title: 'os médicos\nestão aqui.',
        subtitle: 'Mais de 150 profissionais com CRM ativo disponíveis hoje. Sem deslocamentos, sem filas.',
        buttonLabel: 'Reservar minha consulta',
        buttonHref: '/auth/select-role',
      },
      pricing: {
        freeBadge: 'Sem mensalidade',
        cuidadoBadge: 'Mais escolhido por famílias',
        headline: 'Sua saúde cuidada hoje. E o que você não usa, vira crédito.',
        reserveDescription: 'O que você não usa em consultas, acumula para farmácias e laboratórios.',
        guarantee: 'Cancele quando quiser com 1 clique · Garantia de 30 dias',
      },
    },
    b: {
      seo: {
        title: 'AutaMedica | Fale com um médico hoje em minutos',
        description:
          'Consulta médica online em minutos, com receita digital e acompanhamento. Médicos verificados no Brasil, Argentina, Equador e Colômbia. Sem agendamento, sem deslocamento.',
      },
      hero: {
        badge: 'Atendimento médico online',
        title: 'Atendimento médico, onde você estiver.',
        titleAccent: 'Conecte-se pelo celular.',
        subtitle:
          'Encontre um médico, faça sua consulta por vídeo e receba sua receita digital e acompanhamento em um só lugar.',
        primaryCtaLabel: 'Buscar atendimento',
        primaryCtaHref: '/farmacia/solicitar',
        secondaryCtaLabel: 'Ver como funciona',
        secondaryCtaHref: '#proceso',
        metrics: [
          { value: '100%', label: 'médicos verificados com CRM' },
          { value: '24/7', label: 'inclusive feriados e fins de semana' },
          { value: '94%', label: 'casos resolvidos sem pronto-socorro' },
        ],
        roleQuickAccess: [
          { label: 'Paciente', role: 'patient', authPage: 'login', accent: 'var(--portal-patients)' },
          { label: 'Médico', role: 'doctor', authPage: 'login', accent: 'var(--portal-doctors)' },
          { label: 'Empresa', role: 'company_admin', authPage: 'login', accent: 'var(--portal-companies)' },
        ],
      },
      cta: {
        title: 'sua consulta\ncomeça hoje.',
        subtitle: 'Agende agora e receba a receita digital no seu celular. Sem esperar no pronto-socorro.',
        buttonLabel: 'Começar agora',
        buttonHref: '/auth/select-role',
      },
      pricing: {
        freeBadge: 'Sem mensalidade',
        cuidadoBadge: 'Mais escolhido por famílias',
        headline: 'Sua saúde cuidada hoje. E o que você não usa, vira crédito.',
        reserveDescription: 'O que você não usa em consultas, acumula para farmácias e laboratórios.',
        guarantee: 'Cancele quando quiser com 1 clique · Garantia de 30 dias',
      },
    },
  },
};

function isLandingCopyVariant(value: string): value is LandingCopyVariant {
  return Object.prototype.hasOwnProperty.call(landingCopyEs.variants, value);
}

export function resolveLandingCopy(url: URL, requestedVariant?: string | null, locale?: Locale): ResolvedLandingCopy {
  const landingCopyConfig = locale === 'pt' ? landingCopyPt : landingCopyEs;
  const defaultVariant = (landingCopyConfig.defaultVariant as LandingCopyVariant) || 'a';
  const queryVariant = url.searchParams.get('copy');
  const candidate = queryVariant ?? requestedVariant ?? defaultVariant;
  const variant: LandingCopyVariant = isLandingCopyVariant(candidate) ? candidate : defaultVariant;
  const variantConfig = landingCopyConfig.variants[variant];

  return {
    variant,
    seo: variantConfig.seo,
    cta: variantConfig.cta,
    hero: {
      ...variantConfig.hero,
      roleQuickAccess: variantConfig.hero.roleQuickAccess.map((item: RoleShortcutConfig) => ({
        accent: item.accent,
        href: item.href ?? buildRoleAuthPath(item.authPage ?? 'login', item.role ?? 'patient', item.returnTo ?? null),
        label: item.label,
      })),
    },
  };
}
