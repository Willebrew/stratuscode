"use client";

import React, {
  createContext,
  useContext,
  ReactNode,
  useState,
  useEffect,
  useCallback,
} from "react";

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/get-session", {
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error(`Session fetch failed: ${res.status}`);
      }

      const data = await res.json();

      if (data?.user) {
        setUser({
          id: data.user.id,
          email: data.user.email || undefined,
          name: data.user.name || undefined,
        });
        setSessionError(null);
        setRetryCount(0);
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error("[AuthContext] session fetch error:", err);

      if (retryCount < MAX_RETRIES) {
        setRetryCount((prev) => prev + 1);
        // Retry will be triggered by the useEffect dependency on retryCount
      } else {
        setSessionError(err as Error);
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, [retryCount]);

  // Initial fetch + retry logic
  useEffect(() => {
    if (retryCount === 0) {
      fetchSession();
    } else if (retryCount <= MAX_RETRIES) {
      const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 4000);
      const timer = setTimeout(fetchSession, delay);
      return () => clearTimeout(timer);
    }
  }, [retryCount, fetchSession]);

  const isRetrying = retryCount > 0 && retryCount <= MAX_RETRIES;

  const refreshAuth = useCallback(async () => {
    setLoading(true);
    setRetryCount(0);
  }, []);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    const nqlAuthUrl =
      process.env.NEXT_PUBLIC_NQL_AUTH_URL ||
      "https://auth.neuroquestlabs.ai";
    window.location.href = `${nqlAuthUrl}/api/auth/logout?redirect=${encodeURIComponent(window.location.origin)}`;
  }, []);

  const value: AuthContextType = {
    user,
    loading: loading || isRetrying,
    isAuthenticated: !!user,
    refreshAuth,
    signOut,
    sessionError,
    isRetrying,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
