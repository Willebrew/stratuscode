"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

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
  const { user, loading, isRetrying } = useAuth();
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);
  const [shouldRedirect, setShouldRedirect] = useState(false);

  useEffect(() => {
    if (!loading) {
      setHasCheckedAuth(true);
    }
  }, [loading]);

  useEffect(() => {
    if (hasCheckedAuth && !loading && !user && !isRetrying) {
      setShouldRedirect(true);
    } else if (user) {
      setShouldRedirect(false);
    }
  }, [user, loading, hasCheckedAuth, isRetrying]);

  useEffect(() => {
    if (shouldRedirect) {
      const currentPath = window.location.pathname;
      if (currentPath !== "/login") {
        const nqlAuthUrl =
          process.env.NEXT_PUBLIC_NQL_AUTH_URL ||
          "https://auth.neuroquestlabs.ai";
        const ssoCallback = `${window.location.origin}/api/auth/sso`;
        window.location.href = `${nqlAuthUrl}/login?redirect_to=${encodeURIComponent(ssoCallback)}&final=${encodeURIComponent(currentPath)}`;
      }
    }
  }, [shouldRedirect]);

  if (loading && !hasCheckedAuth) {
    return <LoadingScreen />;
  }

  if (!user && (shouldRedirect || hasCheckedAuth)) {
    return <LoadingScreen />;
  }

  return <>{children}</>;
}
