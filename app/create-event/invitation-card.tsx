import React, { useEffect, useState } from 'react';
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import {
  useFonts,
  PlayfairDisplay_400Regular,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import { supabase } from '../../supabase/client';
import { useCreateEvent } from '../../shared/CreateEventContext';

// ── Theme ──────────────────────────────────────────────────────────────────

const THEME_KEY = '@guestful_onboarding_theme';
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

// ── Phone mockup dimensions ────────────────────────────────────────────────

const PHONE_W = 200;
const PHONE_H = 412;
const PHONE_R = 28;         // outer corner radius
const SCREEN_R = 22;        // inner screen corner radius
const BORDER = 3;
const NOTCH_W = 72;
const NOTCH_H = 22;
const HOME_H = 22;
const SIDE_BTN_H = 60;
// Usable screen area height
const CONTENT_H = PHONE_H - BORDER * 2 - NOTCH_H - HOME_H;
const COVER_H = Math.floor(CONTENT_H * 0.52);
const DETAIL_H = CONTENT_H - COVER_H;

// ── Helpers ────────────────────────────────────────────────────────────────

function formatRevealShort(iso: string): string {
  if (!iso) return 'TBD';
  const d = new Date(iso);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const h = d.getHours(), m = d.getMinutes();
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${d.getDate()} ${months[d.getMonth()]}, ${h12}:${String(m).padStart(2,'0')} ${period}`;
}

// ── Aesthetic overlay helper ───────────────────────────────────────────────

function AestheticOverlay({ aesthetic }: { aesthetic: string }) {
  if (aesthetic === 'film') {
    return <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(180,120,40,0.28)' }]} pointerEvents="none" />;
  }
  if (aesthetic === 'noir') {
    return (
      <>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.42)' }]} pointerEvents="none" />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(120,120,120,0.38)' }]} pointerEvents="none" />
      </>
    );
  }
  return null;
}

// ── Gradient cover placeholder ─────────────────────────────────────────────

function CoverPlaceholder({ aesthetic }: { aesthetic: string }) {
  const baseColor = aesthetic === 'noir' ? '#1A1A1A' : aesthetic === 'film' ? '#1C1209' : '#0F0C08';
  const accentOpacity = aesthetic === 'noir' ? 0 : 0.14;
  return (
    <View style={[ph.wrap, { backgroundColor: baseColor }]}>
      {/* Pseudo-gradient layers */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(212,168,83,${accentOpacity})` }]} />
      <View style={[ph.radialGlow]} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.25)' }]} />
      {/* Icon */}
      <View style={ph.center}>
        <Text style={ph.camIcon}>📷</Text>
        <Text style={ph.addLabel}>ADD COVER</Text>
      </View>
      {/* Film aesthetic overlay on placeholder */}
      <AestheticOverlay aesthetic={aesthetic} />
    </View>
  );
}

const ph = StyleSheet.create({
  wrap: { flex: 1, overflow: 'hidden' },
  radialGlow: {
    position: 'absolute',
    top: -30, alignSelf: 'center',
    width: 160, height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(212,168,83,0.07)',
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 4 },
  camIcon: { fontSize: 26 },
  addLabel: { color: 'rgba(212,168,83,0.5)', fontSize: 9, letterSpacing: 1.8 },
});

// ── Phone mockup ───────────────────────────────────────────────────────────

interface PhoneProps {
  imageUri: string | null;
  aesthetic: string;
  eventName: string;
  hostName: string;
  revealTime: string;
  serif?: string;
  serifBold?: string;
}

function PhoneMockup({ imageUri, aesthetic, eventName, hostName, revealTime, serif, serifBold }: PhoneProps) {
  return (
    <View style={phone.outer}>
      {/* Volume buttons (left) */}
      <View style={[phone.sideBtn, phone.volBtn1]} />
      <View style={[phone.sideBtn, phone.volBtn2]} />
      {/* Power button (right) */}
      <View style={[phone.sideBtn, phone.powerBtn]} />

      {/* Phone body */}
      <View style={phone.body}>
        {/* Notch */}
        <View style={phone.notchBar}>
          <View style={phone.notch} />
        </View>

        {/* Screen */}
        <View style={phone.screen}>
          {/* Cover area */}
          <View style={phone.cover}>
            {imageUri ? (
              <>
                <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                <AestheticOverlay aesthetic={aesthetic} />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(212,168,83,0.35)' }]} pointerEvents="none" />
              </>
            ) : (
              <CoverPlaceholder aesthetic={aesthetic} />
            )}
            {/* Guestful Clicks watermark */}
            <View style={phone.watermark} pointerEvents="none">
              <View style={phone.wDot} />
              <Text style={phone.wText}>Guestful Clicks</Text>
            </View>
          </View>

          {/* Details area */}
          <View style={[phone.details, { height: DETAIL_H }]}>
            <Text style={[phone.evtName, { fontFamily: serifBold }]} numberOfLines={2}>
              {eventName || 'Your Event Name'}
            </Text>
            <Text style={[phone.invitedBy, { fontFamily: serif }]}>
              👤 Invited by {hostName || 'Host'}
            </Text>
            <View style={phone.metaRow}>
              <Text style={[phone.metaTag, { fontFamily: serif }]}>📷 18 shots</Text>
              <Text style={[phone.metaTag, { fontFamily: serif }]}>🕐 {formatRevealShort(revealTime)}</Text>
            </View>
            {/* Name input mockup */}
            <View style={phone.nameInput}>
              <Text style={[phone.nameInputText, { fontFamily: serif }]}>Enter your name</Text>
            </View>
            {/* CTA */}
            <View style={phone.ctaBtn}>
              <Text style={[phone.ctaText, { fontFamily: serifBold }]}>Take your camera →</Text>
            </View>
          </View>
        </View>

        {/* Home indicator */}
        <View style={phone.homeRow}>
          <View style={phone.homeBar} />
        </View>
      </View>
    </View>
  );
}

const phone = StyleSheet.create({
  // Outer shell with side buttons
  outer: { width: PHONE_W, height: PHONE_H, alignSelf: 'center', position: 'relative' },
  sideBtn: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2 },
  volBtn1: { left: -3, top: 80, width: 3, height: SIDE_BTN_H * 0.6 },
  volBtn2: { left: -3, top: 80 + SIDE_BTN_H * 0.6 + 10, width: 3, height: SIDE_BTN_H * 0.6 },
  powerBtn: { right: -3, top: 90, width: 3, height: SIDE_BTN_H },

  // Body
  body: {
    flex: 1,
    borderRadius: PHONE_R,
    borderWidth: BORDER,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: '#080604',
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.6, shadowRadius: 20 },
      android: { elevation: 16 },
    }),
  },

  // Notch
  notchBar: { height: NOTCH_H, alignItems: 'center', justifyContent: 'center' },
  notch: { width: NOTCH_W, height: 14, borderRadius: 7, backgroundColor: '#080604', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)' },

  // Screen content
  screen: { flex: 1 },
  cover: { height: COVER_H, overflow: 'hidden', backgroundColor: '#111' },

  // Watermark
  watermark: { position: 'absolute', top: 6, left: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  wDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.7)' },
  wText: { fontSize: 7, color: 'rgba(255,255,255,0.7)', letterSpacing: 0.8 },

  // Details
  details: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 4, gap: 5 },
  evtName: { fontSize: 11, color: '#F0E8D5', lineHeight: 15, letterSpacing: 0.1 },
  invitedBy: { fontSize: 8, color: 'rgba(240,232,213,0.55)', letterSpacing: 0.2 },
  metaRow: { flexDirection: 'row', gap: 8 },
  metaTag: { fontSize: 7.5, color: GOLD, opacity: 0.85 },

  // Input mockup
  nameInput: {
    height: 22, borderRadius: 4,
    borderWidth: 0.5, borderColor: 'rgba(212,168,83,0.3)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    justifyContent: 'center', paddingHorizontal: 8,
  },
  nameInputText: { fontSize: 8, color: 'rgba(240,232,213,0.35)', letterSpacing: 0.3 },

  // CTA button
  ctaBtn: {
    height: 22, borderRadius: 3,
    backgroundColor: GOLD,
    justifyContent: 'center', alignItems: 'center',
    marginTop: 2,
  },
  ctaText: { fontSize: 8, color: '#0C0904', letterSpacing: 0.8 },

  // Home indicator
  homeRow: { height: HOME_H, justifyContent: 'center', alignItems: 'center' },
  homeBar: { width: 50, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)' },
});

// ── Logo ───────────────────────────────────────────────────────────────────

function Logo({ color }: { color: string }) {
  return (
    <View style={styles.logoRow}>
      <View style={[styles.logoDot, { backgroundColor: color }]} />
      <Text style={[styles.logoText, { color }]}>Guestful Clicks</Text>
    </View>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function InvitationCardScreen() {
  const { draft, update } = useCreateEvent();
  const { eventName, revealTime, aesthetic } = draft;

  const insets = useSafeAreaInsets();
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [hostName, setHostName] = useState('');
  const [previewVisible, setPreviewVisible] = useState(false);
  const [permError, setPermError] = useState<string | null>(null);

  const [fontsLoaded] = useFonts({ PlayfairDisplay_400Regular, PlayfairDisplay_700Bold });
  const serif = fontsLoaded ? 'PlayfairDisplay_400Regular' : undefined;
  const serifBold = fontsLoaded ? 'PlayfairDisplay_700Bold' : undefined;

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((k) => { if (k && THEMES[k]) setTheme(THEMES[k]); });
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      const full: string = user.user_metadata?.full_name ?? user.user_metadata?.name ?? '';
      setHostName(full.split(' ')[0] ?? '');
    });
  }, []);

  const pickImage = async () => {
    setPermError(null);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setPermError('Gallery access is required to add a cover image. Please allow it in your device settings.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  };

  const handleNext = () => {
    update({ invitationCard: imageUri ?? '' });
    router.push('/create-event/guest-count');
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
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.heading, { color: theme.text, fontFamily: serifBold }]}>
          Design your film{'\n'}invitation card.
        </Text>
        <Text style={[styles.subtext, { color: theme.text, fontFamily: serif }]}>
          This is the first thing guests see when they scan your QR code.
        </Text>

        {/* Aesthetic badge */}
        {aesthetic && (
          <View style={styles.aestheticBadge}>
            <Text style={[styles.aestheticBadgeText, { fontFamily: serif }]}>
              {aesthetic === 'original' ? '📱 Original' : aesthetic === 'film' ? '🎞 Film' : '◑ Noir'} filter applied
            </Text>
          </View>
        )}

        {/* Phone mockup */}
        <View style={styles.mockupWrap}>
          <PhoneMockup
            imageUri={imageUri}
            aesthetic={aesthetic}
            eventName={eventName}
            hostName={hostName}
            revealTime={revealTime}
            serif={serif}
            serifBold={serifBold}
          />
        </View>

        {/* Cover image controls */}
        <View style={styles.controlsRow}>
          <TouchableOpacity
            style={[styles.controlBtn, { borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.04)' }]}
            onPress={pickImage}
            activeOpacity={0.75}
          >
            <Text style={styles.controlBtnIcon}>📷</Text>
            <Text style={[styles.controlBtnLabel, { color: theme.text, fontFamily: serif }]}>
              {imageUri ? 'Change Cover' : 'Edit Cover Image'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.controlBtn, { borderColor: imageUri ? GOLD : 'rgba(255,255,255,0.1)', backgroundColor: imageUri ? GOLD_TINT : 'rgba(255,255,255,0.03)' }]}
            onPress={() => setPreviewVisible(true)}
            activeOpacity={0.75}
            disabled={!imageUri}
          >
            <Text style={styles.controlBtnIcon}>👁</Text>
            <Text style={[styles.controlBtnLabel, { color: imageUri ? GOLD : theme.text, fontFamily: serif, opacity: imageUri ? 1 : 0.35 }]}>
              Preview
            </Text>
          </TouchableOpacity>
        </View>

        {/* Permission error */}
        {permError && (
          <Text style={[styles.errorText, { fontFamily: serif }]}>{permError}</Text>
        )}

        {/* No-image hint */}
        {!imageUri && !permError && (
          <Text style={[styles.hint, { color: theme.text, fontFamily: serif }]}>
            Make your own invite — upload from your gallery
          </Text>
        )}

        {/* Note */}
        <Text style={[styles.note, { color: theme.text, fontFamily: serif }]}>
          * Original photos are saved by default on guest devices. The selected style is applied when guests upload.
        </Text>

        <View style={{ height: 16 }} />
      </ScrollView>

      {/* Footer — always enabled */}
      <View style={[styles.footer, { backgroundColor: theme.background, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.footerLeft}>
          <Text style={[styles.footerLabel, { color: theme.text, fontFamily: serif }]}>Cover</Text>
          <Text style={[styles.footerValue, { fontFamily: serifBold }]}>
            {imageUri ? 'Image added ✓' : 'No cover (default)'}
          </Text>
        </View>
        <TouchableOpacity style={styles.nextBtn} onPress={handleNext} activeOpacity={0.82}>
          <Text style={[styles.nextText, { fontFamily: serifBold }]}>Next →</Text>
        </TouchableOpacity>
      </View>

      {/* Full-screen preview modal */}
      <Modal
        visible={previewVisible}
        transparent={false}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setPreviewVisible(false)}
      >
        <View style={modal.container}>
          <StatusBar barStyle="light-content" />

          {/* Close button */}
          <TouchableOpacity style={modal.closeBtn} onPress={() => setPreviewVisible(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={modal.closeText}>✕</Text>
          </TouchableOpacity>

          {/* Full image */}
          {imageUri ? (
            <View style={modal.imageWrap}>
              <Image source={{ uri: imageUri }} style={modal.image} resizeMode="contain" />
              <AestheticOverlay aesthetic={aesthetic} />
            </View>
          ) : (
            <Text style={modal.noImageText}>No cover image selected.</Text>
          )}

          {/* Aesthetic label */}
          <Text style={[modal.aestheticLabel, { fontFamily: serif }]}>
            {aesthetic === 'original' ? '📱 Original' : aesthetic === 'film' ? '🎞 Film' : '◑ Noir'}
          </Text>
        </View>
      </Modal>
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

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: H_PAD, paddingTop: 28 },

  heading: { fontSize: 32, lineHeight: 44, letterSpacing: 0.2, marginBottom: 10 },
  subtext: { fontSize: 15, lineHeight: 24, opacity: 0.6, marginBottom: 16 },

  aestheticBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: GOLD,
    borderRadius: 12,
    backgroundColor: GOLD_TINT,
    paddingVertical: 4,
    paddingHorizontal: 12,
    marginBottom: 22,
  },
  aestheticBadgeText: { fontSize: 12, color: GOLD, letterSpacing: 0.4 },

  mockupWrap: { alignItems: 'center', marginBottom: 28 },

  controlsRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  controlBtn: {
    flex: 1, height: 48, borderWidth: 1, borderRadius: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  controlBtnIcon: { fontSize: 16 },
  controlBtnLabel: { fontSize: 13, letterSpacing: 0.2 },

  errorText: { color: '#FF6B6B', fontSize: 12, lineHeight: 18, marginBottom: 12 },
  hint: { fontSize: 12, lineHeight: 18, opacity: 0.4, fontStyle: 'italic', marginBottom: 16 },
  note: { fontSize: 12, lineHeight: 18, opacity: 0.35, fontStyle: 'italic', marginTop: 4 },

  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: H_PAD, paddingTop: 12,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    gap: 16,
  },
  footerLeft: { gap: 2 },
  footerLabel: { fontSize: 10, letterSpacing: 1.5, opacity: 0.4, textTransform: 'uppercase' },
  footerValue: { fontSize: 14, color: GOLD, letterSpacing: 0.2 },
  nextBtn: { backgroundColor: GOLD, height: 52, paddingHorizontal: 32, borderRadius: 4, justifyContent: 'center', alignItems: 'center' },
  nextText: { fontSize: 14, color: '#0C0904', letterSpacing: 2, textTransform: 'uppercase' },
});

const modal = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  closeBtn: { position: 'absolute', top: 56, right: 24, zIndex: 10 },
  closeText: { color: 'rgba(255,255,255,0.7)', fontSize: 20 },
  imageWrap: { width: '100%', height: '70%', position: 'relative' },
  image: { width: '100%', height: '100%' },
  noImageText: { color: 'rgba(255,255,255,0.4)', fontSize: 15 },
  aestheticLabel: { position: 'absolute', bottom: 60, color: 'rgba(255,255,255,0.5)', fontSize: 13, letterSpacing: 1 },
});
