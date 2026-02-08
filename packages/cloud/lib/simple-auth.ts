/**
 * Simple password-based authentication for personal use.
 * No database required - uses environment variable for password.
 */

import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';

const AUTH_COOKIE_NAME = 'stratuscode_auth';
const JWT_SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || 'stratuscode-default-secret-change-me'
);

export interface AuthSession {
  authenticated: boolean;
  userId: string;
}

/**
 * Verify password and create session
 */
export async function login(password: string): Promise<boolean> {
  const correctPassword = process.env.AUTH_PASSWORD;
  
  if (!correctPassword) {
    console.error('AUTH_PASSWORD environment variable not set');
    return false;
  }
  
  if (password !== correctPassword) {
    return false;
  }
  
  // Create JWT token
  const token = await new SignJWT({ userId: 'owner', authenticated: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);
  
  // Set cookie
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  });
  
  return true;
}

/**
 * Get current auth session
 */
export async function getSession(): Promise<AuthSession | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
    
    if (!token) {
      return null;
    }
    
    const { payload } = await jwtVerify(token, JWT_SECRET);
    
    return {
      authenticated: true,
      userId: payload.userId as string,
    };
  } catch {
    return null;
  }
}

/**
 * Logout - clear session
 */
export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();
  return session?.authenticated ?? false;
}
