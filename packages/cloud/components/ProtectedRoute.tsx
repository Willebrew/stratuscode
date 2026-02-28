"use client";

import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

const NQL_AUTH_URL =
  process.env.NEXT_PUBLIC_NQL_AUTH_URL || "https://auth.neuroquestlabs.ai";

function LoadingScreen() {
  return (
    <div className="h-dvh flex items-center justify-center bg-[#0a0e14]">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      const ssoCallback = `${window.location.origin}/api/auth/sso`;
      const currentPath = window.location.pathname;
      window.location.href = `${NQL_AUTH_URL}/login?redirect_to=${encodeURIComponent(ssoCallback)}&final=${encodeURIComponent(currentPath)}`;
    }
  }, [loading, user]);

  if (loading || !user) {
    return <LoadingScreen />;
  }

  return <>{children}</>;
}
