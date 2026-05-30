import React, { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  useFonts,
  PlayfairDisplay_400Regular,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import { useCreateEvent } from '../../shared/CreateEventContext';

// ── Theme ──────────────────────────────────────────────────────────────────

const THEME_KEY = '@candid_onboarding_theme';
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
const H_PAD = 24;
const CARD_GAP = 14;
const { width: SCREEN_W } = Dimensions.get('window');
// Card takes most of the screen width, peeking the next card on the right
const CARD_W = SCREEN_W - H_PAD * 2 - CARD_GAP * 0.5;
const PREVIEW_H = CARD_W * 0.72;

// ── Aesthetic definitions ──────────────────────────────────────────────────

type AestheticKey = 'original' | 'film' | 'noir';

interface Aesthetic {
  key: AestheticKey;
  icon: string;
  title: string;
  description: string;
  preview: React.ReactNode;
}

// ── Preview renderers — pure colour geometry, no images ───────────────────

function OriginalPreview() {
  return (
    <View style={[pv.wrap, { backgroundColor: '#2A2A2A' }]}>
      {/* Sky block */}
      <View style={[pv.band, { backgroundColor: '#5B9BD5', flex: 2.5 }]} />
      {/* Midground */}
      <View style={[pv.band, { backgroundColor: '#4A7C59', flex: 1.2 }]} />
      {/* Ground */}
      <View style={[pv.band, { backgroundColor: '#7B5E3A', flex: 0.8 }]} />
      {/* Overlay shapes — people silhouettes */}
      <View style={[pv.sil, { bottom: 18, left: '25%', width: 18, height: 46, backgroundColor: '#2B3E28' }]} />
      <View style={[pv.sil, { bottom: 18, left: '42%', width: 14, height: 38, backgroundColor: '#2B3E28' }]} />
      <View style={[pv.sil, { bottom: 18, right: '22%', width: 20, height: 52, backgroundColor: '#2B3E28' }]} />
      {/* Sun */}
      <View style={[pv.circle, { top: 18, right: 24, width: 28, height: 28, borderRadius: 14, backgroundColor: '#F9D96C' }]} />
      {/* Depth overlay */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.08)' }]} />
      {/* Label chip */}
      <View style={pv.chip}><Text style={pv.chipText}>True Colour</Text></View>
    </View>
  );
}

function FilmPreview() {
  return (
    <View style={[pv.wrap, { backgroundColor: '#2A2218' }]}>
      {/* Sepia sky */}
      <View style={[pv.band, { backgroundColor: '#A87E52', flex: 2.5 }]} />
      {/* Warm midground */}
      <View style={[pv.band, { backgroundColor: '#7A5C35', flex: 1.2 }]} />
      {/* Warm ground */}
      <View style={[pv.band, { backgroundColor: '#5C3E22', flex: 0.8 }]} />
      {/* Silhouettes warm-toned */}
      <View style={[pv.sil, { bottom: 18, left: '25%', width: 18, height: 46, backgroundColor: '#2E200A' }]} />
      <View style={[pv.sil, { bottom: 18, left: '42%', width: 14, height: 38, backgroundColor: '#2E200A' }]} />
      <View style={[pv.sil, { bottom: 18, right: '22%', width: 20, height: 52, backgroundColor: '#2E200A' }]} />
      {/* Warm sun */}
      <View style={[pv.circle, { top: 18, right: 24, width: 28, height: 28, borderRadius: 14, backgroundColor: '#E8B44A' }]} />
      {/* Grain & warm vignette */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(180,120,40,0.22)' }]} />
      {/* Film sprocket holes — top and bottom */}
      <View style={[pv.sprocketRow, { top: 4 }]}>
        {Array.from({ length: 8 }).map((_, i) => <View key={i} style={pv.sprocket} />)}
      </View>
      <View style={[pv.sprocketRow, { bottom: 4 }]}>
        {Array.from({ length: 8 }).map((_, i) => <View key={i} style={pv.sprocket} />)}
      </View>
      <View style={pv.chip}><Text style={pv.chipText}>Warm Grain</Text></View>
    </View>
  );
}

function NoirPreview() {
  return (
    <View style={[pv.wrap, { backgroundColor: '#111' }]}>
      {/* Greyscale sky */}
      <View style={[pv.band, { backgroundColor: '#5A5A5A', flex: 2.5 }]} />
      {/* Greyscale mid */}
      <View style={[pv.band, { backgroundColor: '#3A3A3A', flex: 1.2 }]} />
      {/* Dark ground */}
      <View style={[pv.band, { backgroundColor: '#222', flex: 0.8 }]} />
      {/* Silhouettes */}
      <View style={[pv.sil, { bottom: 18, left: '25%', width: 18, height: 46, backgroundColor: '#111' }]} />
      <View style={[pv.sil, { bottom: 18, left: '42%', width: 14, height: 38, backgroundColor: '#111' }]} />
      <View style={[pv.sil, { bottom: 18, right: '22%', width: 20, height: 52, backgroundColor: '#111' }]} />
      {/* Bright moon/sun */}
      <View style={[pv.circle, { top: 18, right: 24, width: 28, height: 28, borderRadius: 14, backgroundColor: '#E8E8E8' }]} />
      {/* High-contrast vignette */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.32)' }]} />
      {/* Spotlight ray */}
      <View style={pv.ray} />
      <View style={pv.chip}><Text style={pv.chipText}>B&W</Text></View>
    </View>
  );
}

const pv = StyleSheet.create({
  wrap: { width: '100%', height: PREVIEW_H, overflow: 'hidden', borderTopLeftRadius: 12, borderTopRightRadius: 12, position: 'relative' },
  band: { width: '100%' },
  sil: { position: 'absolute', borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  circle: { position: 'absolute' },
  sprocketRow: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-evenly', paddingHorizontal: 8 },
  sprocket: { width: 6, height: 6, borderRadius: 1.5, backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.15)' },
  ray: {
    position: 'absolute', top: 0, left: '48%', width: 40, height: '100%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    transform: [{ skewX: '-8deg' }],
  },
  chip: {
    position: 'absolute', bottom: 10, right: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10, paddingVertical: 3, paddingHorizontal: 8,
  },
  chipText: { color: '#fff', fontSize: 10, letterSpacing: 0.8, opacity: 0.85 },
});

// ── Aesthetic data (preview is a render function, not stored as JSX) ───────

const AESTHETICS: { key: AestheticKey; icon: string; title: string; description: string; renderPreview: () => React.ReactNode }[] = [
  {
    key: 'original',
    icon: '📱',
    title: 'Original',
    description: 'Clean, true-to-life colour. Crisp tones that keep the moment exactly as it was.',
    renderPreview: () => <OriginalPreview />,
  },
  {
    key: 'film',
    icon: '🎞',
    title: 'Film',
    description: 'Warm grain and soft tones. Feels like a real disposable camera from the 90s.',
    renderPreview: () => <FilmPreview />,
  },
  {
    key: 'noir',
    icon: '◑',
    title: 'Noir',
    description: 'Black and white. Timeless, cinematic, every shadow tells a story.',
    renderPreview: () => <NoirPreview />,
  },
];

// ── Logo ───────────────────────────────────────────────────────────────────

function Logo({ color }: { color: string }) {
  return (
    <View style={styles.logoRow}>
      <View style={[styles.logoDot, { backgroundColor: color }]} />
      <Text style={[styles.logoText, { color }]}>CANDID Clicks</Text>
    </View>
  );
}

// ── Progress dots for the card scroll ─────────────────────────────────────

function CardDots({ count, active, textColor }: { count: number; active: number; textColor: string }) {
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            {
              backgroundColor: textColor,
              opacity: i === active ? 1 : 0.22,
              width: i === active ? 18 : 6,
            },
          ]}
        />
      ))}
    </View>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function FilmAestheticScreen() {
  const { update } = useCreateEvent();
  const insets = useSafeAreaInsets();
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [selected, setSelected] = useState<AestheticKey>('original');
  const [scrollIndex, setScrollIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const [fontsLoaded] = useFonts({ PlayfairDisplay_400Regular, PlayfairDisplay_700Bold });
  const serif = fontsLoaded ? 'PlayfairDisplay_400Regular' : undefined;
  const serifBold = fontsLoaded ? 'PlayfairDisplay_700Bold' : undefined;

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((k) => {
      if (k && THEMES[k]) setTheme(THEMES[k]);
    });
  }, []);

  const handleScroll = (e: { nativeEvent: { contentOffset: { x: number } } }) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / (CARD_W + CARD_GAP));
    if (idx !== scrollIndex) setScrollIndex(idx);
  };

  const handleSelect = (key: AestheticKey, idx: number) => {
    setSelected(key);
    scrollRef.current?.scrollTo({ x: idx * (CARD_W + CARD_GAP), animated: true });
    setScrollIndex(idx);
  };

  const handleNext = () => {
    update({ aesthetic: selected });
    router.push('/create-event/invitation-card');
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle="light-content" />

      {/* Fixed header */}
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
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.heading, { color: theme.text, fontFamily: serifBold }]}>
          Which camera would{'\n'}you like to use?
        </Text>
        <Text style={[styles.subtext, { color: theme.text, fontFamily: serif }]}>
          Choose a style for your film. Original photos are always saved on guest devices.
        </Text>

        {/* Horizontal card carousel */}
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={CARD_W + CARD_GAP}
          decelerationRate="fast"
          onMomentumScrollEnd={handleScroll}
          onScrollEndDrag={handleScroll}
          contentContainerStyle={styles.carouselContent}
          style={styles.carousel}
        >
          {AESTHETICS.map((item, idx) => {
            const isSelected = selected === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[
                  styles.card,
                  {
                    width: CARD_W,
                    backgroundColor: isSelected ? GOLD_TINT : 'rgba(255,255,255,0.04)',
                    borderColor: isSelected ? GOLD : 'rgba(255,255,255,0.1)',
                    borderWidth: isSelected ? 1.5 : 1,
                  },
                ]}
                onPress={() => handleSelect(item.key, idx)}
                activeOpacity={0.88}
              >
                {/* Colour simulation preview */}
                {item.renderPreview()}

                {/* Card body */}
                <View style={styles.cardBody}>
                  <View style={styles.cardTitleRow}>
                    <Text style={styles.cardIcon}>{item.icon}</Text>
                    <Text style={[styles.cardTitle, { color: isSelected ? GOLD : theme.text, fontFamily: serifBold }]}>
                      {item.title}
                    </Text>
                    {isSelected && (
                      <View style={styles.selectedBadge}>
                        <Text style={styles.selectedBadgeText}>✓ Selected</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.cardDesc, { color: theme.text, fontFamily: serif }]}>
                    {item.description}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Scroll progress dots */}
        <CardDots count={AESTHETICS.length} active={scrollIndex} textColor={theme.text} />

        {/* Style pill quick-select row */}
        <View style={styles.pillRow}>
          {AESTHETICS.map((item, idx) => {
            const active = selected === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[
                  styles.stylePill,
                  {
                    backgroundColor: active ? GOLD_TINT : 'rgba(255,255,255,0.05)',
                    borderColor: active ? GOLD : 'rgba(255,255,255,0.12)',
                  },
                ]}
                onPress={() => handleSelect(item.key, idx)}
                activeOpacity={0.75}
              >
                <Text style={styles.pillIcon}>{item.icon}</Text>
                <Text style={[styles.pillLabel, { color: active ? GOLD : theme.text, fontFamily: active ? serifBold : serif }]}>
                  {item.title}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Disclaimer note */}
        <Text style={[styles.note, { color: theme.text, fontFamily: serif }]}>
          * Original photos are saved by default on guest devices. The selected style is applied when guests upload.
        </Text>
      </ScrollView>

      {/* Footer — always enabled */}
      <View style={[styles.footer, { backgroundColor: theme.background, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.footerLeft}>
          <Text style={[styles.selectedLabel, { color: theme.text, fontFamily: serif }]}>Style</Text>
          <Text style={[styles.selectedValue, { fontFamily: serifBold }]}>
            {AESTHETICS.find((a) => a.key === selected)?.title}
          </Text>
        </View>
        <TouchableOpacity style={styles.nextBtn} onPress={handleNext} activeOpacity={0.82}>
          <Text style={[styles.nextText, { fontFamily: serifBold }]}>Next →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: H_PAD, paddingTop: 56, paddingBottom: 8 },
  headerCenter: { flex: 1, alignItems: 'center' },
  backBtn: { width: 32, alignItems: 'center' },
  backArrow: { fontSize: 22, lineHeight: 26 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  logoDot: { width: 7, height: 7, borderRadius: 4 },
  logoText: { fontSize: 13, letterSpacing: 1.6, textTransform: 'uppercase' },

  body: { flex: 1 },
  bodyContent: { paddingTop: 28, paddingBottom: 12 },

  heading: { fontSize: 32, lineHeight: 44, letterSpacing: 0.2, marginBottom: 10, paddingHorizontal: H_PAD },
  subtext: { fontSize: 15, lineHeight: 24, opacity: 0.6, marginBottom: 28, paddingHorizontal: H_PAD },

  // Carousel
  carousel: { overflow: 'visible' },
  carouselContent: { paddingLeft: H_PAD, paddingRight: H_PAD / 2, gap: CARD_GAP },

  // Card
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12 },
      android: { elevation: 6 },
    }),
  },
  cardBody: { padding: 18, gap: 8 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardIcon: { fontSize: 20 },
  cardTitle: { fontSize: 18, letterSpacing: 0.2, flex: 1 },
  selectedBadge: {
    backgroundColor: GOLD,
    borderRadius: 10,
    paddingVertical: 2,
    paddingHorizontal: 10,
  },
  selectedBadgeText: { color: '#0C0904', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  cardDesc: { fontSize: 13, lineHeight: 20, opacity: 0.65 },

  // Dots
  dotsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 18, marginBottom: 20 },
  dot: { height: 6, borderRadius: 3 },

  // Quick-select pills
  pillRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, paddingHorizontal: H_PAD, marginBottom: 22 },
  stylePill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 20, paddingVertical: 7, paddingHorizontal: 14 },
  pillIcon: { fontSize: 13 },
  pillLabel: { fontSize: 13, letterSpacing: 0.3 },

  // Note
  note: { fontSize: 12, lineHeight: 18, opacity: 0.38, paddingHorizontal: H_PAD, fontStyle: 'italic' },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: H_PAD,
    paddingTop: 12,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    gap: 16,
  },
  footerLeft: { gap: 2 },
  selectedLabel: { fontSize: 10, letterSpacing: 1.5, opacity: 0.45, textTransform: 'uppercase' },
  selectedValue: { fontSize: 15, color: GOLD, letterSpacing: 0.3 },
  nextBtn: {
    backgroundColor: GOLD,
    height: 52,
    paddingHorizontal: 32,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nextText: { fontSize: 14, color: '#0C0904', letterSpacing: 2, textTransform: 'uppercase' },
});
