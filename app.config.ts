import { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'guestful-clicks',
  slug: 'guestful-clicks',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  newArchEnabled: false,
  scheme: 'guestfulclicks',
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  ios: {
    bundleIdentifier: 'com.guestfulclicks.app',
    supportsTablet: true,
    associatedDomains: ['applinks:join.guestfulclicks.com'],
  },
  android: {
    package: 'com.guestfulclicks.app',
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
            host: 'join.guestfulclicks.com',
            pathPrefix: '/',
          },
          {
            scheme: 'guestfulclicks',
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
