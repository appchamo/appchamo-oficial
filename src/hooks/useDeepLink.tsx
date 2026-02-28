import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { supabase } from '@/integrations/supabase/client';
import { Capacitor } from '@capacitor/core';

// 🛡️ O Guarda-Costas Global: Fica fora do React, então nunca é recriado ou duplicado.
let lastProcessedCode = '';

export const useDeepLink = () => {
  const navigate = useNavigate();
  
  // Ref para garantir que o useEffect só configure o ouvinte uma única vez
  const isSetupRef = useRef(false);

  useEffect(() => {
    // 1. Se não for celular, ou se já configurou, aborta.
    if (!Capacitor.isNativePlatform() || isSetupRef.current) return;
    isSetupRef.current = true;

    console.log("⚙️ Iniciando Listener de Deep Link (Apenas uma vez!)...");

    const handleDeepLink = async (urlStr: string) => {
      if (!urlStr) return;

      // Arruma a formatação da URL
      let fixedUrl = urlStr.replace('#', '?');
      if (fixedUrl.startsWith('com.chamo.app:?')) {
        fixedUrl = fixedUrl.replace('com.chamo.app:?', 'com.chamo.app://?');
      }

      const urlObj = new URL(fixedUrl);
      const params = new URLSearchParams(urlObj.search);
      let code = params.get('code');

      if (code) {
        code = code.replace(/[^a-zA-Z0-9-]/g, '');

        // 🛑 A TRAVA MESTRA: Se o iOS mandar a mesma URL em loop, ignoramos!
        if (code === lastProcessedCode) {
          console.log("⚠️ URL repetida bloqueada pelo useDeepLink.");
          return;
        }
        lastProcessedCode = code; // Salva o código para bloquear o próximo clone

        try {
          console.log("🚀 Processando código PKCE único:", code);
          
          // Tenta fechar o Safari/Navegador nativo
          setTimeout(async () => {
            await Browser.close().catch(() => {});
          }, 300);

          // Troca o código pela sessão no Supabase
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          
          if (error) {
            console.log("⚠️ Supabase rejeitou o código (já usado?):", error.message);
            return;
          }
          
          if (data?.session) {
            console.log("✅ Sessão validada via Deep Link! Redirecionando...");
            navigate("/home", { replace: true });
          }
        } catch (err) {
          console.error('💥 Erro no Deep Link:', err);
        }
      }
    };

    // 2. Cria o ouvinte para quando o app volta de segundo plano (ex: volta do Safari)
    const listener = CapacitorApp.addListener('appUrlOpen', (event) => {
      handleDeepLink(event.url);
    });

    // 3. Verifica a URL se o app foi aberto do zero
    CapacitorApp.getLaunchUrl().then(launchUrl => {
      if (launchUrl?.url) {
        handleDeepLink(launchUrl.url);
      }
    });

    // 4. Limpeza de segurança caso o app seja destruído
    return () => {
      listener.then(l => l.remove());
      isSetupRef.current = false;
    };
  }, [navigate]); 
};