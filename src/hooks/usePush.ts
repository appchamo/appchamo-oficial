import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { LocalNotifications } from '@capacitor/local-notifications';
import { supabase } from '@/integrations/supabase/client';

const isAndroid = () => Capacitor.getPlatform() === 'android';

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

        // Android: canal default_v2 (som chamo_notification) e permissão para notificações locais
        if (isAndroid()) {
          const { display } = await LocalNotifications.checkPermissions();
          if (display !== 'granted') {
            await LocalNotifications.requestPermissions();
          }
          // Canal com som do app (celular bloqueado). default_v2 para quem já tem "default" sem som.
          await LocalNotifications.createChannel({
            id: 'default_v2',
            name: 'Notificações',
            importance: 5,
            visibility: 1,
            sound: 'chamo_notification',
          });
        }

        // Pede a permissão pro usuário
        const { receive } = await FirebaseMessaging.requestPermissions();

        if (receive === 'granted') {
          console.log('✅ [Push] Permissão concedida! Buscando token...');

          // Pega o Token do Firebase
          const { token } = await FirebaseMessaging.getToken();
          console.log('📲 [Push] Token gerado:', token);

          // Salva no Supabase atrelado ao usuário (device_id sempre preenchido para não criar linhas duplicadas)
          if (token) {
            let deviceId = localStorage.getItem("chamo_device_id");
            if (!deviceId) {
              deviceId = crypto.randomUUID();
              localStorage.setItem("chamo_device_id", deviceId);
            }
            const platform = Capacitor.getPlatform();
            const deviceName = platform === 'ios' ? 'iPhone App' : platform === 'android' ? 'Android App' : 'App';

            console.log('☁️ [Push] Tentando salvar token para o dispositivo:', deviceId);

            // Remove o token de QUALQUER outro usuário que tenha este mesmo dispositivo.
            // Usa RPC com SECURITY DEFINER para bypasear a RLS (que só permite deletar próprios registros).
            // Garante que ao trocar de conta no mesmo celular, o token anterior
            // não continue disparando notificações para a conta antiga.
            await supabase.rpc('claim_device_token', { p_token: token });

            const { error } = await supabase.from('user_devices').upsert(
              {
                user_id: userId,
                device_id: deviceId,
                push_token: token,
                device_name: deviceName,
                last_active: new Date().toISOString()
              },
              { onConflict: 'user_id,device_id' }
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

    const timer = setTimeout(() => {
      setupPush();
    }, 2000);

    // App em primeiro plano: Android exibe notificação local; iOS não toca som nem usa Audio() para não aparecer como "Now Playing"
    const receivedListener = FirebaseMessaging.addListener('pushNotificationReceived', (message: { notification?: { title?: string; body?: string }; data?: Record<string, string> }) => {
      console.log('📬 [Push] Nova notificação recebida (App Aberto):', message);
      if (isAndroid()) {
        const title = message?.notification?.title ?? message?.data?.title ?? 'Chamô';
        const body = message?.notification?.body ?? message?.data?.body ?? message?.data?.message ?? 'Nova atualização.';
        const id = Math.abs(Math.floor(Math.random() * 2147483647));
        LocalNotifications.schedule({
          notifications: [{
            id,
            title,
            body,
            channelId: 'default_v2',
            schedule: { at: new Date(Date.now() + 300) },
            extra: message?.data ?? {},
          }],
        }).catch((err) => console.warn('📬 [Push] Falha ao exibir notificação local:', err));
      }
    });

    // Quando o usuário toca na notificação (abre o app): envia o link para o app navegar
    const actionListener = FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
      const data = event.notification?.data as { link?: string } | undefined;
      const link = data?.link;
      if (link && typeof link === 'string') {
        window.dispatchEvent(new CustomEvent('chamo-notification-open', { detail: { link } }));
      }
    });

    // Toque em notificação local (Android, push em primeiro plano)
    const localActionPromise = isAndroid()
      ? LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
          const extra = event.notification?.extra as { link?: string } | undefined;
          const link = extra?.link;
          if (link && typeof link === 'string') {
            window.dispatchEvent(new CustomEvent('chamo-notification-open', { detail: { link } }));
          }
        })
      : Promise.resolve({ remove: () => {} });

    return () => {
      clearTimeout(timer);
      receivedListener.then(l => l.remove());
      actionListener.then(l => l.remove());
      localActionPromise.then(l => l.remove());
    };
  }, [userId]);
};