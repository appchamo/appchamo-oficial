/**
 * Patrocinadores usam o app como cliente (com benefícios da conta).
 * O perfil profissional deles não deve aparecer para outros utilizadores em buscas/listagens.
 */
export function isSponsorClientAccount(userType: string | null | undefined): boolean {
  return userType === "sponsor";
}
