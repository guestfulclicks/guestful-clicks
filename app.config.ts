import { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'CANDID Clicks',
  slug: 'candid-clicks',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  scheme: 'candidclicks',
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  ios: {
    bundleIdentifier: 'com.candidclicks.app',
    supportsTablet: true,
    associatedDomains: ['applinks:join.candidclicks.life'],
  },
  android: {
    package: 'com.candidclicks.app',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0C0904',
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          {
            scheme: 'https',
            host: 'join.candidclicks.life',
            pathPrefix: '/',
          },
          {
            scheme: 'candidclicks',
            host: 'join',
          },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-font',
    'expo-web-browser',
    [
      'expo-notifications',
      {
        color: '#D4A853',
      },
    ],
  ],
  extra: {
    eas: {
      projectId: '3a8bd998-025f-43aa-8cde-50a2e29bd682',
    },
  },
};

export default config;
