import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import {
  useFonts,
  PlayfairDisplay_400Regular,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import {
  GoogleSignin,
  statusCodes,
  type NativeModuleError,
} from '@react-native-google-signin/google-signin';
import { supabase } from '../../supabase/client';

// ── Theme ──────────────────────────────────────────────────────────────────

const THEME_STORAGE_KEY = '@guestful_onboarding_theme';

const THEMES: Record<string, { background: string; text: string }> = {
  midnight: { background: '#0C0904', text: '#F0E8D5' },
  graphite: { background: '#1A1A1A', text: '#FFFFFF' },
  navy:     { background: '#0D1B2A', text: '#E8F0FE' },
  forest:   { background: '#0D1F17', text: '#EAF5EE' },
  wine:     { background: '#1A0A0F', text: '#F5E8EC' },
};

const DEFAULT_THEME = THEMES.midnight;

// ── Google config ──────────────────────────────────────────────────────────
// Replace WEB_CLIENT_ID with your Google Cloud OAuth 2.0 web client ID
// from https://console.cloud.google.com/apis/credentials
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '217626150651-pt6tptsl2i1mdt5sc8c0d4ekt31u0oh2.apps.googleusercontent.com';

// ── Helpers ────────────────────────────────────────────────────────────────

function isGoogleSignInError(e: unknown): e is NativeModuleError {
  return typeof e === 'object' && e !== null && 'code' in e;
}

function humaniseError(e: unknown): string {
  if (isGoogleSignInError(e)) {
    switch (e.code) {
      case statusCodes.SIGN_IN_CANCELLED:
        return 'Sign-in was cancelled.';
      case statusCodes.IN_PROGRESS:
        return 'Sign-in already in progress.';
      case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
        return 'Google Play Services not available on this device.';
      default:
        return `Google sign-in failed (${e.code}).`;
    }
  }
  if (e instanceof Error) return e.message;
  return 'Something went wrong. Please try again.';
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Logo({ color }: { color: string }) {
  return (
    <View style={styles.logoRow}>
      <View style={[styles.logoDot, { backgroundColor: color }]} />
      <Text style={[styles.logoText, { color }]}>Guestful Clicks</Text>
    </View>
  );
}

// Minimal Google "G" rendered purely with React Native primitives
function GoogleG() {
  return (
    <View style={styles.googleG}>
      <Text style={styles.googleGText}>G</Text>
    </View>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function GoogleLogin() {
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fontsLoaded] = useFonts({
    PlayfairDisplay_400Regular,
    PlayfairDisplay_700Bold,
  });

  const serif = fontsLoaded ? 'PlayfairDisplay_400Regular' : undefined;
  const serifBold = fontsLoaded ? 'PlayfairDisplay_700Bold' : undefined;

  // Load saved theme
  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((key) => {
      if (key && THEMES[key]) setTheme(THEMES[key]);
    });
  }, []);

  // Configure Google Sign-In once
  useEffect(() => {
    GoogleSignin.configure({
      webClientId: WEB_CLIENT_ID,
      scopes: ['profile', 'email'],
      offlineAccess: false,
    });
  }, []);

  const handleGoogleSignIn = async () => {
    if (loading) return;
    setError(null);
    setLoading(true);

    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      const response = await GoogleSignin.signIn();

      // v13+ returns { type, data } shape; older returns user directly
      const userInfo =
        'data' in response && response.data
          ? response.data
          : (response as any);

      const idToken: string | null =
        userInfo?.idToken ?? userInfo?.data?.idToken ?? null;

      if (!idToken) throw new Error('No ID token received from Google.');

      // ── Supabase auth ────────────────────────────────────────────────────
      const { error: authError } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });
      if (authError) throw authError;

      // ── Get the current Supabase session user ────────────────────────────
      const {
        data: { user: sbUser },
      } = await supabase.auth.getUser();
      if (!sbUser) throw new Error('Could not retrieve authenticated user.');

      // ── Upsert into custom users table ───────────────────────────────────
      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('id', sbUser.id)
        .single();

      if (!existing) {
        const { error: insertError } = await supabase.from('users').insert({
          id: sbUser.id,
          full_name:
            userInfo?.user?.name ??
            sbUser.user_metadata?.full_name ??
            '',
          email: sbUser.email ?? '',
          // role assigned on next screen
        });
        if (insertError) throw insertError;
      }

      router.replace('/auth/select-role');
    } catch (e) {
      setError(humaniseError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle="light-content" />

      {/* Logo */}
      <View style={styles.logoWrap}>
        <Logo color={theme.text} />
      </View>

      {/* Body */}
      <View style={styles.body}>
        <Text style={[styles.heading, { color: theme.text, fontFamily: serifBold }]}>
          Welcome to{'\n'}Guestful Clicks
        </Text>

        <Text style={[styles.subtext, { color: theme.text, fontFamily: serif }]}>
          Sign in to create and manage your events
        </Text>

        {/* Google button */}
        <TouchableOpacity
          style={[styles.googleBtn, loading && styles.googleBtnDisabled]}
          onPress={handleGoogleSignIn}
          activeOpacity={0.85}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#4285F4" />
          ) : (
            <>
              <GoogleG />
              <Text style={[styles.googleBtnText, { fontFamily: serif }]}>
                Continue with Google
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* Error message */}
        {error && (
          <Text style={[styles.errorText, { fontFamily: serif }]}>{error}</Text>
        )}

        {/* Divider */}
        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: theme.text }]} />
        </View>

        {/* QR hint */}
        <Text style={[styles.qrHint, { color: theme.text, fontFamily: serif }]}>
          Joining an event? Scan the QR code from your invite instead.
        </Text>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  logoWrap: {
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: 8,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  logoDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  logoText: {
    fontSize: 13,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },

  body: {
    flex: 1,
    paddingHorizontal: 32,
    justifyContent: 'center',
    gap: 0,
    paddingBottom: 48,
  },

  heading: {
    fontSize: 34,
    lineHeight: 44,
    letterSpacing: 0.2,
    marginBottom: 14,
  },

  subtext: {
    fontSize: 15,
    lineHeight: 24,
    opacity: 0.65,
    marginBottom: 44,
  },

  // Google button
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    height: 52,
    gap: 12,
    // shadow
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.12,
        shadowRadius: 3,
      },
      android: { elevation: 2 },
    }),
  },
  googleBtnDisabled: {
    opacity: 0.7,
  },
  googleBtnText: {
    color: '#3C3C3C',
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0.2,
  },

  // Google "G" mark
  googleG: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  googleGText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#4285F4',
    lineHeight: 20,
    includeFontPadding: false,
  },

  // Error
  errorText: {
    color: '#FF6B6B',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 10,
  },

  // Divider
  dividerRow: {
    marginTop: 40,
    marginBottom: 20,
  },
  dividerLine: {
    height: StyleSheet.hairlineWidth,
    opacity: 0.18,
  },

  // QR hint
  qrHint: {
    fontSize: 13,
    lineHeight: 20,
    opacity: 0.45,
    textAlign: 'center',
  },
});
