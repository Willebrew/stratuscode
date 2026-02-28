"use client";

import React, {
  createContext,
  useContext,
  useCallback,
  ReactNode,
} from "react";
import { authClient } from "@/lib/auth-client";

interface User {
  id: string;
  email?: string;
  name?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  refreshAuth: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAuthenticated: false,
  refreshAuth: async () => {},
  signOut: async () => {},
});

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending, refetch } = authClient.useSession();

  const user: User | null = session?.user
    ? {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      }
    : null;

  const refreshAuth = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const signOut = useCallback(async () => {
    // Invalidate session in shared PostgreSQL via Better Auth
    await authClient.signOut();
    // Redirect to nql-auth to clear the central session
    const nqlAuthUrl =
      process.env.NEXT_PUBLIC_NQL_AUTH_URL ||
      "https://auth.neuroquestlabs.ai";
    window.location.href = `${nqlAuthUrl}/sign-out`;
  }, []);

  const value: AuthContextType = {
    user,
    loading: isPending,
    isAuthenticated: !!user,
    refreshAuth,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
