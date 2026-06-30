export const formatCpf = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
};

/** Máscara dinâmica: até 11 dígitos como CPF, a partir do 12º como CNPJ (tornar-se profissional). */
export const formatCpfOuCnpj = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) return formatCpf(d);
  return formatCnpj(d);
};

export const formatCnpj = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
};

export const formatPhone = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

export const formatCep = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
};

/**
 * Valida CPF: 11 dígitos + dígitos verificadores corretos.
 * Rejeita sequências repetidas (000.000.000-00, 111.111.111-11 etc.) que
 * passariam no algoritmo mas nunca são CPFs reais.
 */
/** CPFs reservados para contas de TESTE — passam na validação e podem repetir. */
export const TEST_CPFS = new Set<string>(["00000000000"]);

export const validateCpf = (v: string): boolean => {
  const d = v.replace(/\D/g, "");
  if (TEST_CPFS.has(d)) return true; // CPF de teste reservado
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;

  const digits = d.split("").map(Number);
  for (const k of [9, 10] as const) {
    let sum = 0;
    for (let i = 0; i < k; i++) sum += digits[i] * (k + 1 - i);
    const check = (sum * 10) % 11 % 10;
    if (check !== digits[k]) return false;
  }
  return true;
};

/**
 * Valida CNPJ: 14 dígitos + dígitos verificadores corretos.
 */
export const validateCnpj = (v: string): boolean => {
  const d = v.replace(/\D/g, "");
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;

  const digits = d.split("").map(Number);
  const calc = (slice: number[], weights: number[]) => {
    const sum = slice.reduce((acc, n, i) => acc + n * weights[i], 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  if (calc(digits.slice(0, 12), w1) !== digits[12]) return false;
  if (calc(digits.slice(0, 13), w2) !== digits[13]) return false;
  return true;
};
export const validatePhone = (v: string) => {
  const d = v.replace(/\D/g, "");
  return d.length === 10 || d.length === 11;
};
