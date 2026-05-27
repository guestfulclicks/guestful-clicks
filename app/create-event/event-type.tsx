import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StatusBar,
  Platform,
  Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  useFonts,
  PlayfairDisplay_400Regular,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import { supabase } from '../../supabase/client';
import { useCreateEvent } from '../../shared/CreateEventContext';
import type { UserRole } from '../../shared/types';

// ── Theme ──────────────────────────────────────────────────────────────────

const THEME_STORAGE_KEY = '@guestful_onboarding_theme';

const THEMES: Record<string, { background: string; text: string }> = {
  midnight:     { background: '#0C0904', text: '#F0E8D5' },
  graphite:     { background: '#1A1A1A', text: '#FFFFFF'  },
  navy:         { background: '#0D1B2A', text: '#E8F0FE' },
  forest:       { background: '#0D1F17', text: '#EAF5EE' },
  wine:         { background: '#1A0A0F', text: '#F5E8EC' },
  'deep-pink':  { background: '#3B1321', text: '#F5C8D8' },
  'burnt-orange': { background: '#3D1C01', text: '#FFE0C0' },
};

const DEFAULT_THEME = THEMES.midnight;

// ── Constants ──────────────────────────────────────────────────────────────

const GOLD = '#D4A853';
const GOLD_TINT = 'rgba(212,168,83,0.08)';
const CARD_SURFACE = 'rgba(255,255,255,0.05)';
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_GAP = 12;
const H_PAD = 24;
const CARD_WIDTH = (SCREEN_WIDTH - H_PAD * 2 - CARD_GAP) / 2;

// ── Event type definitions ─────────────────────────────────────────────────

interface EventTypeOption {
  key: string;
  icon: string;
  title: string;
}

const FALLBACK_HOST_TYPES: EventTypeOption[] = [
  { key: 'wedding',     icon: '💒', title: 'Wedding & Reception' },
  { key: 'birthday',    icon: '🎂', title: 'Birthday & Reunion' },
  { key: 'bachelor',    icon: '💍', title: 'Bachelor · Bachelorette' },
  { key: 'trip',        icon: '✈️', title: 'Group Trip & Retreat' },
  { key: 'offsite',     icon: '🏢', title: 'Team Offsite' },
  { key: 'celebration', icon: '🎉', title: 'Other Celebration' },
];

const FALLBACK_ORGANISER_TYPES: EventTypeOption[] = [
  { key: 'sports',    icon: '🏏', title: 'Sports Event' },
  { key: 'music',     icon: '🎵', title: 'Music Festival & Concert' },
  { key: 'cultural',  icon: '🎪', title: 'Cultural Festival' },
  { key: 'corporate', icon: '🏢', title: 'Corporate Event' },
  { key: 'college',   icon: '🎓', title: 'College & School Event' },
  { key: 'public',    icon: '📢', title: 'Other Public Event' },
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

export default function EventTypeScreen() {
  const { update } = useCreateEvent();

  const insets = useSafeAreaInsets();
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [role, setRole] = useState<UserRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [eventTypes, setEventTypes] = useState<EventTypeOption[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const [fontsLoaded] = useFonts({
    PlayfairDisplay_400Regular,
    PlayfairDisplay_700Bold,
  });

  const serif = fontsLoaded ? 'PlayfairDisplay_400Regular' : undefined;
  const serifBold = fontsLoaded ? 'PlayfairDisplay_700Bold' : undefined;

  // Load theme
  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((key) => {
      if (key && THEMES[key]) setTheme(THEMES[key]);
    });
  }, []);

  // Load user role + fetch event categories from Supabase
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: userData } = await supabase
          .from('users')
          .select('role, country_code, organiser_type')
          .eq('id', user.id)
          .single();

        const userRole = userData?.role as UserRole | undefined;
        const countryCode = userData?.country_code as string | undefined;
        const organiserType = userData?.organiser_type as string | undefined;
        if (userRole) setRole(userRole);

        // Travel agents skip the category grid entirely
        if (organiserType === 'travel_agent') {
          update({ isTravelAgent: true });
          setRoleLoading(false);
          router.replace('/create-event/travel-event');
          return;
        }

        const eventTypeFilter = userRole === 'organiser'
          ? ['public', 'both']
          : ['private', 'both'];

        const query = supabase
          .from('event_categories')
          .select('key, icon, title')
          .eq('is_active', true)
          .in('event_type', eventTypeFilter)
          .order('sort_order', { ascending: true });

        if (countryCode) {
          query.contains('country_codes', [countryCode]);
        }

        const { data: categories } = await query;

        const fallback = userRole === 'organiser' ? FALLBACK_ORGANISER_TYPES : FALLBACK_HOST_TYPES;
        setEventTypes(
          categories && categories.length > 0
            ? categories.map((c) => ({ key: c.key, icon: c.icon, title: c.title }))
            : fallback,
        );
      } catch {
        const fallback = role === 'organiser' ? FALLBACK_ORGANISER_TYPES : FALLBACK_HOST_TYPES;
        setEventTypes(fallback);
      } finally {
        setRoleLoading(false);
      }
    })();
  }, []);

  const handleContinue = () => {
    if (!selected) return;
    update({ eventCategory: selected });
    router.push('/create-event/event-name');
  };

  const renderCard = ({ item }: { item: EventTypeOption }) => {
    const isSelected = selected === item.key;
    return (
      <TouchableOpacity
        style={[
          styles.card,
          { width: CARD_WIDTH },
          {
            backgroundColor: isSelected ? GOLD_TINT : CARD_SURFACE,
            borderColor: isSelected ? GOLD : 'rgba(255,255,255,0.1)',
            borderWidth: isSelected ? 1.5 : 1,
          },
        ]}
        onPress={() => setSelected(item.key)}
        activeOpacity={0.8}
      >
        <Text style={styles.cardIcon}>{item.icon}</Text>
        <Text
          style={[
            styles.cardTitle,
            {
              color: isSelected ? GOLD : theme.text,
              fontFamily: serifBold,
            },
          ]}
        >
          {item.title}
        </Text>
      </TouchableOpacity>
    );
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
        <View style={styles.backBtn} />
      </View>

      {/* Body */}
      <View style={styles.body}>
        <Text style={[styles.heading, { color: theme.text, fontFamily: serifBold }]}>
          What's the occasion?
        </Text>
        <Text style={[styles.subtext, { color: theme.text, fontFamily: serif }]}>
          Choose the type of event you are creating.
        </Text>

        {/* Grid */}
        {roleLoading ? (
          <ActivityIndicator
            color={GOLD}
            size="large"
            style={styles.loader}
          />
        ) : (
          <FlatList
            data={eventTypes}
            keyExtractor={(item) => item.key}
            renderItem={renderCard}
            numColumns={2}
            columnWrapperStyle={styles.row}
            contentContainerStyle={styles.grid}
            showsVerticalScrollIndicator={false}
            scrollEnabled={false}
          />
        )}
      </View>

      {/* Continue button — pinned to bottom */}
      <View style={[styles.footer, { backgroundColor: theme.background, paddingBottom: insets.bottom + 24 }]}>
        <TouchableOpacity
          style={[
            styles.continueBtn,
            {
              backgroundColor: selected ? GOLD : 'rgba(255,255,255,0.08)',
              borderColor: selected ? GOLD : 'rgba(255,255,255,0.15)',
            },
          ]}
          onPress={handleContinue}
          disabled={!selected}
          activeOpacity={0.82}
        >
          <Text
            style={[
              styles.continueBtnText,
              {
                color: selected ? '#0C0904' : theme.text,
                fontFamily: serifBold,
                opacity: selected ? 1 : 0.4,
              },
            ]}
          >
            Continue
          </Text>
        </TouchableOpacity>
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
    paddingHorizontal: H_PAD,
    paddingTop: 32,
  },
  heading: {
    fontSize: 32,
    lineHeight: 42,
    letterSpacing: 0.2,
    marginBottom: 10,
  },
  subtext: {
    fontSize: 15,
    lineHeight: 24,
    opacity: 0.6,
    marginBottom: 28,
  },
  loader: {
    marginTop: 60,
  },

  // Grid
  grid: {
    gap: CARD_GAP,
    paddingBottom: 16,
  },
  row: {
    gap: CARD_GAP,
  },

  // Cards
  card: {
    borderRadius: 14,
    padding: 18,
    minHeight: 110,
    justifyContent: 'flex-end',
    gap: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 5,
      },
      android: { elevation: 3 },
    }),
  },
  cardIcon: {
    fontSize: 26,
  },
  cardTitle: {
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.1,
  },

  // Footer
  footer: {
    paddingHorizontal: H_PAD,
    paddingTop: 12,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  continueBtn: {
    height: 52,
    borderRadius: 4,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  continueBtnText: {
    fontSize: 14,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});
