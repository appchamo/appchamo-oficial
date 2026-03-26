/** Site público para links de convite (cadastro / tornar-se profissional). */
export const CHAMO_INVITE_SITE_ORIGIN = "https://appchamo.com";

export function buildSignupProInviteUrl(inviteCode: string): string {
  const code = encodeURIComponent(inviteCode.trim().toUpperCase());
  return `${CHAMO_INVITE_SITE_ORIGIN}/signup-pro?ref=${code}`;
}

export function buildSignupInviteUrl(inviteCode: string): string {
  const code = encodeURIComponent(inviteCode.trim().toUpperCase());
  return `${CHAMO_INVITE_SITE_ORIGIN}/signup?ref=${code}`;
}

export function buildInviteShareMessage(inviteCode: string): string {
  const code = inviteCode.trim().toUpperCase();
  const linkPro = buildSignupProInviteUrl(inviteCode);
  const linkCliente = buildSignupInviteUrl(inviteCode);
  return (
    `Oi! Te convido pro Chamô — conecta profissionais e clientes na região.\n\n` +
    `Profissional: ${linkPro}\n` +
    `Cliente: ${linkCliente}\n\n` +
    `Código de convite (se pedir no cadastro): ${code}\n` +
    `Quem se cadastra com o código ganha benefícios na hora. Quem compartilha ganha 1 cupom extra de sorteio e 1 cupom de desconto para usar no app quando alguém conclui o cadastro com o código.`
  );
}
