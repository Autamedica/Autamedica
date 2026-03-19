import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 text-center">
        <div>
          <h1 className="text-9xl font-bold text-violet-500">404</h1>
          <h2 className="mt-6 text-3xl font-bold text-slate-900">
            Página no encontrada
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            La página que estás buscando no existe o ha sido movida.
          </p>
        </div>

        <div className="mt-8 space-y-4">
          <Link
            href="/"
            className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-violet-600 hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500 transition-colors duration-200"
          >
            Volver al Dashboard
          </Link>

          <div className="text-center">
            <span className="text-slate-500 text-sm">
              ¿Necesitas ayuda? {' '}
              <a
                href="mailto:support@autamedica.com"
                className="text-violet-600 hover:text-violet-500 underline"
              >
                Contactar soporte
              </a>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}