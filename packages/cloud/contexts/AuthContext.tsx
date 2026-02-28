"use client";

import React, { createContext, useContext, ReactNode } from "react";
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
  const session = authClient.useSession();
  const { data: sessionData, isPending } = session;

  const rawUser = sessionData?.user;
  const user: User | null = rawUser
    ? {
        id: rawUser.id,
        email: rawUser.email || undefined,
        name: rawUser.name || undefined,
      }
    : null;

  const refreshAuth = async () => {
    await session.refetch();
  };

  const signOut = async () => {
    await authClient.signOut();
    window.location.reload();
  };

  const value: AuthContextType = {
    user,
    loading: isPending,
    isAuthenticated: !!user,
    refreshAuth,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
