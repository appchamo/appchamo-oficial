import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.chamo.app',
  appName: 'Chamô',
  webDir: 'dist',
  plugins: {
    StatusBar: {
      overlaysWebView: false, // OBRIGA a WebView a ficar abaixo da barra
      style: 'LIGHT',
      backgroundColor: '#ffffff'
    }
  }
};

export default config;