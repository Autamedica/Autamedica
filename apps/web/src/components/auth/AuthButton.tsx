import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface AuthButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  fullWidth?: boolean;
  loading?: boolean;
}

export function AuthButton({
  children,
  type = 'button',
  variant = 'primary',
  disabled = false,
  fullWidth = false,
  loading = false,
  className,
  ...rest
}: AuthButtonProps) {
  const baseStyles = `
    px-6 py-3 rounded-xl font-medium transition-all duration-200
    flex items-center justify-center gap-2
    ${fullWidth ? 'w-full' : ''}
    ${disabled || loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
  `;

  const variants = {
    primary: `
      bg-[#fff] text-[#000] font-bold
      shadow-[0_4px_20px_-5px_rgba(255,255,255,0.2)]
      ${!disabled && !loading ? 'hover:scale-[1.01] hover:shadow-[0_8px_30px_-5px_rgba(255,255,255,0.3)] active:scale-[0.98]' : ''}
    `,
    secondary: `
      bg-[var(--au-surface)] text-[var(--au-text-primary)] border border-[var(--au-border)]
      ${!disabled && !loading ? 'hover:border-[var(--au-border-hover)] hover:bg-[var(--au-hover)] active:scale-[0.98]' : ''}
    `,
    ghost: `
      bg-transparent text-[var(--au-text-secondary)] border border-transparent
      ${!disabled && !loading ? 'hover:text-[var(--au-text-primary)] hover:bg-[var(--au-hover)]' : ''}
    `,
  };

  return (
    <button
      type={type}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={`${baseStyles} ${variants[variant]} ${className ?? ''}`.trim()}
      {...rest}
    >
      {loading && (
        <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      )}
      {children}
    </button>
  );
}
