'use client';

import React, { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

import { logger } from '@autamedica/shared';
import { captureSentryException } from '@/lib/observability/sentry';
interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    captureSentryException(error, {
      layer: 'ui',
      surface: 'companies/layout/ErrorBoundary',
      owner: 'Companies Web',
      context: {
        componentStack: errorInfo.componentStack,
      },
      tags: {
        portal: 'company',
      },
    });
    logger.error('Error boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[400px] flex items-center justify-center p-4">
          <div className="text-center max-w-md mx-auto">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Algo salió mal
            </h2>
            <p className="text-gray-600 mb-6">
              Ha ocurrido un error inesperado. Por favor, intenta recargar la página o vuelve al inicio.
            </p>
            <div className="space-y-3">
              <button
                onClick={() => window.location.reload()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                <RefreshCw className="w-4 h-4" />
                Recargar página
              </button>
              <a href="/dashboard">
                <button className="w-full flex items-center justify-center gap-2 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 px-4 py-2 rounded">
                  <Home className="w-4 h-4" />
                  Ir al inicio
                </button>
              </a>
            </div>
            {import.meta.env.DEV && this.state.error && (
              <details className="mt-6 text-left">
                <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                  Detalles del error (solo en desarrollo)
                </summary>
                <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto">
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Error fallback component for suspense boundaries
interface ErrorFallbackProps {
  error: Error;
  resetErrorBoundary: () => void;
}

export function ErrorFallback({ error: _error, resetErrorBoundary }: ErrorFallbackProps) {
  return (
    <div className="min-h-[400px] flex items-center justify-center p-4">
      <div className="text-center max-w-md mx-auto">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-8 h-8 text-red-600" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Error de carga
        </h2>
        <p className="text-gray-600 mb-6">
          No se pudo cargar este componente. Por favor, intenta de nuevo.
        </p>
        <div className="space-y-3">
          <button
            onClick={resetErrorBoundary}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            <RefreshCw className="w-4 h-4" />
            Intentar de nuevo
          </button>
          <a href="/dashboard">
            <button className="w-full flex items-center justify-center gap-2 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 px-4 py-2 rounded">
              <Home className="w-4 h-4" />
              Ir al inicio
            </button>
          </a>
        </div>
      </div>
    </div>
  );
}
