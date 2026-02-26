import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.chamo.app',
  appName: 'Chamô',
  webDir: 'dist',
  // ✅ Adicionado para estabilizar a origem e evitar o "flicker" (pisca-pisca)
  server: {
    iosScheme: 'chamoapp',
    hostname: 'app.chamo.com',
    androidScheme: 'https',
    allowNavigation: ['wfxeiuqxzrlnvlopcrwd.supabase.co']
  },
  plugins: {
    StatusBar: {
      overlaysWebView: false, // ✅ OBRIGA a WebView a ficar abaixo da barra
      style: 'LIGHT',
      backgroundColor: '#ffffff'
    },
    // ✅ Adicionado para controlar a tela de abertura e evitar o fundo branco
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: false, // ✅ Deixa o React esconder quando estiver pronto
      backgroundColor: "#ffffff",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true
    }
  }
};

export default config;