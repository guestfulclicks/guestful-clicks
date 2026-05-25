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
import * as WebBrowser from 'expo-web-browser';
import {
  useFonts,
  PlayfairDisplay_400Regular,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import { supabase } from '../../supabase/client';

// Required for iOS to close the browser after redirect
WebBrowser.maybeCompleteAuthSession();

// ── Theme ──────────────────────────────────────────────────────────────────────

const THEME_STORAGE_KEY = '@guestful_onboarding_theme';

const THEMES: Record<string, { background: string; text: string }> = {
  midnight:      { background: '#0C0904', text: '#F0E8D5' },
  graphite:      { background: '#1A1A1A', text: '#FFFFFF' },
  navy:          { background: '#0D1B2A', text: '#E8F0FE' },
  forest:        { background: '#0D1F17', text: '#EAF5EE' },
  wine:          { background: '#1A0A0F', text: '#F5E8EC' },
  'deep-pink':   { background: '#3B1321', text: '#F5C8D8' },
  'burnt-orange':{ background: '#3D1C01', text: '#FFE0C0' },
};

const DEFAULT_THEME = THEMES.midnight;

// ── Sub-components ─────────────────────────────────────────────────────────────

function Logo({ color }: { color: string }) {
  return (
    <View style={styles.logoRow}>
      <View style={[styles.logoDot, { backgroundColor: color }]} />
      <Text style={[styles.logoText, { color }]}>Guestful Clicks</Text>
    </View>
  );
}

function GoogleG() {
  return (
    <View style={styles.googleG}>
      <Text style={styles.googleGText}>G</Text>
    </View>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

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

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((key) => {
      if (key && THEMES[key]) setTheme(THEMES[key]);
    });
  }, []);

  const handleGoogleSignIn = async () => {
    if (loading) return;
    setError(null);
    setLoading(true);

    try {
      const redirectUrl = 'guestfulclicks://auth/callback';

      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectUrl, skipBrowserRedirect: true },
      });

      if (oauthError) throw oauthError;
      if (!data.url) throw new Error('Could not generate sign-in URL.');

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

      if (result.type === 'success') {
        const callbackUrl = (result as any).url as string;
        const codeMatch = callbackUrl.match(/[?&]code=([^&\s#]+)/);
        if (codeMatch) {
          const { error: exchError } = await supabase.auth.exchangeCodeForSession(
            decodeURIComponent(codeMatch[1]),
          );
          if (exchError) throw exchError;
        } else if (callbackUrl.includes('access_token=')) {
          // Implicit flow fallback — tokens in hash fragment
          const hash = callbackUrl.includes('#') ? callbackUrl.split('#')[1] : '';
          const params = new URLSearchParams(hash);
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token') ?? '';
          if (accessToken) {
            const { error: sessErr } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (sessErr) throw sessErr;
          }
        }
        // onAuthStateChange in _layout.tsx handles navigation; reset loading so
        // the spinner doesn't stick if navigation is delayed by a DB round-trip
        setLoading(false);
        return;
      }

      // 'dismiss' on Android: custom tab closed because the deep link opened the app.
      // Wait up to 6s for _layout.tsx to finish exchangeCodeForSession.
      await new Promise<void>((resolve) => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
          if (event === 'SIGNED_IN') { subscription.unsubscribe(); resolve(); }
        });
        setTimeout(() => { subscription.unsubscribe(); resolve(); }, 6000);
      });

      // Always reset loading — navigation unmounts this screen if sign-in succeeded
      setLoading(false);
    } catch (e) {
      console.log('[Auth] Error:', e);
      setError(e instanceof Error ? e.message : 'Sign-in failed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle="light-content" />

      <View style={styles.logoWrap}>
        <Logo color={theme.text} />
      </View>

      <View style={styles.body}>
        <Text style={[styles.heading, { color: theme.text, fontFamily: serifBold }]}>
          Welcome to{'\n'}Guestful Clicks
        </Text>

        <Text style={[styles.subtext, { color: theme.text, fontFamily: serif }]}>
          Sign in to create and manage your events
        </Text>

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

        {error && (
          <Text style={[styles.errorText, { fontFamily: serif }]}>{error}</Text>
        )}

        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: theme.text }]} />
        </View>

        <Text style={[styles.qrHint, { color: theme.text, fontFamily: serif }]}>
          Joining an event? Scan the QR code from your invite instead.
        </Text>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

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

  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    height: 52,
    gap: 12,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 3 },
      android: { elevation: 2 },
    }),
  },
  googleBtnDisabled: { opacity: 0.7 },
  googleBtnText: {
    color: '#3C3C3C',
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0.2,
  },

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

  errorText: {
    color: '#FF6B6B',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 10,
  },

  dividerRow: {
    marginTop: 40,
    marginBottom: 20,
  },
  dividerLine: {
    height: StyleSheet.hairlineWidth,
    opacity: 0.18,
  },

  qrHint: {
    fontSize: 13,
    lineHeight: 20,
    opacity: 0.45,
    textAlign: 'center',
  },
});
