'use client';

import { useSearchParams } from 'next/navigation';
import { usePatientSession } from '@/hooks/usePatientSession';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';
import { Loader2 } from 'lucide-react';

export default function OnboardingPage() {
  const { user, profile, loading } = usePatientSession();
  const searchParams = useSearchParams();
  const allRequired = searchParams.get('required') === 'true';

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-white to-cyan-50">
        <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <OnboardingWizard
      userId={user.id}
      firstName={profile?.firstName}
      lastName={profile?.lastName}
      email={user.email}
      allRequired={allRequired}
    />
  );
}
