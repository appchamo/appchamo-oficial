package com.chamo.app;

import com.facebook.FacebookSdk;
import com.facebook.appevents.AppEventsLogger;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Ponte nativa para ativar o Meta SDK (Facebook) em tempo de execução,
 * somente após o usuário conceder consent (LGPD). No AndroidManifest as
 * flags AutoInit/AutoLog/AdvertiserID ficam "false"; este plugin é o
 * único caminho pelo qual o SDK passa a coletar dados e enviar eventos
 * ao Meta Ads (atribuição de install, conversions).
 *
 * O método {@code enable()} é idempotente: chamar múltiplas vezes não
 * causa efeito colateral — FacebookSdk.fullyInitialize() é seguro em
 * re-entrada, e activateApp() é um no-op se a sessão já está ativa.
 */
@CapacitorPlugin(name = "MetaSdk")
public class MetaSdkPlugin extends Plugin {

    @PluginMethod
    public void enable(PluginCall call) {
        try {
            FacebookSdk.setAutoInitEnabled(true);
            FacebookSdk.setAutoLogAppEventsEnabled(true);
            FacebookSdk.setAdvertiserIDCollectionEnabled(true);
            FacebookSdk.fullyInitialize();
            AppEventsLogger.activateApp(getActivity().getApplication());

            JSObject ret = new JSObject();
            ret.put("enabled", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Falha ao ativar Meta SDK", e);
        }
    }

    /**
     * Desativa o Meta SDK (revogação de consent). Não há API pública do
     * Facebook SDK para "desinicializar" totalmente dentro do mesmo processo
     * — desligamos as flags; o efeito pleno (parar de enviar eventos) só
     * garante-se após o próximo cold start do app. Documentado assim no
     * wrapper TS para não criar falsa sensação de desligamento imediato.
     */
    @PluginMethod
    public void disable(PluginCall call) {
        try {
            FacebookSdk.setAutoInitEnabled(false);
            FacebookSdk.setAutoLogAppEventsEnabled(false);
            FacebookSdk.setAdvertiserIDCollectionEnabled(false);

            JSObject ret = new JSObject();
            ret.put("enabled", false);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Falha ao desativar Meta SDK", e);
        }
    }
}
