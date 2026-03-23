
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.linguacnc.app',
  appName: '灵语智造',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // iosScheme is useful for loading local assets correctly on iOS
    iosScheme: 'ionic' 
  },
  ios: {
    // Helps with status bar overlap issues
    contentInset: 'always',
    // Allows standard scrolling behavior
    scrollEnabled: true
  },
  plugins: {
    Keyboard: {
      resize: 'body',
      style: 'dark',
      resizeOnFullScreen: true
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#f5f5f7",
      showSpinner: true,
      spinnerColor: "#3b82f6"
    }
  }
};

export default config;
