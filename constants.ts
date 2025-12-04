
// This file is used for application-wide constants.

interface AppConfig {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

let memoizedConfig: AppConfig | null = null;

/**
 * Lazily initializes and returns the application configuration.
 * It attempts to load from:
 * 1. Vite environment variables (import.meta.env) - Best for production/deployment.
 * 2. window.__APP_ENV__ - Best for quick local development via index.html.
 * 
 * @returns {AppConfig} The application configuration.
 * @throws {Error} If required environment variables are not set in either location.
 */
export function getConfig(): AppConfig {
  if (memoizedConfig) {
    return memoizedConfig;
  }

  let supabaseUrl: string | undefined;
  let supabaseAnonKey: string | undefined;

  // 1. Try Vite's environment variables safely
  try {
    // Check if import.meta.env exists before accessing properties to avoid "Cannot read properties of undefined"
    if (import.meta && import.meta.env) {
      supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    }
  } catch (e) {
    // Ignore errors if import.meta is not available
    console.warn('Skipping import.meta.env check due to environment issue.');
  }

  // 2. Fallback to window.__APP_ENV__ (Dev environment)
  // We check if 'window' matches the expected shape to avoid errors in non-browser envs (though unlikely here)
  if ((!supabaseUrl || !supabaseAnonKey) && typeof window !== 'undefined' && window.__APP_ENV__) {
    supabaseUrl = supabaseUrl || window.__APP_ENV__.SUPABASE_URL;
    supabaseAnonKey = supabaseAnonKey || window.__APP_ENV__.SUPABASE_ANON_KEY;
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Supabase URL or Anon Key is not defined. Please set them in your .env file (VITE_SUPABASE_URL) OR in index.html (window.__APP_ENV__) for local development.');
    throw new Error('Application is not configured correctly. Missing Supabase credentials.');
  }

  memoizedConfig = {
    SUPABASE_URL: supabaseUrl,
    SUPABASE_ANON_KEY: supabaseAnonKey,
  };
  
  return memoizedConfig;
}
