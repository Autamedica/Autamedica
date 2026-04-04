'use client';

import { useState } from 'react';
import { getClientI18n } from '../i18n';
import type { Locale } from '../i18n';

interface Symptom {
  id: string;
  label: string;
  icon: React.ReactNode;
  specialty: string;
  description: string;
}

// Brain
const BrainIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a5 5 0 0 1 4.9 4H17a4 4 0 0 1 1 7.9V15a4 4 0 0 1-4 4h-1v3h-2v-3H10a4 4 0 0 1-4-4v-1.1A4 4 0 0 1 7 6h.1A5 5 0 0 1 12 2z" />
  </svg>
);

// Heart
const HeartIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
  </svg>
);

// Skin (hand with rays)
const SkinIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" />
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
);

// Stomach
const StomachIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12h6l2-3 4 6 2-3h6" />
  </svg>
);

// Mind/Anxiety
const MindIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    <path d="M8 10h.01M12 10h.01M16 10h.01" />
  </svg>
);

// Bone/Joint
const BoneIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18.5 5.5a3.5 3.5 0 0 0-5 0L12 7l-1.5-1.5a3.5 3.5 0 1 0-5 5L7 12l-1.5 1.5a3.5 3.5 0 1 0 5 5L12 17l1.5 1.5a3.5 3.5 0 1 0 5-5L17 12l1.5-1.5a3.5 3.5 0 0 0 0-5z" />
  </svg>
);

// Child/Pediatric
const ChildIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="5" />
    <path d="M20 21a8 8 0 1 0-16 0" />
  </svg>
);

// Energy/Fatigue
const EnergyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const ICON_MAP: Record<string, React.ReactNode> = {
  headache: <BrainIcon />,
  chest: <HeartIcon />,
  skin: <SkinIcon />,
  stomach: <StomachIcon />,
  anxiety: <MindIcon />,
  joints: <BoneIcon />,
  child: <ChildIcon />,
  fatigue: <EnergyIcon />,
};

export default function SymptomChecker({ locale = 'es' }: { locale?: Locale }) {
  const { dict } = getClientI18n(locale);
  const symptoms: Symptom[] = dict.landing.symptomChecker.symptoms.map((s) => ({
    ...s,
    icon: ICON_MAP[s.id] ?? null,
  }));

  const [selected, setSelected] = useState<string | null>(null);

  const selectedSymptom = symptoms.find((s) => s.id === selected);

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto' }}>
      {/* Pills grid */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap' as const,
        gap: 'var(--space-3)',
        justifyContent: 'center',
        marginBottom: selectedSymptom ? 'var(--space-8)' : '0',
      }}>
        {symptoms.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={selected === s.id}
            onClick={() => setSelected(selected === s.id ? null : s.id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: 'var(--space-2) var(--space-4)',
              fontSize: 'var(--text-sm)',
              fontWeight: selected === s.id ? 600 : 400,
              color: selected === s.id ? 'var(--au-text-primary)' : 'var(--au-text-secondary)',
              background: selected === s.id ? 'var(--au-accent-soft)' : 'transparent',
              border: `1px solid ${selected === s.id ? 'var(--au-accent)' : 'var(--au-border)'}`,
              borderRadius: 'var(--radius-full)',
              cursor: 'pointer',
              transition: 'all 200ms ease',
              fontFamily: 'inherit',
            }}
          >
            <span style={{ display: 'flex', opacity: selected === s.id ? 1 : 0.6 }}>{s.icon}</span>
            {s.label}
          </button>
        ))}
      </div>

      {/* Result panel */}
      {selectedSymptom && (
        <div style={{
          padding: 'var(--space-8)',
          border: '1px solid var(--au-border)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--au-surface)',
          textAlign: 'center',
          animation: 'fadeIn 300ms ease',
        }}>
          <p style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            color: 'var(--au-text-tertiary)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase' as const,
            margin: '0 0 var(--space-3)',
          }}>
            {locale === 'pt' ? 'Especialidade recomendada' : 'Especialidad recomendada'}
          </p>
          <h3 style={{
            fontSize: 'var(--text-2xl)',
            fontWeight: 500,
            color: 'var(--au-text-primary)',
            margin: '0 0 var(--space-3)',
            letterSpacing: '-0.02em',
          }}>
            {selectedSymptom.specialty}
          </h3>
          <p style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--au-text-secondary)',
            lineHeight: 1.7,
            margin: '0 0 var(--space-6)',
            maxWidth: '480px',
            marginLeft: 'auto',
            marginRight: 'auto',
          }}>
            {selectedSymptom.description}
          </p>
          <a
            href="/auth/select-role"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: 'var(--space-3) var(--space-6)',
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              color: 'var(--au-bg)',
              background: 'var(--au-accent)',
              borderRadius: 'var(--radius-sm)',
              textDecoration: 'none',
              transition: 'opacity 200ms ease, transform 200ms ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.opacity = '0.9';
              (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.opacity = '1';
              (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
            }}
          >
            {locale === 'pt' ? `Agendar com ${selectedSymptom.specialty}` : `Agendar con ${selectedSymptom.specialty}`}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </a>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
