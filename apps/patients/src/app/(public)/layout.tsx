import type { ReactNode } from 'react'

/**
 * Public layout - no auth providers, no session checks.
 * Used for pages like /test-call that should be accessible without authentication.
 */
export default function PublicLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="es">
      <body className="bg-gray-900 text-white antialiased">
        {children}
      </body>
    </html>
  )
}
