import React, { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '../../supabase/client';

// Required for iOS — signals openAuthSessionAsync that the browser can close
WebBrowser.maybeCompleteAuthSession();

export default function AuthCallback() {
  const { code } = useLocalSearchParams<{ code?: string }>();

  useEffect(() => {
    if (!code) return;

    const exchangeCode = async () => {
      try {
        // Guard: if google-login.tsx already exchanged (iOS success path), skip
        const { data: { session: existing } } = await supabase.auth.getSession();
        if (existing) return;

        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
        // onAuthStateChange SIGNED_IN in _layout.tsx handles navigation
      } catch (e) {
        console.log('[Callback] Exchange error:', e);
        router.replace('/auth/google-login');
      }
    };

    exchangeCode();
  }, [code]);

  return (
    <View style={{ flex: 1, backgroundColor: '#0C0904', justifyContent: 'center', alignItems: 'center', gap: 16 }}>
      <ActivityIndicator size="large" color="#D4A853" />
      <Text style={{ color: '#D4A853', fontSize: 14 }}>Signing you in...</Text>
    </View>
  );
}
