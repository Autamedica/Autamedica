import type { ReactNode } from 'react'

/**
 * Public layout — no AuthProvider, no portal shell.
 * Applies to /test-call and other public routes.
 * Note: does NOT include <html>/<body> (those are in root layout.tsx).
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
