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
            const platform = Capacitor.getPlatform();
            const deviceName = platform === 'ios' ? 'iPhone App' : platform === 'android' ? 'Android App' : 'App';

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
    const receivedListener = FirebaseMessaging.addListener('pushNotificationReceived', (message) => {
      console.log('📬 [Push] Nova notificação recebida (App Aberto):', message);
    });

    // Quando o usuário toca na notificação (abre o app): envia o link para o app navegar
    const actionListener = FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
      const data = event.notification?.data as { link?: string } | undefined;
      const link = data?.link;
      if (link && typeof link === 'string') {
        window.dispatchEvent(new CustomEvent('chamo-notification-open', { detail: { link } }));
      }
    });

    return () => {
      clearTimeout(timer);
      receivedListener.then(l => l.remove());
      actionListener.then(l => l.remove());
    };
  }, [userId]);
};