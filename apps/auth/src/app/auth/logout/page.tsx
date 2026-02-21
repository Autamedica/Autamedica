'use client';

import { useEffect, useState } from 'react';
import { getAuthService } from '@/lib/auth-service';

export default function LogoutPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const runLogout = async () => {
      try {
        const authService = getAuthService();
        await authService.signOut();
      } catch {
        if (isMounted) {
          setError('No se pudo cerrar sesión completamente.');
        }
      } finally {
        window.location.replace('/auth/login?logged_out=1');
      }
    };

    void runLogout();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--au-bg)] p-6">
      <div className="max-w-md w-full bg-[var(--au-surface)] border-2 border-[var(--au-border)] rounded-2xl p-8 text-center">
        <h1 className="text-2xl font-bold text-[var(--au-text-primary)] mb-2">Cerrando sesión...</h1>
        <p className="text-sm text-[var(--au-text-secondary)]">
          Estamos limpiando tu sesión y redirigiéndote al inicio.
        </p>
        {error && (
          <p className="text-sm text-red-400 mt-4">{error}</p>
        )}
      </div>
    </main>
  );
}
