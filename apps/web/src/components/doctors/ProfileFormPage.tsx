'use client'

import { ClientWrapper } from '@/components/doctors/ClientWrapper'
import { DoctorsPortalShell } from '@/components/doctors/layout/DoctorsPortalShell'
import { ProfileForm } from '@/components/doctors/ProfileForm'

export function ProfileFormPage() {
  return (
    <ClientWrapper>
      <DoctorsPortalShell>
        <ProfileForm />
      </DoctorsPortalShell>
    </ClientWrapper>
  )
}
