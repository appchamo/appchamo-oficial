import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { JWT } from 'https://esm.sh/google-auth-library@8.7.0'

serve(async (req) => {
  try {
    const { record } = await req.json()

    // 1. Carrega as credenciais do Firebase que você salvou nos Secrets
    const firebaseConfig = JSON.parse(Deno.env.get('FIREBASE_CONFIG') || '{}')
    
    // 2. Configura o cliente Admin do Supabase
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 3. Busca o Token de quem deve receber a notificação
    // Nota: Ajuste 'target_user_id' para o nome da coluna que guarda o ID do dono do serviço
    const { data: device, error: deviceError } = await supabaseAdmin
      .from('user_devices')
      .select('push_token')
      .eq('id', record.professional_id || record.user_id) 
      .single()

    if (deviceError || !device?.push_token) {
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
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${firebaseConfig.project_id}/messages:send`
    const payload = {
      message: {
        token: device.push_token,
        notification: {
          title: "Nova Solicitação no Chamô! 🚀",
          body: "Alguém acabou de solicitar os seus serviços. Confira agora!"
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
              badge: 1
            }
          }
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
    return new Response(JSON.stringify(result), { status: 200 })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})