import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const isNative = Capacitor.isNativePlatform();

// Cache em memória para evitar dezenas de Preferences.get na inicialização (Supabase chama getItem muitas vezes)
const authStorageCache = new Map<string, string | null>();

// No app nativo: nunca removemos *-code-verifier do storage. Ao reabrir pelo deep link,
// o cliente principal chama _removeSession() e apagaria o verifier; sem ele, exchangeCodeForSession falha.
const capacitorAuthStorage = {
  getItem: async (key: string): Promise<string | null> => {
    const cached = authStorageCache.get(key);
    if (cached !== undefined) return cached;
    try {
      const { value } = await Preferences.get({ key });
      const out = value ?? null;
      authStorageCache.set(key, out);
      return out;
    } catch (error) {
      console.error("Erro ao ler sessão do disco:", error);
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    authStorageCache.set(key, value);
    try {
      await Preferences.set({ key, value });
    } catch (error) {
      console.error("Erro ao salvar sessão no disco:", error);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    if (isNative && key.endsWith('-code-verifier')) return;
    authStorageCache.delete(key);
    try {
      await Preferences.remove({ key });
    } catch (error) {
      console.error("Erro ao deletar sessão do disco:", error);
    }
  },
};

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: isNative ? capacitorAuthStorage : window.localStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: !isNative,
    flowType: 'pkce',
  }
});
