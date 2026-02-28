import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const isNative = Capacitor.isNativePlatform();

// 🛡️ ADAPTADOR NATIVO BLINDADO: Padrão oficial exigido pelo Supabase para Capacitor
const capacitorAuthStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const { value } = await Preferences.get({ key });
      return value ?? null; // Supabase exige estritamente null se não existir (nunca undefined)
    } catch (error) {
      console.error("Erro ao ler sessão do disco:", error);
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await Preferences.set({ key, value });
    } catch (error) {
      console.error("Erro ao salvar sessão no disco:", error);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await Preferences.remove({ key });
    } catch (error) {
      console.error("Erro ao deletar sessão do disco:", error);
    }
  },
};

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    // Usa o HD do celular no Mobile e o LocalStorage normal na Web
    storage: isNative ? capacitorAuthStorage : window.localStorage,
    persistSession: true,
    autoRefreshToken: true,
    
    // 🚨 A MÁGICA ESTÁ AQUI: No Mobile DEVE ser false. 
    // Se for true, o app lê a URL interna (capacitor://) ao abrir, acha que o login falhou e apaga a sessão salva!
    detectSessionInUrl: !isNative, 
    
    flowType: 'pkce',
    
    // NOTA: Removi o "storageKey" customizado, pois às vezes ele gera conflito com os 
    // ciclos de atualização internos do Supabase. O padrão é muito mais seguro.
  }
});