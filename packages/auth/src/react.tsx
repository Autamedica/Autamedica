"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AuthState, UserProfile, UserRole } from "./types";
export type { AuthState } from "./types";
import { createBrowserClient, signOutGlobally } from "./client/supabase";

interface AuthContextType extends AuthState {
  logout: () => Promise<void>;
}

interface AuthProviderProps {
  children: ReactNode;
  onAuthStateChange?: (state: AuthState) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

function extractProfile(user: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
}): UserProfile | null {
  const role = user.user_metadata?.role;
  if (typeof role !== "string") return null;

  return {
    id: user.id,
    email: user.email ?? "",
    role: role as UserRole,
    first_name: (user.user_metadata?.first_name as string) ?? undefined,
    last_name: (user.user_metadata?.last_name as string) ?? undefined,
    created_at: user.created_at,
    updated_at: user.updated_at ?? user.created_at,
  };
}

export function AuthProvider({ children, onAuthStateChange }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    session: null,
    loading: true,
    error: null,
  });
  const [isClient, setIsClient] = useState(false);
  const onChangeRef = useRef(onAuthStateChange);

  useEffect(() => {
    onChangeRef.current = onAuthStateChange;
  }, [onAuthStateChange]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient) return;

    const supabase = createBrowserClient();

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      const user = session?.user ?? null;
      const next: AuthState = {
        user,
        profile: user ? extractProfile(user) : null,
        session,
        loading: false,
        error: (error as Error | null) ?? null,
      };
      setState(next);
      onChangeRef.current?.(next);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      const next: AuthState = {
        user,
        profile: user ? extractProfile(user) : null,
        session,
        loading: false,
        error: null,
      };
      setState(next);
      onChangeRef.current?.(next);
    });

    return () => subscription.unsubscribe();
  }, [isClient]);

  const logout = useCallback(async () => {
    await signOutGlobally();
    const next: AuthState = {
      user: null,
      profile: null,
      session: null,
      loading: false,
      error: null,
    };
    setState(next);
    onChangeRef.current?.(next);
  }, []);

  const contextValue = useMemo<AuthContextType>(
    () => ({ ...state, logout }),
    [state, logout],
  );

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

export { useSupabase } from "./hooks/useSupabase";
