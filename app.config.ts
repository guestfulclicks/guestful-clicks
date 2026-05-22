import { ExpoConfig, getDefaultConfig } from 'expo/config';

const config: ExpoConfig = {
  ...getDefaultConfig(__dirname),
  name: 'guestful-clicks',
  slug: 'guestful-clicks',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  scheme: 'guestfulclicks',
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  ios: {
    supportsTablet: true,
    associatedDomains: ['applinks:join.guestfulclicks.com'],
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#ffffff',
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
    [
      'expo-notifications',
      {
        color: '#D4A853',
      },
    ],
  ],
};

export default config;
