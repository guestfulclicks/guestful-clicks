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

// ── Constants ──────────────────────────────────────────────────────────────

const GOLD = '#D4A853';
const GOLD_TINT = 'rgba(212,168,83,0.08)';
// Cards sit slightly above the page background
const CARD_SURFACE = 'rgba(255,255,255,0.05)';
const CARD_SURFACE_SELECTED = GOLD_TINT;

type Role = 'host' | 'organiser';

interface RoleCard {
  role: Role;
  icon: string;
  title: string;
  subtitle: string;
}

const ROLE_CARDS: RoleCard[] = [
  {
    role: 'host',
    icon: '🏠',
    title: 'Private Host',
    subtitle:
      "I'm hosting a personal event — wedding, birthday, reunion, trip or celebration.",
  },
  {
    role: 'organiser',
    icon: '🎪',
    title: 'Event Organiser',
    subtitle:
      'I run public events — concerts, sports, festivals, corporate gatherings.',
  },
];

// ── Sub-components ─────────────────────────────────────────────────────────

function Logo({ color }: { color: string }) {
  return (
    <View style={styles.logoRow}>
      <View style={[styles.logoDot, { backgroundColor: color }]} />
      <Text style={[styles.logoText, { color }]}>Guestful Clicks</Text>
    </View>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function SelectRole() {
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [selected, setSelected] = useState<Role | null>(null);
  const [saving, setSaving] = useState(false);
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

  const handleSelectRole = async (card: RoleCard) => {
    if (saving) return;
    setSelected(card.role);
    setError(null);
    setSaving(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error('No authenticated user found.');

      const { error: updateError } = await supabase
        .from('users')
        .update({ role: card.role })
        .eq('id', user.id);

      if (updateError) throw updateError;

      if (card.role === 'organiser') {
        router.replace('/auth/organiser-signup');
      } else {
        router.replace('/create-event/event-type');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save role. Please try again.');
      setSaving(false);
      // Keep selection visible so user can retry
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={[styles.backArrow, { color: theme.text }]}>←</Text>
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Logo color={theme.text} />
        </View>

        {/* Spacer to balance back button */}
        <View style={styles.backBtn} />
      </View>

      {/* Body */}
      <View style={styles.body}>
        <Text style={[styles.heading, { color: theme.text, fontFamily: serifBold }]}>
          What brings you to{'\n'}Guestful Clicks?
        </Text>

        <Text style={[styles.subtext, { color: theme.text, fontFamily: serif }]}>
          Tell us how you'd like to use Guestful Clicks.
        </Text>

        {/* Role cards */}
        <View style={styles.cardsRow}>
          {ROLE_CARDS.map((card) => {
            const isSelected = selected === card.role;
            const isLoading = isSelected && saving;

            return (
              <TouchableOpacity
                key={card.role}
                style={[
                  styles.card,
                  {
                    backgroundColor: isSelected ? CARD_SURFACE_SELECTED : CARD_SURFACE,
                    borderColor: isSelected ? GOLD : 'rgba(255,255,255,0.1)',
                    borderWidth: isSelected ? 1.5 : 1,
                  },
                ]}
                onPress={() => handleSelectRole(card)}
                activeOpacity={0.8}
                disabled={saving}
              >
                {isLoading ? (
                  <ActivityIndicator
                    size="small"
                    color={GOLD}
                    style={styles.cardSpinner}
                  />
                ) : (
                  <>
                    <Text style={styles.cardIcon}>{card.icon}</Text>
                    <Text
                      style={[
                        styles.cardTitle,
                        {
                          color: isSelected ? GOLD : theme.text,
                          fontFamily: serifBold,
                        },
                      ]}
                    >
                      {card.title}
                    </Text>
                    <Text
                      style={[
                        styles.cardSubtitle,
                        { color: theme.text, fontFamily: serif },
                      ]}
                    >
                      {card.subtitle}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Error */}
        {error && (
          <Text style={[styles.errorText, { fontFamily: serif }]}>{error}</Text>
        )}
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 8,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  backBtn: {
    width: 32,
    alignItems: 'center',
  },
  backArrow: {
    fontSize: 22,
    lineHeight: 26,
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

  // Body
  body: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
  },

  heading: {
    fontSize: 30,
    lineHeight: 42,
    letterSpacing: 0.2,
    marginBottom: 12,
  },

  subtext: {
    fontSize: 15,
    lineHeight: 24,
    opacity: 0.6,
    marginBottom: 40,
  },

  // Cards
  cardsRow: {
    flexDirection: 'row',
    gap: 14,
  },
  card: {
    flex: 1,
    borderRadius: 14,
    padding: 20,
    minHeight: 200,
    justifyContent: 'flex-start',
    gap: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.18,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
    }),
  },
  cardSpinner: {
    flex: 1,
    alignSelf: 'center',
  },
  cardIcon: {
    fontSize: 28,
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 17,
    lineHeight: 24,
    letterSpacing: 0.2,
  },
  cardSubtitle: {
    fontSize: 13,
    lineHeight: 20,
    opacity: 0.65,
  },

  // Error
  errorText: {
    color: '#FF6B6B',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 20,
    textAlign: 'center',
  },
});
