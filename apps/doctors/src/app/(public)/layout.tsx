import type { JSX } from 'react'

/**
 * Public layout - no AuthProvider, no session checks.
 * Used for pages like /test-call that should be accessible without authentication.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <html lang="es">
      <body className="bg-gray-900 text-white antialiased">
        {children}
      </body>
    </html>
  )
}
