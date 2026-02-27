import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// ✅ ADAPTADOR NATIVO CORRIGIDO: O Supabase exige que as funções retornem Promises
const capacitorAuthStorage = {
  getItem: (key: string) => {
    return Preferences.get({ key }).then(result => result.value);
  },
  setItem: (key: string, value: string) => {
    return Preferences.set({ key, value });
  },
  removeItem: (key: string) => {
    return Preferences.remove({ key });
  },
};

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    // Se for iPhone/Android, usa o Preferences (HD do celular). Se for Web, usa LocalStorage.
    storage: Capacitor.isNativePlatform() ? capacitorAuthStorage : localStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // ✅ Deixe true para capturar o login do Google
    flowType: 'pkce',
    storageKey: 'chamo-auth-token', // Nome estável para o arquivo de sessão
  }
});