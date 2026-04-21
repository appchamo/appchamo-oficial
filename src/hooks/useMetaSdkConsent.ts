import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { enableMetaSdk } from "@/plugins/metaSdk";

const META_SDK_ENABLED_KEY = "chamo_meta_sdk_enabled_v1";

/**
 * Observa o consent de Termos de Uso (LGPD) e ativa o Meta SDK no Android
 * apenas quando o usuário aceita. O sinal de consent é
 * profile.accepted_terms_version (coluna setada no fluxo /signup).
 *
 * Guarda em localStorage que o SDK já foi ativado neste dispositivo para
 * evitar chamadas repetidas da ponte nativa em cada render. Após cold
 * start o Manifest mantém tudo "false", então mesmo com a flag em
 * localStorage o JS reativa o SDK a cada nova sessão do usuário logado
 * com consent — comportamento correto, sem janela de coleta sem consent.
 */
export function useMetaSdkConsent(
  acceptedTermsVersion: string | null | undefined,
) {
  const didEnableRef = useRef(false);

  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return;
    if (didEnableRef.current) return;

    const consent = (acceptedTermsVersion || "").trim();
    if (!consent) return;

    didEnableRef.current = true;
    try {
      localStorage.setItem(META_SDK_ENABLED_KEY, consent);
    } catch {
      /* storage cheio ou bloqueado — segue adiante */
    }
    void enableMetaSdk();
  }, [acceptedTermsVersion]);
}
