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
  PlayfairDisplay_400Regular_Italic,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import {
  useFonts as useMonoFonts,
  DMMono_400Regular,
} from '@expo-google-fonts/dm-mono';

// ── Types ──────────────────────────────────────────────────────────────────

type ThemeKey = 'midnight' | 'graphite' | 'navy' | 'forest' | 'wine' | 'deep-pink' | 'burnt-orange';

interface Theme {
  key: ThemeKey;
  label: string;
  background: string;
  text: string;
  accent: string;
}

interface Slide {
  id: string;
  body: string;
  heading?: string;
  isLast?: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────

const THEME_STORAGE_KEY = '@candid_onboarding_theme';
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const FILM_H = 52;
const HOLE_COUNT = 9;

const THEMES: Theme[] = [
  { key: 'midnight',     label: 'Midnight',     background: '#0C0904', text: '#F0E8D5', accent: '#D4A853' },
  { key: 'graphite',     label: 'Graphite',     background: '#1A1A1A', text: '#FFFFFF',  accent: '#C0C0C0' },
  { key: 'navy',         label: 'Navy',         background: '#0D1B2A', text: '#E8F0FE', accent: '#4A90D9' },
  { key: 'forest',       label: 'Forest',       background: '#0D1F17', text: '#EAF5EE', accent: '#4CAF50' },
  { key: 'wine',         label: 'Wine',         background: '#1A0A0F', text: '#F5E8EC', accent: '#C0415A' },
  { key: 'deep-pink',    label: 'Deep Pink',    background: '#3B1321', text: '#F5C8D8', accent: '#C20458' },
  { key: 'burnt-orange', label: 'Burnt Orange', background: '#3D1C01', text: '#FFE0C0', accent: '#E05B02' },
];

const SLIDES: Slide[] = [
  {
    id: 's1',
    body: "Life's most wonderful moments are always candid.\nThe ones nobody planned, nobody posed for — just lived.",
  },
  {
    id: 's2',
    body: "Every guest gets to be a CANDID Clicker. Because if you were invited, you matter. If you showed up, you're part of the story. CANDID Clicks makes sure your perspective is never missing from the moments that matter most.",
  },
  {
    id: 's3',
    body: "Every laugh, every tear, every toast —\nseen through the eyes of\neveryone you love.",
  },
  {
    id: 's4',
    heading: "Cheerful memories, made Candid.",
    body: 'Every angle.\nEvery guest.\nOne gallery.',
    isLast: true,
  },
];

// ── Film strip border ──────────────────────────────────────────────────────

function FilmStrip({ holeColor }: { holeColor: string }) {
  return (
    <View style={fs.strip}>
      <View style={fs.holes}>
        {Array.from({ length: HOLE_COUNT }).map((_, i) => (
          <View key={i} style={[fs.hole, { backgroundColor: holeColor }]} />
        ))}
      </View>
    </View>
  );
}

const fs = StyleSheet.create({
  strip: { height: FILM_H, backgroundColor: '#0A0806', justifyContent: 'center' },
  holes: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', paddingHorizontal: 4 },
  hole: { width: 14, height: 20, borderRadius: 4 },
});

// ── Logo ───────────────────────────────────────────────────────────────────

function Logo({ color }: { color: string }) {
  return (
    <View style={styles.logoRow}>
      <View style={[styles.logoDot, { backgroundColor: color }]} />
      <Text style={[styles.logoText, { color }]}>CANDID Clicks</Text>
    </View>
  );
}

// ── Palette icon ───────────────────────────────────────────────────────────

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

  const [playfairLoaded] = useFonts({
    PlayfairDisplay_400Regular,
    PlayfairDisplay_400Regular_Italic,
    PlayfairDisplay_700Bold,
  });
  const [monoLoaded] = useMonoFonts({ DMMono_400Regular });

  const fontsLoaded = playfairLoaded && monoLoaded;
  const serif       = fontsLoaded ? 'PlayfairDisplay_400Regular'        : undefined;
  const serifItalic = fontsLoaded ? 'PlayfairDisplay_400Regular_Italic' : undefined;
  const serifBold   = fontsLoaded ? 'PlayfairDisplay_700Bold'           : undefined;
  const mono        = fontsLoaded ? 'DMMono_400Regular'                 : undefined;

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

  const renderSlide = ({ item, index }: { item: Slide; index: number }) => (
    <View style={[styles.slideOuter, { width: SCREEN_WIDTH, backgroundColor: theme.background }]}>
      {/* Top film strip */}
      <FilmStrip holeColor={theme.background} />

      {/* Content area between strips */}
      <View style={styles.slideContent}>
        <Text style={[styles.frameNumber, { fontFamily: mono }]}>
          CANDID — 0{index + 1}
        </Text>

        <View style={styles.slideMain}>
          {item.heading && (
            <Text style={[styles.slideHeading, { fontFamily: serifItalic }]}>
              {item.heading}
            </Text>
          )}
          <Text style={[styles.slideBody, { color: theme.text, fontFamily: item.isLast ? serifBold : serif }]}>
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

        <Text style={[styles.filmLabel, { fontFamily: mono }]}>CANDID CLICKS</Text>
      </View>

      {/* Bottom film strip */}
      <FilmStrip holeColor={theme.background} />

      {/* Antique sepia overlay */}
      <View style={styles.sepiaOverlay} pointerEvents="none" />

      {/* Vignette */}
      <View style={styles.vignetteOverlay} pointerEvents="none" />
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle="light-content" />

      {/* Header — above film strip */}
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
              { backgroundColor: theme.text, opacity: i === activeIndex ? 1 : 0.28, width: i === activeIndex ? 22 : 7 },
            ]}
          />
        ))}
      </View>

      {/* Theme picker */}
      <Modal
        visible={paletteOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPaletteOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setPaletteOpen(false)}>
          <Pressable style={[styles.panel, { backgroundColor: theme.background }]}>
            <View style={[styles.panelHandle, { backgroundColor: theme.text }]} />
            <Text style={[styles.panelTitle, { color: theme.text, fontFamily: serif }]}>
              Choose Theme
            </Text>
            {THEMES.map((t) => (
              <TouchableOpacity key={t.key} style={styles.themeRow} onPress={() => selectTheme(t)} activeOpacity={0.7}>
                <View style={[styles.swatch, { backgroundColor: t.background }]}>
                  <View style={[styles.accentDot, { backgroundColor: t.accent }]} />
                  {t.key === theme.key && <View style={styles.swatchTick} />}
                </View>
                <Text style={[styles.themeLabel, { color: theme.text, fontFamily: serif }]}>{t.label}</Text>
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
  container: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 56, paddingBottom: 8 },
  headerCenter: { flex: 1, alignItems: 'center' },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  logoDot: { width: 7, height: 7, borderRadius: 4 },
  logoText: { fontSize: 13, letterSpacing: 1.6, textTransform: 'uppercase' },
  paletteBtn: { position: 'absolute', right: 24, top: 56, padding: 4 },
  paletteRing: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, position: 'relative' },
  pd: { position: 'absolute', width: 4, height: 4, borderRadius: 2 },

  flatList: { flex: 1 },
  slideOuter: { flex: 1 },

  slideContent: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 10,
    paddingBottom: 10,
  },
  frameNumber: {
    fontSize: 9,
    color: 'rgba(212,168,83,0.6)',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  slideMain: {
    flex: 1,
    justifyContent: 'center',
    gap: 16,
  },
  slideHeading: {
    fontSize: 28,
    color: '#D4A853',
    lineHeight: 38,
    letterSpacing: 0.2,
  },
  slideBody: {
    fontSize: 20,
    lineHeight: 34,
    letterSpacing: 0.3,
  },
  filmLabel: {
    fontSize: 8,
    color: 'rgba(212,168,83,0.4)',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    textAlign: 'right',
    marginTop: 4,
  },

  getStartedBtn: {
    borderWidth: 1,
    borderRadius: 2,
    paddingVertical: 14,
    paddingHorizontal: 36,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  getStartedText: { fontSize: 13, letterSpacing: 2.2, textTransform: 'uppercase' },

  sepiaOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(180,120,40,0.10)' },
  vignetteOverlay: { ...StyleSheet.absoluteFillObject, borderWidth: 48, borderColor: 'rgba(0,0,0,0.22)' },

  dotsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingBottom: 50 },
  dot: { height: 7, borderRadius: 4 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  panel: { borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 28, paddingTop: 14, paddingBottom: 44, gap: 4 },
  panelHandle: { width: 36, height: 3, borderRadius: 2, alignSelf: 'center', marginBottom: 18, opacity: 0.3 },
  panelTitle: { fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.5, marginBottom: 8 },
  themeRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 10 },
  swatch: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  accentDot: { width: 10, height: 10, borderRadius: 5, position: 'absolute', bottom: 3, right: 3 },
  swatchTick: { width: 11, height: 11, borderRadius: 6, backgroundColor: '#FFFFFF', opacity: 0.9 },
  themeLabel: { fontSize: 16, letterSpacing: 0.4 },
});
