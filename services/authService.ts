import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabaseService';

export const signInWithPassword = async (email: string, password: string): Promise<{ session: Session | null; error: string | null }> => {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { session: null, error: error.message };
    }
    return { session: data.session, error: null };
  } catch (err: any) {
    return { session: null, error: err.message || "An unexpected error occurred." };
  }
};

export const signOut = async (): Promise<{ error: string | null }> => {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      return { error: error.message };
    }
    return { error: null };
  } catch (err: any) {
    return { error: err.message || "An unexpected error occurred during sign out." };
  }
};

export const getSession = async (): Promise<{ session: Session | null; error: string | null }> => {
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase.auth.getSession();
        if (error) {
            return { session: null, error: error.message };
        }
        return { session: data.session, error: null };
    } catch (err: any) {
        return { session: null, error: err.message || "An unexpected error occurred." };
    }
};

export const onAuthStateChange = (callback: (session: Session | null) => void) => {
    const supabase = getSupabaseClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        callback(session);
    });
    return subscription;
};
