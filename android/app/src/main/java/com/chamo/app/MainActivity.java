package com.chamo.app;

import android.os.Bundle;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.BridgeActivity;
import com.facebook.FacebookSdk;
import com.facebook.appevents.AppEventsLogger;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Meta SDK: garante inicialização e dispara o evento de "app aberto"
        // que o Meta Ads usa para atribuir installs de campanhas de tráfego.
        FacebookSdk.sdkInitialize(getApplicationContext());
        AppEventsLogger.activateApp(getApplication());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        // Atualiza o intent antes do super para o deep link (OAuth) ser processado pelo bridge
        setIntent(intent);
        super.onNewIntent(intent);
    }
}