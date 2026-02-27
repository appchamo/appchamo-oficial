import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.chamo.app',
  appName: 'Chamô',
  webDir: 'dist',
  server: {
    iosScheme: 'https', 
    hostname: 'app.chamo.com',
    androidScheme: 'https',
    allowNavigation: [
      'wfxeiuqxzrlnvlopcrwd.supabase.co',
      '*.supabase.co',
      'accounts.google.com'
    ]
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    StatusBar: {
      // ✅ Deixamos o WebView gerenciar a cor para evitar barras estranhas no topo
      overlaysWebView: true,
      style: 'DEFAULT' 
    },
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true, 
      // 🚨 IMPORTANTE: Removendo o backgroundColor fixo aqui para ele 
      // não "atropelar" a configuração de Light/Dark nativa.
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      androidSplashResourceName: "splash",
      splashFullScreen: true,
      splashImmersive: true,
      // ✅ Permite que o fundo da splash acompanhe o tema do sistema
      useDialog: false 
    },
    Keyboard: {
      resize: 'native',
      style: 'DEFAULT',
      resizeOnFullScreen: true
    }
  }
};

export default config;