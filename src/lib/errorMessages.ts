/**
 * Translate Supabase / API error messages to Portuguese (BR).
 */
export function translateError(msg: string): string {
  if (!msg) return "Erro desconhecido.";

  // Auth
  if (msg.includes("Email not confirmed")) return "E-mail ainda não confirmado. Verifique sua caixa de entrada.";
  if (msg.includes("Invalid login")) return "E-mail ou senha incorretos.";
  if (msg.includes("already registered")) return "Este e-mail já está cadastrado.";
  if (msg.includes("User already registered")) return "Este e-mail já está cadastrado.";
  if (msg.includes("password") && msg.includes("6")) return "A senha deve ter pelo menos 6 caracteres.";
  if (msg.includes("Password should be")) return "A senha deve ter pelo menos 6 caracteres.";
  if (msg.includes("rate") || msg.includes("too many")) return "Muitas tentativas. Aguarde um momento.";
  if (msg.includes("Email rate limit")) return "Muitas solicitações. Aguarde antes de tentar novamente.";
  if (msg.includes("not authorized") || msg.includes("Unauthorized")) return "Você não tem permissão para esta ação.";
  if (msg.includes("JWT")) return "Sessão expirada. Faça login novamente.";
  if (msg.includes("refresh_token")) return "Sessão expirada. Faça login novamente.";

  // RLS / DB
  if (msg.includes("row-level security")) return "Permissão negada. Verifique se você está logado.";
  if (msg.includes("violates unique")) return "Este registro já existe.";
  if (msg.includes("violates foreign key")) return "Referência inválida. Verifique os dados.";
  if (msg.includes("violates not-null")) return "Preencha todos os campos obrigatórios.";
  if (msg.includes("duplicate key")) return "Este registro já existe.";
  if (msg.includes("not found") || msg.includes("Not found")) return "Registro não encontrado.";

  // Storage
  if (msg.includes("Payload too large") || msg.includes("too large")) return "Arquivo muito grande.";
  if (msg.includes("mime type") || msg.includes("not allowed")) return "Tipo de arquivo não permitido.";

  // Network
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) return "Erro de conexão. Verifique sua internet.";
  if (msg.includes("timeout") || msg.includes("Timeout")) return "A requisição demorou demais. Tente novamente.";

  // Generic — return as-is if we can't translate
  return msg;
}
