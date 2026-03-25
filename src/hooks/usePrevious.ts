import { useRef } from "react";

/** Valor da renderização anterior (útil para saber de qual rota o usuário veio). */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  const prev = ref.current;
  ref.current = value;
  return prev;
}
