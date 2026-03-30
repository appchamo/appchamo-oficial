/** Consumidores em ordem de registro (o último registo trata primeiro — ex.: câmera sobre o passo). */
type OverlayConsumer = () => boolean;
const overlayConsumers: OverlayConsumer[] = [];

/** Regista fecho de overlay (câmera, etc.) para o botão voltar nativo não usar history.back(). */
export function registerChamoSignupOverlayConsumer(fn: OverlayConsumer): () => void {
  overlayConsumers.push(fn);
  return () => {
    const i = overlayConsumers.indexOf(fn);
    if (i >= 0) overlayConsumers.splice(i, 1);
  };
}

export function tryChamoSignupOverlayBack(): boolean {
  for (let i = overlayConsumers.length - 1; i >= 0; i--) {
    try {
      if (overlayConsumers[i]()) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}
