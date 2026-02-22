'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { EntryRole } from '../../lib/auth-flow';
import { ROLE_ENTRIES, buildAuthPath, buildRoleAuthPath } from '../../lib/auth-flow';

function getRoleIcon(role: EntryRole) {
  const cls = 'w-5 h-5';

  if (role === 'doctor') {
    return (
      <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M22 12h-4l-3 9L9 3l-3 9H2"
        />
      </svg>
    );
  }

  if (role === 'patient') {
    return (
      <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
        />
        <circle cx="12" cy="7" r="4" strokeWidth={2} />
      </svg>
    );
  }

  return (
    <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4" />
    </svg>
  );
}

export default function AccountMenu() {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDropdownOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  return (
    <div ref={dropdownRef} className="relative z-[1000]">
      <button
        ref={buttonRef}
        onClick={() => setDropdownOpen((open) => !open)}
        className={`group relative inline-flex items-center gap-2 rounded-full border border-[var(--au-border)]/60 bg-[var(--au-surface)]/80 px-4 py-2 text-sm font-semibold text-[var(--au-text-primary)] shadow-sm backdrop-blur-xl transition-all duration-300 hover:border-[var(--au-accent)]/50 hover:bg-[var(--au-hover)] hover:shadow-md ${dropdownOpen ? 'ring-2 ring-[var(--au-accent)]/30 border-[var(--au-accent)]/50' : ''}`}
        aria-label="Abrir accesos de cuenta"
        aria-expanded={dropdownOpen}
        aria-haspopup="true"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--au-accent)]/15 text-[var(--au-accent)] transition-colors group-hover:bg-[var(--au-accent)]/20">
          <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
              clipRule="evenodd"
            />
          </svg>
        </span>
        <span className="hidden sm:inline tracking-wide">Acceder</span>
        <svg
          className={`h-4 w-4 text-[var(--au-text-secondary)] transition-transform duration-300 ${dropdownOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <AnimatePresence>
        {dropdownOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-[calc(100%+0.8rem)] min-w-[360px] origin-top-right rounded-3xl border border-[var(--au-border)]/50 bg-[var(--au-surface)]/85 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)] backdrop-blur-2xl ring-1 ring-white/5"
          >
            <div className="px-6 pb-3 pt-6">
              <h3 className="text-xs font-bold tracking-[0.15em] text-[var(--au-text-tertiary)] uppercase">
                Ingreso Rápido
              </h3>
              <p className="mt-1.5 text-sm font-medium text-[var(--au-text-secondary)]">
                Elige tu perfil y entra en segundos
              </p>
            </div>

            <div className="flex flex-col gap-1.5 px-3 pb-4">
              {ROLE_ENTRIES.map((entry) => (
                <a
                  key={entry.role}
                  href={buildRoleAuthPath('login', entry.role)}
                  className="group relative flex items-center gap-4 rounded-2xl px-3 py-3 transition-all duration-300 hover:bg-[var(--au-hover)]/60"
                  style={{ '--role-accent': entry.accent } as CSSProperties}
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--au-hover)]/80 text-[var(--au-text-secondary)] shadow-sm transition-all duration-300 group-hover:bg-[var(--role-accent)]/15 group-hover:text-[var(--role-accent)] group-hover:scale-105">
                    {getRoleIcon(entry.role)}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold tracking-wide text-[var(--au-text-primary)] transition-colors group-hover:text-[var(--role-accent)]">
                      Ingresar como {entry.shortLabel}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--au-text-tertiary)] transition-colors group-hover:text-[var(--au-text-secondary)]">
                      {entry.description}
                    </p>
                  </div>
                  <svg
                    className="h-4 w-4 shrink-0 text-transparent opacity-0 transition-all duration-300 group-hover:-translate-x-1 group-hover:text-[var(--role-accent)] group-hover:opacity-100"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                </a>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-[var(--au-border)]/40 p-4 bg-gradient-to-b from-transparent to-[var(--au-surface)] rounded-b-3xl">
              <a
                href={buildAuthPath('select-role')}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-[var(--au-hover)]/40 text-[13px] font-semibold text-[var(--au-text-secondary)] shadow-sm transition-all duration-200 hover:bg-[var(--au-hover)] hover:text-[var(--au-text-primary)] hover:shadow-md"
              >
                Elegir perfil
              </a>
              <a
                href={buildAuthPath('register')}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-[var(--au-hover)]/40 text-[13px] font-semibold text-[var(--au-text-secondary)] shadow-sm transition-all duration-200 hover:bg-[var(--au-hover)] hover:text-[var(--au-text-primary)] hover:shadow-md"
              >
                Crear cuenta
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
