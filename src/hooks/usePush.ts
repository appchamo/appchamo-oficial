import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { supabase } from '@/integrations/supabase/client';

export const usePush = (userId?: string) => {
  useEffect(() => {
    // 1. Só roda se for nativo e tiver usuário logado
    if (!Capacitor.isNativePlatform() || !userId) {
      console.log('🛑 [Push] Abortado: Não é nativo ou sem usuário');
      return;
    }

    const setupPush = async () => {
      try {
        console.log('🔔 [Push] Solicitando permissão para o usuário...');
        
        // Pede a permissão pro usuário
        const { receive } = await FirebaseMessaging.requestPermissions();
        
        if (receive === 'granted') {
          console.log('✅ [Push] Permissão concedida! Buscando token...');
          
          // Pega o Token do Firebase
          const { token } = await FirebaseMessaging.getToken();
          console.log('📲 [Push] Token gerado:', token);

          // Salva no Supabase atrelado ao usuário
          if (token) {
            const { error } = await supabase.from('user_devices').upsert({
              user_id: userId,
              device_id: localStorage.getItem("chamo_device_id") || await Capacitor.getId(),
              push_token: token,
              device_name: Capacitor.getPlatform()
            }, { onConflict: 'device_id' });

            if (error) {
              console.error('💥 [Push] Erro ao salvar token no banco:', error);
            } else {
              console.log('☁️ [Push] Token salvo com sucesso no banco de dados!');
            }
          } else {
            console.log('⚠️ [Push] Permissão concedida, mas o Firebase retornou um token vazio.');
          }
        } else {
          console.log('❌ [Push] Usuário negou a permissão de notificação.');
        }
      } catch (error) {
        console.error('💥 [Push] Erro fatal ao configurar notificações:', error);
      }
    };

    // Atraso intencional de 2 segundos para dar tempo do app carregar a tela Home
    // e o iOS não bugar a caixa de permissão.
    const timer = setTimeout(() => {
      setupPush();
    }, 2000);

    // Escuta notificações recebidas com o app aberto
    const listener = FirebaseMessaging.addListener('pushNotificationReceived', (message) => {
      console.log('📬 [Push] Nova notificação recebida (App Aberto):', message);
    });

    return () => {
      clearTimeout(timer);
      listener.then(l => l.remove());
    };
  }, [userId]);
};