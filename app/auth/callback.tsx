import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

// Required for iOS to close the in-app browser after the OAuth redirect
WebBrowser.maybeCompleteAuthSession();

// The actual OAuth code exchange is handled in app/_layout.tsx via its
// always-mounted Linking listener, which avoids the race condition where
// the 'url' event fires before this screen has mounted.
export default function AuthCallback() {
  return (
    <View style={{ flex: 1, backgroundColor: '#0C0904', justifyContent: 'center', alignItems: 'center', gap: 16 }}>
      <ActivityIndicator size="large" color="#D4A853" />
      <Text style={{ color: '#D4A853', fontSize: 14 }}>Signing you in...</Text>
    </View>
  );
}
