import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import {
  useFonts,
  PlayfairDisplay_400Regular,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import { supabase } from '../../supabase/client';
import { useCreateEvent } from '../../shared/CreateEventContext';

// ── Theme ──────────────────────────────────────────────────────────────────

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

const GOLD = '#D4A853';
const GOLD_TINT = 'rgba(212,168,83,0.08)';
const INPUT_SURFACE = 'rgba(255,255,255,0.08)';
const MAX_CHARS = 50;
const H_PAD = 24;

// ── Suggestions ────────────────────────────────────────────────────────────

function buildSuggestions(category: string, firstName: string): string[] {
  const name = firstName || 'Your';

  const map: Record<string, string[]> = {
    wedding: [
      `${name}'s Wedding Day`,
      `${name} & Partner's Big Day`,
      'Our Wedding Day',
      `The ${name} Wedding`,
      'Forever Starts Today',
    ],
    birthday: [
      `${name}'s Birthday`,
      `${name}'s Big Day`,
      `Cheers to ${name}`,
      `Happy Birthday, ${name}!`,
      `${name} Turns the Page`,
    ],
    bachelor: [
      `${name}'s Last Adventure`,
      'One Last Hurrah',
      `Farewell to Freedom — ${name}`,
      'The Pre-Wedding Bash',
    ],
    trip: [
      `${name}'s Group Adventure`,
      'The Great Escape',
      'Roads, Views & Good Company',
      'Our Trip Together',
    ],
    offsite: [
      'Team Day Out',
      'The Annual Offsite',
      `${name}'s Team Retreat`,
      'Work Hard, Celebrate Harder',
    ],
    celebration: [
      `${name}'s Celebration`,
      'A Night to Remember',
      'Our Big Moment',
      `Cheers to ${name}`,
    ],
    sports: [
      'The Big Match',
      'Game Day',
      'Our Stadium Moments',
      'The Final Whistle',
      'From the Stands',
    ],
    music: [
      'The Festival Film',
      'Lights, Music, Clicks',
      'Our Night at the Show',
      'Sound & Vision',
      'We Were There',
    ],
    cultural: [
      'A Festival to Remember',
      'The Culture Reel',
      'Colours & Moments',
      'Our Festival Story',
    ],
    corporate: [
      'The Annual Gathering',
      `${name}'s Corporate Day`,
      'Moments from the Floor',
      'Our Company Story',
    ],
    college: [
      'Campus Moments',
      'The College Reel',
      `${name}'s Batch Film`,
      'Our School Day',
      'Years to Remember',
    ],
    public: [
      'The Public Film',
      'Captured by the Crowd',
      'Everyone Was There',
      'A Day in the City',
    ],
  };

  return (map[category] ?? ['My Guestful Event', 'An Event to Remember']).slice(0, 5);
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

// Minimal pencil icon using text character
function PencilIcon({ color }: { color: string }) {
  return <Text style={[styles.pencilIcon, { color }]}>✏</Text>;
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function EventNameScreen() {
  const { draft, update } = useCreateEvent();

  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [value, setValue] = useState('');
  const [firstName, setFirstName] = useState('');

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

  // Load user first name from Supabase session
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      const fullName: string =
        user.user_metadata?.full_name ??
        user.user_metadata?.name ??
        '';
      setFirstName(fullName.split(' ')[0] ?? '');
    });
  }, []);

  const suggestions = useMemo(
    () => buildSuggestions(draft.eventCategory, firstName),
    [draft.eventCategory, firstName],
  );

  const canContinue = value.trim().length >= 3;

  const handleChange = (text: string) => {
    if (text.length <= MAX_CHARS) setValue(text);
  };

  const handleNext = () => {
    if (!canContinue) return;
    update({ eventName: value.trim() });
    router.push('/create-event/event-date');
  };

  // Derived input border colour
  const inputBorderColor =
    value.length > 0 ? GOLD : 'rgba(255,255,255,0.12)';

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
    >
      <StatusBar barStyle="light-content" />

      {/* Header — outside scroll so it never moves */}
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

      {/* Scrollable body */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.heading, { color: theme.text, fontFamily: serifBold }]}>
          What is the name of{'\n'}your event?
        </Text>
        <Text style={[styles.subtext, { color: theme.text, fontFamily: serif }]}>
          Choose the perfect title for your film. This title will be visible to all your
          guests.
        </Text>

        {/* Input */}
        <View
          style={[
            styles.inputWrap,
            {
              backgroundColor: INPUT_SURFACE,
              borderColor: inputBorderColor,
            },
          ]}
        >
          <PencilIcon color={value.length > 0 ? GOLD : `${theme.text}66`} />
          <TextInput
            style={[styles.input, { color: theme.text, fontFamily: serif }]}
            placeholder="Enter your film title"
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={value}
            onChangeText={handleChange}
            maxLength={MAX_CHARS}
            returnKeyType="done"
            onSubmitEditing={handleNext}
            autoCorrect={false}
            autoCapitalize="words"
          />
        </View>

        {/* Character counter */}
        <View style={styles.counterRow}>
          <Text style={[styles.counter, { color: theme.text, fontFamily: serif }]}>
            {value.length} / {MAX_CHARS}
          </Text>
        </View>

        {/* Suggestions */}
        <Text style={[styles.suggestionsLabel, { color: theme.text, fontFamily: serif }]}>
          SUGGESTIONS
        </Text>
        <View style={styles.pillsWrap}>
          {suggestions.map((s) => {
            const isActive = value === s;
            return (
              <TouchableOpacity
                key={s}
                style={[
                  styles.pill,
                  {
                    backgroundColor: isActive ? GOLD_TINT : 'rgba(255,255,255,0.05)',
                    borderColor: isActive ? GOLD : 'rgba(255,255,255,0.14)',
                  },
                ]}
                onPress={() => setValue(s.slice(0, MAX_CHARS))}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.pillText,
                    { color: isActive ? GOLD : theme.text, fontFamily: serif },
                  ]}
                >
                  {s}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Next button — pinned above keyboard */}
      <View style={[styles.footer, { backgroundColor: theme.background }]}>
        <View style={styles.footerInner}>
          <Text style={[styles.footerHint, { color: theme.text, fontFamily: serif }]}>
            {canContinue ? `"${value.trim()}"` : 'At least 3 characters'}
          </Text>
          <TouchableOpacity
            style={[
              styles.nextBtn,
              {
                backgroundColor: canContinue ? GOLD : 'rgba(255,255,255,0.06)',
                borderColor: canContinue ? GOLD : 'rgba(255,255,255,0.12)',
              },
            ]}
            onPress={handleNext}
            disabled={!canContinue}
            activeOpacity={0.82}
          >
            <Text
              style={[
                styles.nextBtnText,
                {
                  color: canContinue ? '#0C0904' : theme.text,
                  fontFamily: serifBold,
                  opacity: canContinue ? 1 : 0.35,
                },
              ]}
            >
              Next →
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: H_PAD,
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

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: H_PAD,
    paddingTop: 32,
    paddingBottom: 24,
  },

  heading: {
    fontSize: 32,
    lineHeight: 44,
    letterSpacing: 0.2,
    marginBottom: 12,
  },
  subtext: {
    fontSize: 15,
    lineHeight: 24,
    opacity: 0.6,
    marginBottom: 32,
  },

  // Input
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    height: 56,
    gap: 10,
  },
  pencilIcon: {
    fontSize: 16,
    lineHeight: 20,
  },
  input: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    paddingVertical: 0,
  },

  // Counter
  counterRow: {
    alignItems: 'flex-end',
    marginTop: 6,
    marginBottom: 28,
  },
  counter: {
    fontSize: 12,
    letterSpacing: 0.5,
    opacity: 0.4,
  },

  // Suggestions
  suggestionsLabel: {
    fontSize: 10,
    letterSpacing: 2,
    opacity: 0.4,
    marginBottom: 12,
  },
  pillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  pill: {
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  pillText: {
    fontSize: 13,
    lineHeight: 18,
  },

  // Footer
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: H_PAD,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  footerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  footerHint: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.45,
    fontStyle: 'italic',
  },
  nextBtn: {
    height: 48,
    paddingHorizontal: 28,
    borderRadius: 4,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nextBtnText: {
    fontSize: 14,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
});
