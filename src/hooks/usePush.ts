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
            // Pegamos o Device ID consistente com o resto do app
            const deviceId = localStorage.getItem("chamo_device_id");
            const deviceName = Capacitor.getPlatform() === 'ios' ? 'iPhone' : 'Android';

            console.log('☁️ [Push] Tentando salvar token para o dispositivo:', deviceId);

            const { error } = await supabase.from('user_devices').upsert(
              {
                user_id: userId,
                device_id: deviceId,
                push_token: token,
                device_name: deviceName,
                last_active: new Date().toISOString()
              }, 
              { 
                // 🚨 CORREÇÃO VITAL: O conflito deve ser baseado nas duas colunas
                // para bater com a regra de unicidade do banco de dados
                onConflict: 'user_id,device_id' 
              }
            );

            if (error) {
              console.error('💥 [Push] Erro ao salvar token no banco:', error.message);
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

    // Atraso de 2 segundos para estabilidade
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