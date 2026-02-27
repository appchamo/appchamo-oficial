package com.chamo.app;

import android.os.Bundle;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // ✅ Captura o Deep Link e envia para o WebView do Capacitor
        setIntent(intent);
    }
}