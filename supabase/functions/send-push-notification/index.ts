import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { JWT } from 'https://esm.sh/google-auth-library@8.7.0'

serve(async (req) => {
  try {
    const { record } = await req.json()
    console.log("🚀 Nova notificação detectada para o usuário:", record.user_id);

    // 1. Carrega as credenciais do Firebase (Secrets do Supabase)
    const firebaseConfig = JSON.parse(Deno.env.get('FIREBASE_CONFIG') || '{}')
    if (!firebaseConfig.project_id || !firebaseConfig.client_email || !firebaseConfig.private_key) {
      console.error("💥 FIREBASE_CONFIG incompleto. Verifique project_id, client_email e private_key no Supabase Secrets.");
      return new Response(JSON.stringify({ error: "FIREBASE_CONFIG inválido" }), { status: 500 })
    }

    // 2. Configura o cliente Admin do Supabase
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 3. Busca TODOS os dispositivos do usuário (pode ter iOS + Android)
    const { data: devices, error: deviceError } = await supabaseAdmin
      .from('user_devices')
      .select('push_token')
      .eq('user_id', record.user_id)
      .not('push_token', 'is', null)

    if (deviceError) {
      console.error("💥 Erro ao buscar no banco:", deviceError.message);
      return new Response(JSON.stringify({ error: deviceError.message }), { status: 500 })
    }

    const tokens = (devices || []).map((d: { push_token: string }) => d.push_token).filter(Boolean)
    if (tokens.length === 0) {
      console.log(`⚠️ Nenhum token encontrado para o usuário ${record.user_id}. O app já pediu permissão e salvou em user_devices?`);
      return new Response(JSON.stringify({ ok: false, reason: "Token não encontrado" }), { status: 200 })
    }

    console.log("📱 Tokens encontrados:", tokens.length, "Preparando envio para o Firebase...");

    // 4. Gera o Token de Autenticação para o Google/Firebase
    const client = new JWT(
      firebaseConfig.client_email,
      undefined,
      firebaseConfig.private_key,
      ['https://www.googleapis.com/auth/cloud-platform']
    )
    const auth = await client.authorize()

    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${firebaseConfig.project_id}/messages:send`
    const title = record.title || "Chamô 🚀"
    const body = record.message || "Você tem uma nova atualização."
    const dataPayload: Record<string, string> = {
      notification_id: String(record.id || ""),
      type: String(record.type || "general"),
      link: String(record.link || "")
    }

    const results: unknown[] = []
    for (const token of tokens) {
      const payload = {
        message: {
          token,
          notification: { title, body },
          data: dataPayload,
          apns: {
            payload: {
              aps: { sound: "default", badge: 1, contentAvailable: true }
            }
          },
          android: {
            priority: "high",
            notification: {
              title,
              body,
              channelId: "default",
              defaultSound: true,
              defaultVibrateTimings: true,
            },
            data: dataPayload,
          }
        }
      }

      const res = await fetch(fcmUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.access_token}`
        },
        body: JSON.stringify(payload)
      })

      const result = await res.json()
      console.log("✅ Resposta FCM:", res.status, JSON.stringify(result))
      if (result.error) {
        console.error("💥 FCM erro para um token:", result.error.message || result.error)
      }
      results.push(result)
    }

    return new Response(JSON.stringify({ sent: tokens.length, results }), { status: 200 })

  } catch (err) {
    console.error("💥 Erro fatal na Edge Function:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})