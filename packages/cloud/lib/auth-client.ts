import { createAuthClient } from "better-auth/react";

const AUTH_URL =
  process.env.NEXT_PUBLIC_NQL_AUTH_URL || "https://auth.neuroquestlabs.ai";

export const authClient = createAuthClient({
  baseURL: AUTH_URL,
});
