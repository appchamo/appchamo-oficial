/** Resposta do ViaCEP (apenas campos usados). */
export interface ViaCepResponse {
  cep?: string;
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
}

const VIACEP_URL = "https://viacep.com.br/ws";

/**
 * Busca endereço pelo CEP no ViaCEP.
 * @param cep CEP com ou sem máscara (apenas 8 dígitos)
 * @returns Dados do endereço ou null se não encontrar / erro
 */
export async function fetchViaCep(cep: string): Promise<ViaCepResponse | null> {
  const raw = cep.replace(/\D/g, "");
  if (raw.length !== 8) return null;
  try {
    const res = await fetch(`${VIACEP_URL}/${raw}/json/`);
    const data: ViaCepResponse = await res.json();
    if (data?.erro) return null;
    return data;
  } catch {
    return null;
  }
}
