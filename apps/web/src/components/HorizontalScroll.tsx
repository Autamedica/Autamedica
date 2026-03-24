'use client';

import { gsap } from 'gsap';
import { ScrollToPlugin } from 'gsap/dist/ScrollToPlugin';
import { ScrollTrigger } from 'gsap/dist/ScrollTrigger';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getClientI18n } from '../i18n';
import type { Locale } from '../i18n';
import { MagneticButton } from './ui/MagneticButton';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

  // ── GSAP Mobile Best Practices (from GSAP forums) ──
  // Prevents ScrollTrigger from recalculating on iOS address bar show/hide
  ScrollTrigger.config({ ignoreMobileResize: true });

  // Normalizes scroll behavior on touch devices (fixes iOS Safari jittering)
  if ('ontouchstart' in window) {
    ScrollTrigger.normalizeScroll({ allowNestedScroll: true });
  }
}

interface Portal {
  name: string;
  color: string;
  description: string;
  features: readonly string[];
  cta: string;
  href: string;
  video: string;
}

const PORTAL_META = [
  { color: 'var(--portal-patients)', href: '/auth/select-role', video: '/videos/video1.mp4' },
  { color: 'var(--portal-doctors)', href: '/auth/select-role', video: '/videos/video2.mp4' },
  { color: 'var(--portal-companies)', href: '/auth/select-role', video: '/videos/video3.mp4' },
];

const PORTAL_HEX = ['#10b981', '#3b82f6', '#f59e0b'];

function CheckIcon({ hex }: { hex: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={hex} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-80">
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

export default function HorizontalScroll({ locale = 'es' }: { locale?: Locale }) {
  const { dict } = getClientI18n(locale);
  const portals: Portal[] = useMemo(
    () => dict.landing.horizontalScroll.portals.map((p, i) => ({ ...p, ...PORTAL_META[i] })),
    [dict],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const activeRef = useRef(0);
  const stRef = useRef<ScrollTrigger | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const track = trackRef.current;
    if (!container || !track) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isDesktop = window.innerWidth >= 1025;

    setIsMobile(!isDesktop);

    // ── Mobile: CSS scroll-snap + IntersectionObserver ──
    if (!isDesktop) {
      const slides = track.querySelectorAll<HTMLDivElement>('[data-slide]');
      if (!slides.length) return;

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const idx = Number(entry.target.getAttribute('data-slide-index'));
              if (!isNaN(idx)) {
                activeRef.current = idx;
                setActiveIndex(idx);
              }
            }
          });
        },
        { root: track, threshold: 0.6 }
      );

      slides.forEach((slide) => observer.observe(slide));
      return () => observer.disconnect();
    }

    // ── Desktop: GSAP ScrollTrigger (unchanged) ──
    if (reduced) return;

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

      ScrollTrigger.refresh();
    });

    return () => {
      cancelAnimationFrame(raf);
      stRef.current?.kill();
      stRef.current = null;
    };
  }, []);

  useEffect(() => {
    videoRefs.current.forEach((video, i) => {
      if (!video) return;
      if (i === activeIndex) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  }, [activeIndex]);

  const goToSlide = (target: number) => {
    const track = trackRef.current;
    if (!track) return;

    const total = portals.length;
    const clamped = Math.max(0, Math.min(target, total - 1));

    // Mobile: native scroll-snap navigation
    if (isMobile) {
      const slideWidth = track.offsetWidth;
      track.scrollTo({ left: clamped * slideWidth, behavior: 'smooth' });
      return;
    }

    // Desktop: GSAP scroll navigation
    const st = stRef.current;
    if (!st) return;
    const scrollDistance = total * window.innerHeight * 1.5;
    const targetY = st.start + (clamped / (total - 1)) * scrollDistance;
    gsap.to(window, {
      duration: 0.8,
      scrollTo: { y: targetY, autoKill: false },
      ease: 'power3.inOut',
      onUpdate: () => ScrollTrigger.update(),
    });
  };

  // ── Styles: conditional on mobile vs desktop ──
  const containerStyle: React.CSSProperties = isMobile
    ? { position: 'relative', width: '100vw', minHeight: '100svh', overflow: 'visible', background: '#0A0A0A' }
    : { position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#0A0A0A' };

  const trackStyle: React.CSSProperties = isMobile
    ? {
        display: 'flex',
        overflowX: 'auto',
        scrollSnapType: 'x mandatory',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
        width: '100vw',
        height: '100svh',
      }
    : {
        display: 'flex',
        height: '100vh',
        width: `${portals.length * 100}vw`,
        willChange: 'transform',
      };

  return (
    <section
      ref={containerRef}
      id="portales"
      aria-label="Portales de acceso"
      style={containerStyle}
    >
      <h2 className="sr-only">{locale === 'pt' ? 'Nossos Portais' : 'Nuestros Portales'}</h2>

      {/* Track */}
      <div
        ref={trackRef}
        style={trackStyle}
        className={isMobile ? 'hide-scrollbar' : ''}
      >
        {portals.map((portal, index) => {
          const hex = PORTAL_HEX[index] ?? '#ffffff';
          const isFocused = isMobile ? true : activeIndex === index;

          return (
            <div
              key={portal.name}
              data-slide
              data-slide-index={index}
              style={{
                flex: '0 0 100vw',
                width: '100vw',
                height: '100svh',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: isMobile ? 'clamp(1.5rem, 4vw, 4rem)' : 'clamp(2rem, 5vw, 6rem)',
                scrollSnapAlign: isMobile ? 'start' : undefined,
              }}
            >
              {/* Cinematic Card */}
              <div
                className="relative w-full h-full rounded-[2rem] md:rounded-[2.5rem] overflow-hidden flex items-end p-6 md:p-16 transition-all duration-1000 ease-out"
                style={{
                  border: '1px solid rgba(255,255,255,0.05)',
                  boxShadow: '0 30px 60px -15px rgba(0,0,0,0.8), inset 0 1px 0 0 rgba(255, 255, 255, 0.1)',
                  transform: isFocused ? 'scale(1)' : 'scale(0.95)',
                  opacity: isFocused ? 1 : 0.5,
                }}
              >
                {/* Background Video */}
                <div className="absolute inset-0 z-0">
                  <video
                    ref={(el) => { videoRefs.current[index] = el; }}
                    src={portal.video}
                    muted
                    loop
                    playsInline
                    preload="none"
                    className="w-full h-full object-cover"
                    style={{ opacity: 0.4 }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/70 to-transparent" />
                  <div className="absolute inset-0 bg-gradient-to-r from-[#0A0A0A]/80 via-transparent to-transparent" />
                </div>

                {/* Watermark Number */}
                <div
                  className="absolute top-4 right-6 md:top-8 md:right-12 z-0 tracking-tighter mix-blend-overlay font-bold select-none"
                  style={{ fontSize: isMobile ? '25vw' : '15vw', lineHeight: 0.8, color: 'rgba(255,255,255,0.05)' }}
                >
                  0{index + 1}
                </div>

                {/* Content */}
                <div className="relative z-10 max-w-2xl w-full">
                  <h3
                    className="text-4xl md:text-7xl font-bold tracking-tight text-white mb-4 md:mb-6 transition-all duration-700 delay-100"
                    style={{
                      transform: isFocused ? 'translateY(0)' : 'translateY(30px)',
                      opacity: isFocused ? 1 : 0,
                    }}
                  >
                    {portal.name}
                  </h3>

                  <p
                    className="text-base md:text-2xl text-[var(--au-text-secondary)] mb-6 md:mb-10 transition-all duration-700 delay-200"
                    style={{
                      transform: isFocused ? 'translateY(0)' : 'translateY(20px)',
                      opacity: isFocused ? 1 : 0,
                    }}
                  >
                    {portal.description}
                  </p>

                  <div
                    className="grid grid-cols-2 gap-2 md:gap-4 mb-8 md:mb-12 transition-all duration-700 delay-300"
                    style={{
                      transform: isFocused ? 'translateY(0)' : 'translateY(20px)',
                      opacity: isFocused ? 1 : 0,
                    }}
                  >
                    {portal.features.map((f) => (
                      <div key={f} className="flex items-center gap-2 md:gap-3 bg-white/5 backdrop-blur-md border border-white/5 py-2 px-3 md:py-3 md:px-4 rounded-xl">
                        <CheckIcon hex={hex} />
                        <span className="text-xs md:text-sm font-medium text-white/90">{f}</span>
                      </div>
                    ))}
                  </div>

                  <div
                    className="transition-all duration-700"
                    style={{
                      transform: isFocused ? 'translateY(0)' : 'translateY(20px)',
                      opacity: isFocused ? 1 : 0,
                    }}
                  >
                    <MagneticButton>
                      <a
                        href={portal.href}
                        className="inline-flex items-center justify-center gap-2 px-6 py-3 md:px-8 md:py-4 text-sm font-semibold text-white rounded-full bg-white/5 border border-white/10 backdrop-blur-md hover:bg-white/10 hover:border-white/20 transition-all duration-300"
                      >
                        <span style={{ color: hex }}>{portal.cta}</span>
                        <ArrowIcon />
                      </a>
                    </MagneticButton>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tracker Dots */}
      <div
        className={`absolute left-1/2 -translate-x-1/2 flex items-center gap-3 z-50 px-6 py-3 rounded-full bg-black/40 backdrop-blur-xl border border-white/5 ${isMobile ? 'bottom-4' : 'bottom-8'}`}
      >
        {portals.map((p, i) => (
          <button
            key={p.name}
            type="button"
            onClick={() => goToSlide(i)}
            aria-label={`Ir a ${p.name}`}
            style={{
              width: i === activeIndex ? '2.5rem' : '0.5rem',
              height: '0.35rem',
              borderRadius: '999px',
              border: 'none',
              background: i === activeIndex ? 'white' : 'rgba(255,255,255,0.2)',
              cursor: 'pointer',
              transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
              padding: 0,
            }}
          />
        ))}
      </div>

      {/* Hide scrollbar on mobile */}
      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </section>
  );
}
