import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.chamo.app',
  appName: 'Chamô',
  webDir: 'dist',
  server: {
    // ✅ Alterado para 'https' para permitir que o Supabase salve cookies/sessão com segurança
    iosScheme: 'https', 
    hostname: 'app.chamo.com',
    androidScheme: 'https',
    // ✅ Adicionado o domínio do Supabase para garantir que o app tenha permissão de rede
    allowNavigation: [
      'wfxeiuqxzrlnvlopcrwd.supabase.co',
      '*.supabase.co'
    ]
  },
  plugins: {
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
    // ✅ Adicionado para garantir que o teclado não quebre o layout no login
    Keyboard: {
      resize: 'native',
      style: 'LIGHT',
      resizeOnFullScreen: true
    }
  }
};

export default config;