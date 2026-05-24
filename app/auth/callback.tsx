import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

// This screen exists solely to complete the OAuth session on iOS.
// expo-web-browser needs a screen at the redirect path to call
// maybeCompleteAuthSession() and close the browser.

WebBrowser.maybeCompleteAuthSession();

export default function AuthCallback() {
  return (
    <View style={{ flex: 1, backgroundColor: '#0C0904', justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color="#D4A853" />
    </View>
  );
}
