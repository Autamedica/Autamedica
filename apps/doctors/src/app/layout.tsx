import type { Metadata } from 'next'
import type { JSX, ReactNode } from 'react'
import './globals.css'
import '@livekit/components-styles'
import { DoctorsPortalShell } from '@/components/layout/DoctorsPortalShell'
import { ClientWrapper } from '@/components/ClientWrapper'

export const metadata: Metadata = {
  title: 'AutaMedica Doctor Portal',
  description: 'Portal profesional para médicos AutaMedica con experiencia de videollamadas y herramientas clínicas.',
  alternates: {
    canonical: 'https://doctors.autamedica.com',
  },
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
}

type RootLayoutProps = Readonly<{
  children: ReactNode
}>

export default function RootLayout({ children }: RootLayoutProps): JSX.Element {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
      </head>
      <body className="bg-slate-50 text-slate-900 antialiased">
        <ClientWrapper>
          <DoctorsPortalShell>{children}</DoctorsPortalShell>
        </ClientWrapper>
      </body>
    </html>
  )
}
