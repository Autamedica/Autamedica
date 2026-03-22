'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { createBrowserClient } from '@autamedica/auth/client';
import { logger } from '@autamedica/shared';
import type { MemberRole } from '@autamedica/shared';

interface UserContextValue {
  companyName: string;
  adminName: string;
  userMemberRole: MemberRole | null;
  isLoading: boolean;
}

const UserContext = createContext<UserContextValue | null>(null);

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within UserProvider');
  }
  return context;
}

interface UserProviderProps {
  children: ReactNode;
}

export function UserProvider({ children }: UserProviderProps) {
  const [companyName, setCompanyName] = useState('Empresa');
  const [adminName, setAdminName] = useState('Administrador');
  const [userMemberRole, setUserMemberRole] = useState<MemberRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchUserDataAndRole = async () => {
      try {
        if (typeof window === 'undefined') {
          setIsLoading(false);
          return;
        }

        const supabase = createBrowserClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const name = user.user_metadata?.name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Administrador';
          setAdminName(name);

          const company = user.user_metadata?.company_name || user.user_metadata?.company || 'Empresa';
          setCompanyName(company);

          // Check for admin role in any of the user's companies
          // Cast to bypass ts(2589) deep-instantiation on Supabase generic chain
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const sb = supabase as unknown as { from: (t: string) => any };
          const { data: memberData, error } = await sb.from('company_members')
            .select('role')
            .eq('user_id', user.id)
            .eq('role', 'admin')
            .limit(1) as { data: Array<{ role: string }> | null; error: { message: string } | null };

          if (error) {
            logger.error('Error fetching member role:', error);
            setUserMemberRole('member'); // Default to non-admin on error
          } else {
            // If we found at least one admin membership, set role to admin.
            setUserMemberRole(memberData && memberData.length > 0 ? 'admin' : 'member');
          }
        }
      } catch (error) {
        logger.error('Error in UserProvider:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserDataAndRole();
  }, []);

  return (
    <UserContext.Provider value={{ companyName, adminName, userMemberRole, isLoading }}>
      {children}
    </UserContext.Provider>
  );
}
