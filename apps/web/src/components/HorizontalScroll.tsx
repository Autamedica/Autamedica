'use client';

import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);
}

interface Portal {
  name: string;
  color: string;
  description: string;
  features: string[];
  cta: string;
  href: string;
}

const portals: Portal[] = [
  {
    name: 'Pacientes',
    color: 'var(--portal-patients)',
    description: 'Gestiona tu salud desde cualquier lugar, en cualquier momento.',
    features: [
      'Consultas virtuales en HD',
      'Historia clinica digital',
      'Agendamiento inteligente',
      'Receta digital al instante',
    ],
    cta: 'Acceder como paciente',
    href: '/auth/select-role',
  },
  {
    name: 'Medicos',
    color: 'var(--portal-doctors)',
    description: 'Herramientas profesionales para una practica medica moderna.',
    features: [
      'Consultorio virtual integrado',
      'Gestion avanzada de pacientes',
      'IA para diagnostico asistido',
      'Teleconsultas HD profesionales',
    ],
    cta: 'Portal medico',
    href: '/auth/select-role',
  },
  {
    name: 'Empresas',
    color: 'var(--portal-companies)',
    description: 'Soluciones integrales de salud corporativa para tu equipo.',
    features: [
      'Dashboard empresarial completo',
      'Medicina ocupacional digital',
      'Reportes de salud corporativa',
      'Programas de bienestar',
    ],
    cta: 'Soluciones empresariales',
    href: '/auth/select-role',
  },
];

// Raw hex values for computed styles (CSS vars don't work in some inline contexts)
const portalHex: Record<string, string> = {
  Pacientes: '#10b981',
  Medicos: '#3b82f6',
  Empresas: '#f59e0b',
};

function CheckIcon({ portalName }: { portalName: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={portalHex[portalName]} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

export default function HorizontalScroll() {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeRef = useRef(0);
  const stRef = useRef<ScrollTrigger | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const track = trackRef.current;
    if (!container || !track) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isDesktop = window.innerWidth >= 1025;

    if (reduced || !isDesktop) return;

    // Small delay to ensure DOM layout is complete after island hydration
    const raf = requestAnimationFrame(() => {
      const total = portals.length;
      const scrollDistance = total * window.innerHeight * 1.5;

      const anim = gsap.to(track, {
        x: () => -(total - 1) * window.innerWidth,
        ease: 'none',
      });

      stRef.current = ScrollTrigger.create({
        trigger: container,
        start: 'top top',
        end: `+=${scrollDistance}`,
        pin: true,
        scrub: 0.8,
        animation: anim,
        onUpdate: (self) => {
          const i = Math.round(self.progress * (total - 1));
          if (i !== activeRef.current) {
            activeRef.current = i;
            setActiveIndex(i);
          }
        },
      });

      // Force recalculation of all ScrollTrigger instances
      ScrollTrigger.refresh();
    });

    return () => {
      cancelAnimationFrame(raf);
      stRef.current?.kill();
      stRef.current = null;
    };
  }, []);

  const goToSlide = (target: number) => {
    const st = stRef.current;
    if (!st) return;
    const total = portals.length;
    const clamped = Math.max(0, Math.min(target, total - 1));
    const scrollDistance = total * window.innerHeight * 1.5;
    const targetY = st.start + (clamped / (total - 1)) * scrollDistance;
    gsap.to(window, {
      duration: 0.6,
      scrollTo: { y: targetY, autoKill: false },
      ease: 'power2.inOut',
      onUpdate: () => ScrollTrigger.update(),
    });
  };

  return (
    <section
      id="portales"
      ref={containerRef}
      aria-label="Portales de acceso"
      style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: 'var(--au-bg)' }}
    >
      {/* Header */}
      <div style={{
        position: 'absolute', top: 'clamp(1.5rem, 4vh, 3rem)', left: 0, right: 0,
        textAlign: 'center', zIndex: 10, padding: '0 var(--section-px)',
      }}>
        <h2 style={{
          fontSize: 'var(--text-3xl)', fontWeight: 500, color: 'var(--au-text-primary)',
          margin: '0 0 0.5rem', letterSpacing: '-0.02em',
        }}>
          Una plataforma, tres portales
        </h2>
        <p style={{ fontSize: 'var(--text-base)', color: 'var(--au-text-secondary)', margin: 0 }}>
          Desliza para explorar cada solucion
        </p>
      </div>

      {/* Track */}
      <div
        ref={trackRef}
        style={{
          display: 'flex', height: '100vh',
          width: `${portals.length * 100}vw`, willChange: 'transform',
        }}
      >
        {portals.map((portal) => {
          const hex = portalHex[portal.name] || '#e4e4e7';
          return (
            <div
              key={portal.name}
              style={{
                flex: '0 0 100vw', width: '100vw', height: '100vh',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 'clamp(5rem, 10vh, 8rem) var(--section-px) clamp(2rem, 5vh, 4rem)',
                position: 'relative',
              }}
            >
              {/* Decorative gradient blob */}
              <div style={{
                position: 'absolute',
                right: '10%',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '400px',
                height: '400px',
                borderRadius: '50%',
                background: `radial-gradient(circle, ${hex}08 0%, transparent 70%)`,
                filter: 'blur(60px)',
                pointerEvents: 'none',
              }} />

              <div style={{ maxWidth: '560px', width: '100%', position: 'relative', zIndex: 1 }}>
                {/* Portal icon */}
                <div style={{
                  width: '3.5rem', height: '3.5rem', borderRadius: 'var(--radius-md)',
                  background: `${hex}15`, border: `1px solid ${hex}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 'var(--space-6)',
                }}>
                  <span style={{ fontSize: '1.5rem', color: hex, fontWeight: 500 }}>
                    {portal.name.charAt(0)}
                  </span>
                </div>

                <h3 style={{
                  fontSize: 'var(--text-4xl)', fontWeight: 500, color: 'var(--au-text-primary)',
                  margin: '0 0 var(--space-3)', letterSpacing: '-0.03em', lineHeight: 1.1,
                }}>
                  {portal.name}
                </h3>

                <p style={{
                  fontSize: 'var(--text-lg)', color: 'var(--au-text-secondary)',
                  lineHeight: 1.6, margin: '0 0 var(--space-8)',
                }}>
                  {portal.description}
                </p>

                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 var(--space-8)', display: 'flex', flexDirection: 'column' as const, gap: 'var(--space-3)' }}>
                  {portal.features.map((f) => (
                    <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)', color: 'var(--au-text-secondary)' }}>
                      <CheckIcon portalName={portal.name} />
                      {f}
                    </li>
                  ))}
                </ul>

                <a
                  href={portal.href}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)',
                    padding: 'var(--space-3) var(--space-6)', fontSize: 'var(--text-sm)', fontWeight: 600,
                    color: hex, border: `1px solid ${hex}`,
                    borderRadius: 'var(--radius-sm)', transition: 'background 200ms ease',
                    textDecoration: 'none',
                  }}
                  onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; }}
                  onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; }}
                >
                  {portal.cta}
                  <ArrowIcon />
                </a>
              </div>
            </div>
          );
        })}
      </div>

      {/* Dots */}
      <div style={{
        position: 'absolute', bottom: 'var(--space-8)', left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 'var(--space-3)', zIndex: 10,
      }}>
        {portals.map((p, i) => (
          <button
            key={p.name}
            type="button"
            onClick={() => goToSlide(i)}
            aria-label={`Ir a ${p.name}`}
            style={{
              width: i === activeIndex ? '2rem' : '0.5rem',
              height: '0.5rem',
              borderRadius: 'var(--radius-full)',
              border: 'none',
              background: i === activeIndex ? 'var(--au-text-primary)' : 'rgba(255,255,255,0.3)',
              cursor: 'pointer',
              transition: 'all 200ms ease',
              padding: 0,
            }}
          />
        ))}
      </div>

      {/* Navigation hints */}
      {activeIndex < portals.length - 1 && (
        <div style={{
          position: 'absolute', right: 'var(--space-8)', top: '50%', transform: 'translateY(-50%)',
          display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
          padding: 'var(--space-3) var(--space-4)', background: 'rgba(0,0,0,0.5)', backdropFilter: 'var(--blur-sm)',
          borderRadius: 'var(--radius-sm)', color: 'var(--au-text-tertiary)', fontSize: 'var(--text-xs)', zIndex: 10,
          border: '1px solid var(--au-border)',
        }}>
          <span>{portals[activeIndex + 1]?.name}</span>
          <span style={{ fontSize: '1.2rem' }}>&rarr;</span>
        </div>
      )}
    </section>
  );
}
