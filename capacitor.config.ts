import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.loopstation',
  appName: 'LoopStation',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
