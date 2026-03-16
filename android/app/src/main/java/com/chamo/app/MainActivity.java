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
        // Atualiza o intent antes do super para o deep link (OAuth) ser processado pelo bridge
        setIntent(intent);
        super.onNewIntent(intent);
    }
}