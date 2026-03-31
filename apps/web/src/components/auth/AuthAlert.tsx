import type { ReactNode } from 'react';

type AuthAlertTone = 'error' | 'success' | 'info';

interface AuthAlertProps {
  children: ReactNode;
  tone: AuthAlertTone;
}

const toneClasses: Record<AuthAlertTone, { container: string; icon: string; text: string }> = {
  error: {
    container: 'bg-red-50 border-red-200',
    icon: 'text-red-600',
    text: 'text-red-800',
  },
  success: {
    container: 'bg-emerald-50 border-emerald-200',
    icon: 'text-emerald-600',
    text: 'text-emerald-800',
  },
  info: {
    container: 'bg-sky-50 border-sky-200',
    icon: 'text-sky-600',
    text: 'text-sky-800',
  },
};

function Icon({ tone }: { tone: AuthAlertTone }) {
  if (tone === 'success') {
    return (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }

  if (tone === 'info') {
    return (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 21a9 9 0 100-18 9 9 0 000 18z" />
      </svg>
    );
  }

  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

export function AuthAlert({ children, tone }: AuthAlertProps) {
  const { container, icon, text } = toneClasses[tone];
  const isError = tone === 'error';

  return (
    <div
      className={`rounded-2xl border p-4 ${container}`}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
    >
      <div className="flex items-center">
        <div className={`mr-3 flex-shrink-0 ${icon}`}>
          <Icon tone={tone} />
        </div>
        <p className={`text-sm ${text}`}>{children}</p>
      </div>
    </div>
  );
}

