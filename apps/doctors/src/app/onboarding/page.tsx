'use client';

import { DoctorOnboardingWizard } from '@/components/onboarding/DoctorOnboardingWizard';
import { useSupabase } from '@autamedica/auth/react';
import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';

export default function DoctorOnboardingPage() {
  const supabase = useSupabase();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
    });
  }, [supabase]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-600 border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <DoctorOnboardingWizard
      userId={user.id}
      email={user.email}
      existingFirstName={user.user_metadata?.first_name as string | undefined}
      existingLastName={user.user_metadata?.last_name as string | undefined}
    />
  );
}
