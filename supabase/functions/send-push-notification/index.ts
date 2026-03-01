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

    // 3. Busca o Token na tabela user_devices
    // Confirmado: a coluna no seu banco se chama 'push_token'
    const { data: device, error: deviceError } = await supabaseAdmin
      .from('user_devices')
      .select('push_token')
      .eq('user_id', record.user_id) 
      .maybeSingle()

    if (deviceError) {
      console.error("💥 Erro ao buscar no banco:", deviceError.message);
    }

    if (!device?.push_token) {
      console.log(`⚠️ Token não encontrado para o usuário ${record.user_id}. Verifique se a coluna push_token na tabela user_devices não está NULL.`);
      return new Response('Token não encontrado', { status: 200 })
    }

    console.log("📱 Token encontrado! Preparando envio para o Firebase...");

    // 4. Gera o Token de Autenticação para o Google/Firebase
    const client = new JWT(
      firebaseConfig.client_email,
      undefined,
      firebaseConfig.private_key,
      ['https://www.googleapis.com/auth/cloud-platform']
    )
    const tokens = await client.authorize()

    // 5. Monta o Payload da Notificação
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${firebaseConfig.project_id}/messages:send`
    const payload = {
      message: {
        token: device.push_token,
        notification: {
          title: record.title || "Chamô 🚀",
          body: record.message || "Você tem uma nova atualização."
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
              badge: 1,
              contentAvailable: true
            }
          }
        },
        data: {
          notification_id: String(record.id || ""),
          type: String(record.type || "general"),
          link: String(record.link || "")
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
    console.error("💥 Erro fatal na Edge Function:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})