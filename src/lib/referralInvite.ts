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
  const link = buildSignupProInviteUrl(inviteCode);
  return (
    `Oi! Vim te convidar para o Chamô — o ecossistema que conecta profissionais e clientes no Triângulo Mineiro e região. ` +
    `Cadastre-se como profissional e faça parte:\n\n${link}\n\n` +
    `Se pedir código de indicação, use: ${inviteCode.trim().toUpperCase()}`
  );
}
