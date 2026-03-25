/** Formata segundos (média de tempo até aceitar chamado) para exibição no perfil. */
export function formatAvgResponseSeconds(seconds: number | null | undefined): string | null {
  if (seconds == null || seconds < 0 || !Number.isFinite(seconds)) return null;
  if (seconds < 60) return "menos de 1 min";
  const m = Math.floor(seconds / 60);
  if (m < 60) return m === 1 ? "1 min" : `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (rem === 0) return h === 1 ? "1h" : `${h}h`;
  return `${h}h ${rem} min`;
}
