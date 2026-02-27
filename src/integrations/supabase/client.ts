import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// 🧠 ADAPTADOR NATIVO: Salva a sessão no "HD" do celular para não deslogar
const capacitorStorage = {
  getItem: async (key: string) => {
    // No Capacitor, o retorno é um objeto { value: string | null }
    const { value } = await Preferences.get({ key });
    return value;
  },
  setItem: async (key: string, value: string) => {
    await Preferences.set({ key, value });
  },
  removeItem: async (key: string) => {
    await Preferences.remove({ key });
  },
};

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: Capacitor.isNativePlatform() ? (capacitorStorage as any) : localStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false, 
    flowType: 'pkce',
    // ⬇️ ADICIONE ESTA LINHA ABAIXO
    // Isso impede que o Supabase tente usar recursos de aba do navegador que não existem no app nativo
    storageKey: 'sb-chamo-auth', 
  }
});