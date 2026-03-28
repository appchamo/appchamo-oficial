/**
 * Translate Supabase / API error messages to Portuguese (BR).
 */
export function translateError(msg: string): string {
  if (!msg) return "Erro desconhecido.";

  const m = msg.trim();

  // Auth — cooldown de reenvio (signup / recovery)
  const resendAfterSec = m.match(/only request this after (\d+)\s*seconds?/i);
  if (resendAfterSec) {
    return `Por segurança, aguarde ${resendAfterSec[1]} segundos antes de tentar de novo.`;
  }
  if (/for security purposes/i.test(m) && /request/i.test(m)) {
    return "Por segurança, aguarde um momento antes de tentar de novo.";
  }
  if (/email rate limit|over_email_send_rate_limit|sms rate limit|over_sms_send_rate_limit/i.test(m)) {
    return "Muitas solicitações por e-mail. Aguarde alguns minutos e tente novamente.";
  }

  // Auth
  if (m.includes("Email not confirmed")) return "E-mail ainda não confirmado. Verifique sua caixa de entrada.";
  if (m.includes("Invalid login")) return "E-mail ou senha incorretos.";
  if (m.includes("Invalid credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("already registered")) return "Este e-mail já está cadastrado.";
  if (m.includes("User already registered")) return "Este e-mail já está cadastrado.";
  if (m.includes("User not found")) return "Usuário não encontrado. Verifique o e-mail.";
  if (/invalid email|email address is invalid|unable to validate email/i.test(m)) {
    return "E-mail inválido. Verifique o endereço digitado.";
  }
  if (m.includes("password") && m.includes("6")) return "A senha deve ter pelo menos 6 caracteres.";
  if (m.includes("Password should be")) return "A senha deve ter pelo menos 6 caracteres.";
  if (/same as the old password|new password should be different/i.test(m)) {
    return "A nova senha precisa ser diferente da anterior.";
  }
  if (msg.includes("rate") || msg.includes("too many")) return "Muitas tentativas. Aguarde um momento.";
  if (msg.includes("Email rate limit")) return "Muitas solicitações. Aguarde antes de tentar novamente.";
  if (msg.includes("not authorized") || msg.includes("Unauthorized")) return "Você não tem permissão para esta ação.";
  if (/token has expired|invalid.*token|link is invalid or has expired|invalid refresh token/i.test(m)) {
    return "Link ou sessão expirados. Solicite um novo e-mail ou faça login de novo.";
  }
  if (msg.includes("JWT")) return "Sessão expirada. Faça login novamente.";
  if (msg.includes("refresh_token")) return "Sessão expirada. Faça login novamente.";
  if (/signups not allowed|signup is disabled/i.test(m)) {
    return "Novos cadastros estão temporariamente indisponíveis.";
  }

  // RLS / DB
  if (msg.includes("row-level security")) return "Permissão negada. Verifique se você está logado.";
  if ((msg.toLowerCase().includes("cpf") || msg.toLowerCase().includes("cnpj")) && (msg.includes("unique") || msg.includes("duplicate")))
    return "CPF ou CNPJ já cadastrado. Verifique o número ou use outro.";
  if (msg.includes("violates unique")) return "Este registro já existe.";
  if (msg.includes("violates foreign key")) return "Referência inválida. Verifique os dados.";
  if (msg.includes("violates not-null")) return "Preencha todos os campos obrigatórios.";
  if (msg.includes("duplicate key")) return "Este registro já existe.";
  if (msg.includes("not found") || msg.includes("Not found")) return "Registro não encontrado.";
  if (/permission denied|access denied|forbidden/i.test(m)) return "Acesso negado.";

  // Storage
  if (msg.includes("Payload too large") || msg.includes("too large")) return "Arquivo muito grande.";
  if (msg.includes("mime type") || msg.includes("not allowed")) return "Tipo de arquivo não permitido.";

  // Network
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) return "Erro de conexão. Verifique sua internet.";
  if (msg.includes("timeout") || msg.includes("Timeout")) return "A requisição demorou demais. Tente novamente.";

  // Mensagens curtas em inglês muito comuns
  if (/^bad request$/i.test(m)) return "Pedido inválido. Tente de novo.";
  if (/^internal server error$/i.test(m)) return "Erro no servidor. Tente mais tarde.";

  return msg;
}
