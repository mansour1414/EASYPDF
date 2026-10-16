/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;
const procEnv = typeof process !== 'undefined' ? process.env : undefined;

const rawUrl = metaEnv?.VITE_SUPABASE_URL || metaEnv?.SUPABASE_URL || procEnv?.VITE_SUPABASE_URL || procEnv?.SUPABASE_URL;
const rawKey = metaEnv?.VITE_SUPABASE_ANON_KEY || metaEnv?.SUPABASE_ANON_KEY || metaEnv?.SUPABASE_KEY || procEnv?.VITE_SUPABASE_ANON_KEY || procEnv?.SUPABASE_ANON_KEY || procEnv?.SUPABASE_KEY;

// isSupabaseConfigured must reflect whether REAL env vars were provided —
// previously this used `rawUrl || 'https://...supabase.co'` as the left
// operand, so it was effectively always true (since the fallback is always
// truthy) whenever any key-like value was present, even a placeholder,
// producing confusing "invalid JWT" errors instead of a clear
// "Supabase not configured" message.
export const isSupabaseConfigured = !!(rawUrl && rawKey);

if (!isSupabaseConfigured) {
  console.warn(
    '[EasyPDF] Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing). ' +
    'Falling back to a non-functional placeholder client — auth and cloud storage will not work until these are set.'
  );
}

// Use default Supabase URL provided by user, stripped of any trailing /rest/v1 or slashes
const rawBaseUrl = rawUrl || 'https://fsawspgiiaswbkhxqmgc.supabase.co';
const supabaseUrl = rawBaseUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
// NOTE: this placeholder key is intentionally a well-formed-but-invalid JWT,
// used only so createClient() doesn't throw when env vars are absent (e.g.
// local preview without a .env file). isSupabaseConfigured is what code
// should actually branch on — never assume the client is usable just
// because `supabase` exists.
const supabaseAnonKey = rawKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzYXdzcGdpaWFzd2JraHhxbWdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE1NzA4MTYwMDAsImV4cCI6MjU5MjAwMDAwMH0.placeholder';

// Initialize client side Supabase client safely
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Retrieves authorization headers containing the active Supabase JWT access token.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};

  if (isSupabaseConfigured) {
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) {
        headers['Authorization'] = `Bearer ${data.session.access_token}`;
        return headers;
      }
    } catch (e) {
      console.warn('Failed to retrieve Supabase session access token:', e);
    }
  }

  // Fallback for local mock user session if Supabase session is not present (Development environment only)
  const isProduction = (import.meta as any).env?.MODE === 'production' || (import.meta as any).env?.PROD;
  if (!isProduction) {
    const saved = localStorage.getItem('user_session');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed?.token) {
          headers['Authorization'] = `Bearer ${parsed.token}`;
        } else if (parsed?.id) {
          headers['Authorization'] = `Bearer mock-token-${parsed.id}`;
        }
      } catch (e) {
        // ignore
      }
    }
  }

  return headers;
}

/**
 * Resolves an API path against VITE_API_BASE_URL if configured, or returns normalized path.
 */
export function getApiUrl(path: string): string {
  const rawBase = (import.meta as any).env?.VITE_API_BASE_URL || (import.meta as any).env?.API_BASE_URL;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (rawBase && typeof rawBase === 'string' && rawBase.trim() !== '') {
    const cleanBase = rawBase.trim().replace(/\/+$/, '');
    return `${cleanBase}${normalizedPath}`;
  }
  return normalizedPath;
}

/**
 * Resolves the OAuth redirect callback URL using VITE_AUTH_REDIRECT_URL or fallback to window.location.origin.
 */
export function getAuthRedirectUrl(): string {
  const customRedirect = (import.meta as any).env?.VITE_AUTH_REDIRECT_URL || (import.meta as any).env?.AUTH_REDIRECT_URL;
  if (customRedirect && typeof customRedirect === 'string' && customRedirect.trim() !== '') {
    return customRedirect.trim();
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'http://localhost:3000';
}

/**
 * Reusable fetch wrapper that automatically appends the Supabase Bearer access token header
 * and resolves URLs via getApiUrl for cross-platform support.
 */
export async function authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const targetUrl = getApiUrl(url);
  const authHeaders = await getAuthHeaders();
  const existingHeaders = (options.headers as Record<string, string>) || {};

  return fetch(targetUrl, {
    ...options,
    headers: {
      ...authHeaders,
      ...existingHeaders
    }
  });
}

