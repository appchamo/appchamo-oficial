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
      'accounts.google.com',
      'app.chamo.com',
      'appchamo.com'
    ]
  },
  ios: {
    allowsInlineMediaPlayback: true,
    backgroundColor: "#ffffff",
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    Badge: {
      persist: true,
      autoClear: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    StatusBar: {
      overlaysWebView: true,
      style: 'DEFAULT' 
    },
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: false, 
      // ✅ ALTERADO: CENTER faz o ícone ficar no tamanho real no centro
      androidScaleType: "CENTER", 
      showSpinner: false,
      androidSplashResourceName: "splash",
      splashFullScreen: true,
      splashImmersive: true,
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