package com.chamo.app;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Por LGPD, o Meta SDK NÃO é inicializado no onCreate. As 3 flags
        // (AutoInit, AutoLog, AdvertiserID) estão "false" no AndroidManifest
        // e o SDK só é ativado via MetaSdkPlugin.enable(), chamado pelo JS
        // depois que o usuário aceita os Termos (accepted_terms_version).
        registerPlugin(MetaSdkPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        // Atualiza o intent antes do super para o deep link (OAuth) ser processado pelo bridge
        setIntent(intent);
        super.onNewIntent(intent);
    }
}
