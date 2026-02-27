import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { JWT } from 'https://esm.sh/google-auth-library@8.7.0'

serve(async (req) => {
  try {
    const { record } = await req.json()
    console.log("🚀 Nova notificação detectada para o usuário:", record.user_id);

    // 1. Carrega as credenciais do Firebase (Secrets do Supabase)
    const firebaseConfig = JSON.parse(Deno.env.get('FIREBASE_CONFIG') || '{}')
    
    // 2. Configura o cliente Admin do Supabase
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 3. Busca o Token (FCM) na tabela user_devices
    // Ajustado para 'user_id' que é o que vem da sua tabela 'notifications'
    const { data: device, error: deviceError } = await supabaseAdmin
      .from('user_devices')
      .select('push_token') // Garanta que o nome da coluna no banco é fcm_token ou push_token
      .eq('user_id', record.user_id) 
      .maybeSingle()

    if (deviceError || !device?.push_token) {
      console.log("⚠️ Token não encontrado para este usuário. Abortando envio.");
      return new Response('Token não encontrado', { status: 200 })
    }

    // 4. Gera o Token de Autenticação para o Google/Firebase
    const client = new JWT(
      firebaseConfig.client_email,
      undefined,
      firebaseConfig.private_key,
      ['https://www.googleapis.com/auth/cloud-platform']
    )
    const tokens = await client.authorize()

    // 5. Monta o Payload da Notificação
    // Usando record.title e record.message que são as colunas da sua tabela!
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${firebaseConfig.project_id}/messages:send`
    const payload = {
      message: {
        token: device.push_token,
        notification: {
          title: record.title || "Chamô 🚀",
          body: record.message || "Você tem uma nova atualização."
        },
        // Configuração para o iPhone entender o som e o ícone (badge)
        apns: {
          payload: {
            aps: {
              sound: "default",
              badge: 1,
              contentAvailable: true
            }
          }
        },
        // Dados extras caso o app precise processar algo em segundo plano
        data: {
          notification_id: record.id?.toString(),
          type: record.type || "general"
        }
      }
    }

    // 6. Envia para o Firebase
    const res = await fetch(fcmUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokens.access_token}`
      },
      body: JSON.stringify(payload)
    })

    const result = await res.json()
    console.log("✅ Resposta do Firebase:", JSON.stringify(result));
    
    return new Response(JSON.stringify(result), { status: 200 })

  } catch (err) {
    console.error("💥 Erro na Edge Function:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})