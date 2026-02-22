'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
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
          strokeWidth={1.8}
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
          strokeWidth={1.8}
          d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
        />
        <circle cx="12" cy="7" r="4" strokeWidth={1.8} />
      </svg>
    );
  }

  return (
    <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 21h18" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 21V7l8-4v18" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 21V11l-6-4" />
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
    <div ref={dropdownRef} className="relative">
      <button
        ref={buttonRef}
        onClick={() => setDropdownOpen((open) => !open)}
        className="group relative inline-flex items-center gap-2 rounded-full border-2 border-[var(--au-border)] bg-[var(--au-surface)]/90 px-4 py-2 text-sm font-medium text-[var(--au-text-primary)] shadow-lg backdrop-blur-xl transition-all duration-200 hover:border-[var(--au-accent)] hover:bg-[var(--au-hover)]"
        aria-label="Abrir accesos de cuenta"
        aria-expanded={dropdownOpen}
        aria-haspopup="true"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--au-accent)]/15 text-[var(--au-accent)]">
          <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
              clipRule="evenodd"
            />
          </svg>
        </span>
        <span className="hidden sm:inline">Acceder</span>
        <svg
          className={`h-4 w-4 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 top-[calc(100%+0.6rem)] z-[1000] min-w-[340px] overflow-hidden rounded-2xl border-2 border-[var(--au-border)] bg-[var(--au-surface)]/95 shadow-2xl backdrop-blur-2xl">
          <div className="border-b-2 border-[var(--au-border)] bg-[var(--au-hover)]/35 px-5 py-4">
            <p className="text-xs uppercase tracking-[0.08em] text-[var(--au-text-tertiary)]">Ingreso rápido</p>
            <p className="mt-1 text-sm text-[var(--au-text-secondary)]">
              Elige tu perfil y entra en segundos
            </p>
          </div>

          <div className="space-y-2 p-3">
            {ROLE_ENTRIES.map((entry) => (
              <a
                key={entry.role}
                href={buildRoleAuthPath('login', entry.role)}
                className="group block rounded-xl border border-[var(--au-border)] px-3 py-3 transition-all duration-150 hover:border-[var(--role-accent)] hover:bg-[var(--au-hover)]"
                style={{ '--role-accent': entry.accent } as CSSProperties}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--au-border)]"
                    style={{ color: 'var(--role-accent)' }}
                  >
                    {getRoleIcon(entry.role)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[var(--au-text-primary)]">
                      Ingresar como {entry.shortLabel}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-[var(--au-text-secondary)]">
                      {entry.description}
                    </p>
                  </div>
                  <svg
                    className="mt-1 h-4 w-4 shrink-0 text-[var(--au-text-tertiary)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--au-text-primary)]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </a>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 border-t-2 border-[var(--au-border)] bg-[var(--au-hover)]/20 p-3">
            <a
              href={buildAuthPath('select-role')}
              className="inline-flex items-center justify-center rounded-lg border border-[var(--au-border)] px-3 py-2 text-xs font-medium text-[var(--au-text-secondary)] transition-colors hover:text-[var(--au-text-primary)]"
            >
              Elegir perfil
            </a>
            <a
              href={buildAuthPath('register')}
              className="inline-flex items-center justify-center rounded-lg border border-[var(--au-border)] px-3 py-2 text-xs font-medium text-[var(--au-text-secondary)] transition-colors hover:text-[var(--au-text-primary)]"
            >
              Crear cuenta
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
