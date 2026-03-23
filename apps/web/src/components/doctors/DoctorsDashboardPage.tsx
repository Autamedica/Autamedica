'use client'

import DoctorsHomePage from '@/components/doctors/DoctorsHomePage'
import { ClientWrapper } from '@/components/doctors/ClientWrapper'
import { DoctorsPortalShell } from '@/components/doctors/layout/DoctorsPortalShell'
import type { Locale } from '@/i18n/index'

interface DoctorsDashboardPageProps {
  locale?: Locale
}

export function DoctorsDashboardPage({ locale }: DoctorsDashboardPageProps) {
  return (
    <ClientWrapper>
      <DoctorsPortalShell>
        <DoctorsHomePage locale={locale} />
      </DoctorsPortalShell>
    </ClientWrapper>
  )
}
