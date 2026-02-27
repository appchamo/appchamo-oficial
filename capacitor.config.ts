import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.chamo.app',
  appName: 'Chamô',
  webDir: 'dist',
  server: {
    // Mantemos HTTPS para segurança e compatibilidade com Supabase
    iosScheme: 'https', 
    hostname: 'app.chamo.com',
    androidScheme: 'https',
    // Liberamos a navegação para o Supabase e Google para evitar o erro 102
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
      overlaysWebView: false,
      style: 'LIGHT',
      backgroundColor: '#ffffff'
    },
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: false, 
      backgroundColor: "#ffffff",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true
    },
    Keyboard: {
      resize: 'native',
      style: 'LIGHT',
      resizeOnFullScreen: true
    }
  }
};

export default config;