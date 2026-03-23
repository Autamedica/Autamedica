// @ts-nocheck
import landingCopyEs from '@/config/landing-copy.json';
import landingCopyPt from '@/config/landing-copy.pt.json';
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
