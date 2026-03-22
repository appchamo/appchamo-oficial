import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SignJWT, importPKCS8 } from 'npm:jose@5.2.0'

/** Obtém access_token do Google OAuth2 com conta de serviço (compatível com Deno, sem google-auth-library). */
async function getGoogleAccessToken(clientEmail: string, privateKeyPem: string): Promise<string> {
  const pem = privateKeyPem.replace(/\\n/g, '\n')
  const key = await importPKCS8(pem, 'RS256')
  const now = Math.floor(Date.now() / 1000)
  const jwt = await new SignJWT({ scope: 'https://www.googleapis.com/auth/cloud-platform' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(clientEmail)
    .setAudience('https://oauth2.googleapis.com/token')
    .setSubject(clientEmail)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key)
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error_description || data.error)
  return data.access_token
}

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

    // 3. Busca TODOS os dispositivos do usuário (push_token + device_name para iOS vs Android)
    const { data: devices, error: deviceError } = await supabaseAdmin
      .from('user_devices')
      .select('push_token, device_name')
      .eq('user_id', record.user_id)
      .not('push_token', 'is', null)

    if (deviceError) {
      console.error("💥 Erro ao buscar no banco:", deviceError.message);
      return new Response(JSON.stringify({ error: deviceError.message }), { status: 500 })
    }

    const withToken = (devices || []).filter((d: { push_token: string }) => Boolean(d.push_token))
    const seen = new Set<string>()
    const devicesList = withToken.filter((d: { push_token: string }) => {
      const t = d.push_token
      if (seen.has(t)) return false
      seen.add(t)
      return true
    })
    if (devicesList.length === 0) {
      console.log(`⚠️ Nenhum token encontrado para o usuário ${record.user_id}. O app já pediu permissão e salvou em user_devices?`);
      return new Response(JSON.stringify({ ok: false, reason: "Token não encontrado" }), { status: 200 })
    }
    if (withToken.length > devicesList.length) {
      console.log(`📌 Tokens duplicados ignorados: ${withToken.length} linhas → ${devicesList.length} envios únicos`)
    }

    // 3b. Contagem de notificações não lidas (excl. chat) para o badge do ícone no iOS
    const { count: badgeCount } = await supabaseAdmin
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', record.user_id)
      .eq('read', false)
      .neq('type', 'chat')
    const badge = Math.min(Math.max(0, badgeCount ?? 0), 99)

    // 3c. Som do painel admin (só usado no Android, em primeiro plano)
    const { data: soundRow } = await supabaseAdmin
      .from('platform_settings')
      .select('value')
      .eq('key', 'notification_sound_url')
      .maybeSingle()
    const notificationSoundUrl = (soundRow?.value as string)?.trim() || ''

    console.log("📱 Dispositivos únicos:", devicesList.length, "Badge:", badge, "Preparando envio para o Firebase...");

    // 4. Access token do Google (jose = compatível com Deno; evita erro do google-auth-library/jws)
    const accessToken = await getGoogleAccessToken(
      firebaseConfig.client_email,
      firebaseConfig.private_key
    )

    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${firebaseConfig.project_id}/messages:send`
    const title = record.title || "Chamô 🚀"
    const body = record.message || "Você tem uma nova atualização."
    const imageUrl: string | null = record.image_url || null
    const dataPayload: Record<string, string> = {
      notification_id: String(record.id || ""),
      type: String(record.type || "general"),
      link: String(record.link || ""),
      ...(imageUrl ? { image_url: imageUrl } : {}),
      ...(notificationSoundUrl ? { sound_url: notificationSoundUrl } : {})
    }

    const isIosDevice = (name: string | null) => {
      const n = (name || "").toLowerCase()
      return n.includes("iphone") || n.includes("ipad") || n.includes("ios")
    }

    const results: unknown[] = []
    for (const device of devicesList) {
      const token = device.push_token as string
      const isIos = isIosDevice(device.device_name as string | null)

      const message: Record<string, unknown> = {
        token,
        data: dataPayload,
      }

      if (isIos) {
        // iOS: badge = contagem real de não lidas (o app zera ao abrir Notificações)
        const apns: Record<string, unknown> = {
          headers: { "apns-push-type": "alert" },
          payload: {
            aps: {
              alert: { title, body },
              badge,
              "mutable-content": 1,
            }
          }
        }
        // Imagem na notificação iOS via fcm_options (exibe no lock screen sem NSE)
        if (imageUrl) {
          apns.fcm_options = { image: imageUrl }
        }
        message.apns = apns
      } else {
        message.notification = { title, body, ...(imageUrl ? { image: imageUrl } : {}) }
        message.android = {
          priority: "high",
          ttl: "3600s",
          notification: {
            title,
            body,
            channelId: "default_v2",
            defaultSound: false,
            defaultVibrateTimings: true,
            ...(imageUrl ? { imageUrl } : {}),
          },
          data: dataPayload,
        }
      }

      const payload = { message }

      const res = await fetch(fcmUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
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

    return new Response(JSON.stringify({ sent: devicesList.length, results }), { status: 200 })

  } catch (err) {
    console.error("💥 Erro fatal na Edge Function:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})