import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  FlatList,
  TouchableOpacity,
  Modal,
  Pressable,
  StatusBar,
  ViewToken,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import {
  useFonts,
  PlayfairDisplay_400Regular,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';

// ── Types ──────────────────────────────────────────────────────────────────

type ThemeKey = 'midnight' | 'graphite' | 'navy' | 'forest' | 'wine';

interface Theme {
  key: ThemeKey;
  label: string;
  background: string;
  text: string;
}

interface Slide {
  id: string;
  body: string;
  isLast?: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────

const THEME_STORAGE_KEY = '@guestful_onboarding_theme';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

const THEMES: Theme[] = [
  { key: 'midnight', label: 'Midnight', background: '#0C0904', text: '#F0E8D5' },
  { key: 'graphite', label: 'Graphite', background: '#1A1A1A', text: '#FFFFFF' },
  { key: 'navy',     label: 'Navy',     background: '#0D1B2A', text: '#E8F0FE' },
  { key: 'forest',   label: 'Forest',   background: '#0D1F17', text: '#EAF5EE' },
  { key: 'wine',     label: 'Wine',     background: '#1A0A0F', text: '#F5E8EC' },
];

const SLIDES: Slide[] = [
  {
    id: 's1',
    body: "Life's most wonderful moments are always candid.\nThe ones nobody planned, nobody posed for — just lived.",
  },
  {
    id: 's2',
    body: "Every guest gets to be a Guest-Full Clicker. Because if you were invited, you matter. If you showed up, you're part of the story. Guestful makes sure your perspective is never missing from the moments that matter most.",
  },
  {
    id: 's3',
    body: 'Every angle.\nEvery guest.\nOne gallery.',
    isLast: true,
  },
];

// ── Logo ───────────────────────────────────────────────────────────────────

function Logo({ color }: { color: string }) {
  return (
    <View style={styles.logoRow}>
      <View style={[styles.logoDot, { backgroundColor: color }]} />
      <Text style={[styles.logoText, { color }]}>Guestful Clicks</Text>
    </View>
  );
}

// ── Palette icon (hand-drawn circle with colour dots) ──────────────────────

function PaletteIcon({ color }: { color: string }) {
  return (
    <View style={[styles.paletteRing, { borderColor: color }]}>
      <View style={[styles.pd, { backgroundColor: color, top: 3, left: 5 }]} />
      <View style={[styles.pd, { backgroundColor: color, top: 3, right: 5 }]} />
      <View style={[styles.pd, { backgroundColor: color, bottom: 4, left: 2 }]} />
      <View style={[styles.pd, { backgroundColor: color, bottom: 4, right: 2 }]} />
      <View style={[styles.pd, { backgroundColor: color, bottom: 4, alignSelf: 'center' }]} />
    </View>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function OnboardingSlides() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [theme, setTheme] = useState<Theme>(THEMES[0]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const [fontsLoaded] = useFonts({
    PlayfairDisplay_400Regular,
    PlayfairDisplay_700Bold,
  });

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((saved) => {
      if (saved) {
        const found = THEMES.find((t) => t.key === saved);
        if (found) setTheme(found);
      }
    });
  }, []);

  const selectTheme = useCallback(async (t: Theme) => {
    setTheme(t);
    setPaletteOpen(false);
    await AsyncStorage.setItem(THEME_STORAGE_KEY, t.key);
  }, []);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    }
  ).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const serif = fontsLoaded ? 'PlayfairDisplay_400Regular' : undefined;
  const serifBold = fontsLoaded ? 'PlayfairDisplay_700Bold' : undefined;

  const renderSlide = ({ item }: { item: Slide }) => (
    <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
      <Text
        style={[
          styles.slideBody,
          { color: theme.text, fontFamily: item.isLast ? serifBold : serif },
        ]}
      >
        {item.body}
      </Text>

      {item.isLast && (
        <TouchableOpacity
          style={[styles.getStartedBtn, { borderColor: theme.text }]}
          onPress={() => router.replace('/auth/google-login')}
          activeOpacity={0.75}
        >
          <Text style={[styles.getStartedText, { color: theme.text, fontFamily: serif }]}>
            Get Started
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle="light-content" />

      {/* Header: logo centre + palette top-right */}
      <View style={styles.header}>
        <View style={styles.headerCenter}>
          <Logo color={theme.text} />
        </View>
        <TouchableOpacity
          style={styles.paletteBtn}
          onPress={() => setPaletteOpen(true)}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <PaletteIcon color={theme.text} />
        </TouchableOpacity>
      </View>

      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        keyExtractor={(item) => item.id}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        style={styles.flatList}
      />

      {/* Progress dots */}
      <View style={styles.dotsRow}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: theme.text,
                opacity: i === activeIndex ? 1 : 0.28,
                width: i === activeIndex ? 22 : 7,
              },
            ]}
          />
        ))}
      </View>

      {/* Theme picker bottom sheet */}
      <Modal
        visible={paletteOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPaletteOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setPaletteOpen(false)}>
          {/* Stop tap inside panel from closing */}
          <Pressable style={[styles.panel, { backgroundColor: theme.background }]}>
            <View style={[styles.panelHandle, { backgroundColor: theme.text }]} />
            <Text style={[styles.panelTitle, { color: theme.text, fontFamily: serif }]}>
              Choose Theme
            </Text>
            {THEMES.map((t) => (
              <TouchableOpacity
                key={t.key}
                style={styles.themeRow}
                onPress={() => selectTheme(t)}
                activeOpacity={0.7}
              >
                <View style={[styles.swatch, { backgroundColor: t.background }]}>
                  {t.key === theme.key && (
                    <View style={styles.swatchTick} />
                  )}
                </View>
                <Text style={[styles.themeLabel, { color: theme.text, fontFamily: serif }]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
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
  paletteBtn: {
    padding: 4,
    position: 'absolute',
    right: 24,
    top: 56,
  },

  // Palette icon
  paletteRing: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    position: 'relative',
  },
  pd: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
  },

  // Slides
  flatList: {
    flex: 1,
  },
  slide: {
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 32,
    justifyContent: 'center',
    gap: 44,
  },
  slideBody: {
    fontSize: 22,
    lineHeight: 36,
    letterSpacing: 0.3,
  },

  // Get Started button
  getStartedBtn: {
    borderWidth: 1,
    borderRadius: 2,
    paddingVertical: 14,
    paddingHorizontal: 36,
    alignSelf: 'flex-start',
  },
  getStartedText: {
    fontSize: 13,
    letterSpacing: 2.2,
    textTransform: 'uppercase',
  },

  // Dots
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 50,
  },
  dot: {
    height: 7,
    borderRadius: 4,
  },

  // Modal
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  panel: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 28,
    paddingTop: 14,
    paddingBottom: 44,
    gap: 4,
  },
  panelHandle: {
    width: 36,
    height: 3,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 18,
    opacity: 0.3,
  },
  panelTitle: {
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    opacity: 0.5,
    marginBottom: 8,
  },
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 10,
  },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  swatchTick: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    opacity: 0.9,
  },
  themeLabel: {
    fontSize: 16,
    letterSpacing: 0.4,
  },
});
