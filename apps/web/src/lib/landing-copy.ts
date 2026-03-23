// @ts-nocheck
import landingCopyEs from '@/config/landing-copy.json';
import { buildRoleAuthPath } from './auth-flow';
import type { AuthPage, EntryRole } from './auth-flow';
import type { Locale } from '../i18n/index';

type LandingCopyConfig = typeof landingCopyEs;
export type LandingCopyVariant = keyof LandingCopyConfig['variants'];
type LandingCopyVariantConfig = LandingCopyConfig['variants'][LandingCopyVariant];

interface RoleShortcutConfig {
  accent: string;
  authPage: Exclude<AuthPage, 'select-role'>;
  label: string;
  role: EntryRole;
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
        title: 'Consulta médica online hoje | AutaMedica',
        description:
          'Conecte-se com um médico verificado em menos de 15 minutos. Receita digital, acompanhamento clínico e sem filas de espera. Disponível no Brasil, Argentina, Colômbia e mais.',
      },
      hero: {
        badge: 'Telemedicina feita para o Brasil',
        title: 'Seu médico,',
        titleAccent: 'sem pronto-socorro.',
        subtitle:
          'No Brasil, uma consulta no PS pode levar horas. Na AutaMedica, a consulta começa quando você quiser.',
        primaryCtaLabel: 'Buscar médico agora',
        primaryCtaHref: '#portales',
        secondaryCtaLabel: 'Já tenho conta',
        secondaryCtaHref: '/auth/select-role',
        metrics: [
          { value: '< 15 min', label: 'até falar com um médico' },
          { value: '6 países', label: 'BR · AR · CO · PE · MX · EC' },
          { value: '94%', label: 'consultas resolvidas sem pronto-socorro' },
        ],
        roleQuickAccess: [
          { label: 'Paciente', role: 'patient', authPage: 'login', accent: 'var(--portal-patients)' },
          { label: 'Médico', role: 'doctor', authPage: 'login', accent: 'var(--portal-doctors)' },
          { label: 'Empresa', role: 'company_admin', authPage: 'login', accent: 'var(--portal-companies)' },
        ],
      },
      cta: {
        title: 'os médicos\nestão aqui.',
        subtitle: 'Mais de 150 profissionais com CRM ativo disponíveis hoje. Sem deslocamentos, sem filas.',
        buttonLabel: 'Reservar minha consulta',
        buttonHref: '/auth/select-role',
      },
    },
    b: {
      seo: {
        title: 'Fale com um médico hoje | AutaMedica',
        description:
          'Consulta médica online em minutos, com receita digital e acompanhamento. Médicos verificados no Brasil, Argentina e Colômbia. Sem agendamento, sem deslocamento.',
      },
      hero: {
        badge: 'Disponível no Brasil, Argentina e Colômbia',
        title: 'Consulta médica hoje,',
        titleAccent: 'não na semana que vem.',
        subtitle:
          'Encontre horário em minutos com um médico certificado. Receita digital no celular. Sem sair de casa.',
        primaryCtaLabel: 'Quero minha consulta',
        primaryCtaHref: '/auth/select-role',
        secondaryCtaLabel: 'Ver como funciona',
        secondaryCtaHref: '#proceso',
        metrics: [
          { value: '< 15 min', label: 'para conectar com um médico' },
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
    },
  },
} as const;

function isLandingCopyVariant(value: string): value is LandingCopyVariant {
  return Object.prototype.hasOwnProperty.call(landingCopyEs.variants, value);
}

export function resolveLandingCopy(url: URL, requestedVariant?: string | null, locale?: Locale): ResolvedLandingCopy {
  const landingCopyConfig = locale === 'pt' ? landingCopyPt : landingCopyEs;
  const queryVariant = url.searchParams.get('copy');
  const candidate = queryVariant ?? requestedVariant ?? landingCopyConfig.defaultVariant;
  const variant = isLandingCopyVariant(candidate) ? candidate : landingCopyConfig.defaultVariant;
  const variantConfig = landingCopyConfig.variants[variant];

  return {
    variant,
    seo: variantConfig.seo,
    cta: variantConfig.cta,
    hero: {
      ...variantConfig.hero,
      roleQuickAccess: variantConfig.hero.roleQuickAccess.map((item: RoleShortcutConfig) => ({
        accent: item.accent,
        href: buildRoleAuthPath(item.authPage, item.role, item.returnTo ?? null),
        label: item.label,
      })),
    },
  };
}
