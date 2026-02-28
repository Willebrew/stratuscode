"use client";

import React, { createContext, useContext, ReactNode, useState, useEffect } from "react";
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
  sessionError: Error | null;
  isRetrying: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAuthenticated: false,
  refreshAuth: async () => {},
  signOut: async () => {},
  sessionError: null,
  isRetrying: false,
});

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

const MAX_RETRIES = 3;

const isTransientError = (err: unknown): boolean => {
  if (!err) return false;
  const msg = String(err).toLowerCase();
  return (
    msg.includes("500") ||
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("fetch") ||
    msg.includes("internal server error")
  );
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = authClient.useSession();
  const [retryCount, setRetryCount] = useState(0);
  const [sessionError, setSessionError] = useState<Error | null>(null);

  const {
    data: sessionData,
    isPending,
    error: sessionFetchError,
    refetch,
  } = session;

  // Retry logic for transient session fetch errors
  useEffect(() => {
    if (
      sessionFetchError &&
      isTransientError(sessionFetchError) &&
      retryCount < MAX_RETRIES
    ) {
      const delay = Math.min(1000 * Math.pow(2, retryCount), 4000);
      const timer = setTimeout(() => {
        setRetryCount((prev) => prev + 1);
        refetch();
      }, delay);
      return () => clearTimeout(timer);
    }

    if (sessionData?.user) {
      setRetryCount(0);
      setSessionError(null);
    }

    if (sessionFetchError && retryCount >= MAX_RETRIES) {
      setSessionError(sessionFetchError as Error);
    }
  }, [sessionFetchError, sessionData, retryCount, refetch]);

  const isRetrying =
    !!sessionFetchError &&
    isTransientError(sessionFetchError) &&
    retryCount < MAX_RETRIES;

  const rawUser = sessionData?.user;
  const user: User | null = rawUser
    ? {
        id: rawUser.id,
        email: rawUser.email,
        name: rawUser.name || undefined,
      }
    : null;

  const loading = isPending || isRetrying;
  const isAuthenticated = !!sessionData?.user;

  const refreshAuth = async () => {
    await session.refetch();
  };

  const signOut = async () => {
    await authClient.signOut();
    const nqlAuthUrl =
      process.env.NEXT_PUBLIC_NQL_AUTH_URL ||
      "https://auth.neuroquestlabs.ai";
    window.location.href = `${nqlAuthUrl}/api/auth/logout?redirect=${encodeURIComponent(window.location.origin)}`;
  };

  const value: AuthContextType = {
    user,
    loading,
    isAuthenticated,
    refreshAuth,
    signOut,
    sessionError,
    isRetrying,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
