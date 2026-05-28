import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useFonts,
  PlayfairDisplay_400Regular,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import { supabase } from '../../supabase/client';
import {
  registerForPushNotifications,
  scheduleRevealNotification,
} from '../../shared/notifications';

const { width: SW, height: SH } = Dimensions.get('window');

const BG        = '#0C0904';
const WW        = '#F0E8D5';   // warm white
const GOLD      = '#D4A853';
const MUTED     = 'rgba(240,232,213,0.5)';
const BORDER    = 'rgba(240,232,213,0.15)';
const INPUT_BG  = 'rgba(255,255,255,0.08)';
const GOLD_T    = 'rgba(212,168,83,0.08)';
const GOLD_SOFT = 'rgba(212,168,83,0.25)';

// ── Helpers ──────────────────────────────────────────────────────────────────

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatReveal(isoStr: string): string {
  if (!isoStr) return '';
  const dt = new Date(isoStr);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const h = dt.getHours();
  const min = dt.getMinutes();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${dt.getDate()} ${months[dt.getMonth()]}, ${h12}:${String(min).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

// ── Types ────────────────────────────────────────────────────────────────────

type ScreenState = 'loading' | 'not_found' | 'revealed' | 'welcome' | 'joined';

interface EventRow {
  id: string;
  title: string;
  type: 'private' | 'public';
  host_id: string;
  event_date: string;
  reveal_time: string;
  aesthetic: string;
  invitation_card: string | null;
  shot_limit: number;
  status: string;
}

// ── Logo ─────────────────────────────────────────────────────────────────────

function Logo() {
  return (
    <View style={s.logoRow}>
      <View style={s.logoDot} />
      <Text style={s.logoText}>GUESTFUL CLICKS</Text>
    </View>
  );
}

// ── Cover placeholder ────────────────────────────────────────────────────────

function CoverPlaceholder({ aesthetic }: { aesthetic: string }) {
  const isFilm = aesthetic === 'film';
  const isNoir = aesthetic === 'noir';
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1A1208' }]} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(212,168,83,0.06)' }]} />
      <View style={s.coverIconCircle}>
        <Text style={s.coverIconText}>📷</Text>
      </View>
      {isFilm && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(180,120,40,0.25)' }]} />
      )}
      {isNoir && (
        <>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)' }]} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(80,80,80,0.38)' }]} />
        </>
      )}
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function GuestJoin() {
  const { code } = useLocalSearchParams<{ code?: string }>();

  const [fontsLoaded] = useFonts({
    PlayfairDisplay_400Regular,
    PlayfairDisplay_700Bold,
  });

  const [screenState, setScreenState]   = useState<ScreenState>('loading');
  const [event, setEvent]               = useState<EventRow | null>(null);
  const [hostName, setHostName]         = useState('');
  const [guestName, setGuestName]       = useState('');
  const [joinedName, setJoinedName]     = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nameFocused, setNameFocused]   = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // STATE 3 animations
  const checkScale   = useRef(new Animated.Value(0)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity  = useRef(new Animated.Value(0)).current;
  const bottomOp     = useRef(new Animated.Value(0)).current;
  const bottomTY     = useRef(new Animated.Value(30)).current;

  // ── Fetch event ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!code) { setScreenState('not_found'); return; }
    (async () => {
      try {
        const { data: ev, error } = await supabase
          .from('events')
          .select('id, title, type, host_id, event_date, reveal_time, aesthetic, invitation_card, shot_limit, status')
          .eq('share_code', code)
          .single();

        if (error || !ev) { setScreenState('not_found'); return; }
        if (ev.status === 'revealed') { setScreenState('revealed'); return; }

        // Resolve shot_limit: use event value if set, otherwise fall back to pricing config
        let resolvedShotLimit = ev.shot_limit;
        if (!resolvedShotLimit) {
          try {
            const { data: pricingData } = await supabase
              .from('admin_settings')
              .select('value')
              .eq('key', 'pricing_config')
              .single();
            const configLimit = (pricingData?.value as any)?.extended_limits?.private_guest_shots;
            resolvedShotLimit = typeof configLimit === 'number' && configLimit > 0 ? configLimit : 18;
          } catch {
            resolvedShotLimit = 18;
          }
        }
        setEvent({ ...ev, shot_limit: resolvedShotLimit });

        const { data: host } = await supabase
          .from('users')
          .select('full_name')
          .eq('id', ev.host_id)
          .single();
        setHostName(host?.full_name?.split(' ')[0] ?? 'your host');

        setScreenState('welcome');
      } catch {
        setScreenState('not_found');
      }
    })();
  }, [code]);

  // ── PWA install prompt (web only) ────────────────────────────────────────

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    (window as any).addEventListener('beforeinstallprompt', handler);
    return () => (window as any).removeEventListener('beforeinstallprompt', handler);
  }, []);

  // ── Join handler ──────────────────────────────────────────────────────────

  const handleJoin = useCallback(async () => {
    if (!event || guestName.trim().length < 2 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const qr_token = uuidv4();
      const { data: participant, error } = await supabase
        .from('participants')
        .insert({
          event_id:  event.id,
          name:      guestName.trim(),
          qr_token,
          tier:      'free',
          joined_at: new Date().toISOString(),
        })
        .select('id, qr_token')
        .single();

      if (error) throw error;

      await AsyncStorage.setItem(
        '@guestful_participant',
        JSON.stringify({
          id:         participant.id,
          qr_token:   participant.qr_token,
          event_id:   event.id,
          name:       guestName.trim(),
          shot_limit: event.shot_limit,
        }),
      );

      setJoinedName(guestName.trim());
      setScreenState('joined');
      runJoinAnim();

      // Non-blocking: register push token and schedule the reveal notification.
      // Failures here are swallowed — the join itself already succeeded.
      const participantId = participant.id;
      const revealAt      = event.reveal_time;
      const evTitle       = event.title;
      ;(async () => {
        try {
          const token = await registerForPushNotifications();
          if (token && participantId) {
            await supabase
              .from('participants')
              .update({ push_token: token })
              .eq('id', participantId);
          }
          if (revealAt) {
            await scheduleRevealNotification(evTitle, new Date(revealAt));
          }
        } catch {/* non-critical */}
      })();
    } catch {
      // allow retry — no toast needed, button stays enabled
    } finally {
      setIsSubmitting(false);
    }
  }, [event, guestName, isSubmitting]);

  const runJoinAnim = () => {
    checkScale.setValue(0);
    checkOpacity.setValue(0);
    textOpacity.setValue(0);
    bottomOp.setValue(0);
    bottomTY.setValue(30);

    // Checkmark pops in immediately
    Animated.parallel([
      Animated.spring(checkScale, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
      Animated.timing(checkOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();

    // Text fades in after checkmark settles
    Animated.sequence([
      Animated.delay(500),
      Animated.timing(textOpacity, { toValue: 1, duration: 700, useNativeDriver: true }),
    ]).start();

    // Bottom section slides up at 2.5 s
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(bottomOp, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(bottomTY, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]).start();
    }, 2500);
  };

  const handleAddToHomeScreen = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
    }
  };

  // ── Guards ────────────────────────────────────────────────────────────────

  if (!fontsLoaded) return null;

  // ── STATE 1 — LOADING ────────────────────────────────────────────────────

  if (screenState === 'loading') {
    return (
      <View style={s.root}>
        <StatusBar barStyle="light-content" />
        <View style={s.logoArea}><Logo /></View>
        <View style={s.centerFill}>
          <ActivityIndicator size="large" color={GOLD} />
        </View>
      </View>
    );
  }

  // ── ERROR states ──────────────────────────────────────────────────────────

  if (screenState === 'not_found') {
    return (
      <View style={s.root}>
        <StatusBar barStyle="light-content" />
        <View style={s.logoArea}><Logo /></View>
        <View style={s.centerFill}>
          <Text style={s.errorEmoji}>🎞</Text>
          <Text style={s.errorTitle}>Event not found</Text>
          <Text style={s.errorBody}>
            The invite link may have expired or the event was removed.
          </Text>
        </View>
      </View>
    );
  }

  if (screenState === 'revealed') {
    return (
      <View style={s.root}>
        <StatusBar barStyle="light-content" />
        <View style={s.logoArea}><Logo /></View>
        <View style={s.centerFill}>
          <Text style={s.errorEmoji}>📽</Text>
          <Text style={s.errorTitle}>This film has already been revealed.</Text>
          <Text style={s.errorBody}>Ask your host for access.</Text>
        </View>
      </View>
    );
  }

  // ── STATE 3 — PERSONALISED WELCOME ───────────────────────────────────────

  if (screenState === 'joined') {
    return (
      <View style={s.root}>
        <StatusBar barStyle="light-content" />
        <View style={s.logoArea}><Logo /></View>

        {/* Centered checkmark + text */}
        <View style={s.joinedCenter}>
          <Animated.View
            style={[
              s.checkCircle,
              { opacity: checkOpacity, transform: [{ scale: checkScale }] },
            ]}
          >
            <Text style={s.checkMark}>✓</Text>
          </Animated.View>

          <Animated.View style={[s.welcomeBlock, { opacity: textOpacity }]}>
            <Text style={s.welcomeName}>Welcome, {joinedName}.</Text>
            <Text style={s.welcomeSub}>You have {event?.shot_limit ?? 18} shots.</Text>
            <Text style={s.welcomeSub}>Make them count.</Text>
            {event?.title ? (
              <Text style={s.welcomeEventName}>{event.title}</Text>
            ) : null}
          </Animated.View>
        </View>

        {/* Bottom section fades in after 2.5 s */}
        <Animated.View
          style={[
            s.joinedBottom,
            { opacity: bottomOp, transform: [{ translateY: bottomTY }] },
          ]}
        >
          {/* Add to Home Screen banner */}
          <View style={s.addHomeBanner}>
            <Text style={s.bannerIcon}>📷</Text>
            <Text style={s.bannerText}>
              Save Guestful Clicks to your home screen to find your gallery after the reveal.
            </Text>
            <TouchableOpacity style={s.addHomeBtn} onPress={handleAddToHomeScreen}>
              <Text style={s.addHomeBtnText}>Add Shortcut →</Text>
            </TouchableOpacity>
          </View>

          {/* Open camera */}
          <TouchableOpacity
            style={s.cameraBtn}
            onPress={() => router.push('/camera/camera-screen')}
            activeOpacity={0.85}
          >
            <Text style={s.cameraBtnText}>Open Camera →</Text>
          </TouchableOpacity>

          <Text style={s.noteText}>
            No account needed. Your name is saved for this event only.
          </Text>
        </Animated.View>
      </View>
    );
  }

  // ── STATE 2 — WELCOME ─────────────────────────────────────────────────────

  const aesthetic = event?.aesthetic?.toLowerCase() ?? '';
  const isFilm    = aesthetic === 'film';
  const isNoir    = aesthetic === 'noir';
  const canSubmit = guestName.trim().length >= 2;

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <View style={s.logoArea}><Logo /></View>

        {/* Cover */}
        <View style={s.coverWrap}>
          {event?.invitation_card ? (
            <Image
              source={{ uri: event.invitation_card }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          ) : (
            <CoverPlaceholder aesthetic={aesthetic} />
          )}
          {isFilm && (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(180,120,40,0.25)' }]} />
          )}
          {isNoir && (
            <>
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)' }]} />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(80,80,80,0.38)' }]} />
            </>
          )}
        </View>

        {/* Event info */}
        <View style={s.infoSection}>
          <Text style={s.invitedBy}>👤 Invited by {hostName}</Text>
          <Text style={s.eventTitle}>{event?.title}</Text>
          <Text style={s.eventDate}>{formatDate(event?.event_date ?? '')}</Text>
          <Text style={s.shotInfo}>📷 {event?.shot_limit ?? 18} shots available</Text>
          <Text style={s.revealInfo}>Reveals on {formatReveal(event?.reveal_time ?? '')}</Text>
        </View>

        {/* Divider */}
        <View style={s.divider} />

        {/* Name input */}
        <View style={s.inputSection}>
          <Text style={s.inputLabel}>What's your name?</Text>
          <TextInput
            style={[s.nameInput, nameFocused && { borderColor: GOLD }]}
            value={guestName}
            onChangeText={setGuestName}
            placeholder="Enter your full name"
            placeholderTextColor={MUTED}
            maxLength={60}
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={canSubmit ? handleJoin : undefined}
            onFocus={() => setNameFocused(true)}
            onBlur={() => setNameFocused(false)}
          />
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={[s.ctaBtn, !canSubmit && s.ctaBtnDisabled]}
          onPress={handleJoin}
          disabled={!canSubmit || isSubmitting}
          activeOpacity={0.82}
        >
          {isSubmitting ? (
            <ActivityIndicator color={BG} size="small" />
          ) : (
            <Text style={s.ctaBtnText}>Take your camera →</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 52 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  scrollContent: { paddingBottom: 0 },

  // Logo
  logoArea: {
    paddingTop: Platform.OS === 'ios' ? 56 : 44,
    paddingBottom: 16,
    alignItems: 'center',
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoDot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: GOLD },
  logoText: {
    fontSize: 11,
    letterSpacing: 3,
    color: WW,
    fontFamily: 'PlayfairDisplay_400Regular',
  },

  // Loading / error
  centerFill: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  errorEmoji: { fontSize: 44, marginBottom: 4 },
  errorTitle: {
    fontSize: 20,
    color: WW,
    fontFamily: 'PlayfairDisplay_700Bold',
    textAlign: 'center',
    lineHeight: 28,
  },
  errorBody: {
    fontSize: 14,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Cover
  coverWrap: {
    width: SW,
    height: SH * 0.45,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverIconCircle: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(212,168,83,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverIconText: { fontSize: 28 },

  // Info
  infoSection: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    gap: 8,
  },
  invitedBy:  { fontSize: 13, color: MUTED, letterSpacing: 0.3 },
  eventTitle: {
    fontSize: 28,
    color: WW,
    fontFamily: 'PlayfairDisplay_700Bold',
    lineHeight: 36,
    marginTop: 4,
  },
  eventDate:  { fontSize: 14, color: MUTED },
  shotInfo:   { fontSize: 14, color: WW, marginTop: 4 },
  revealInfo: { fontSize: 13, color: MUTED },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: BORDER,
    marginHorizontal: 24,
    marginVertical: 4,
  },

  // Input
  inputSection: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 16,
    gap: 12,
  },
  inputLabel: {
    fontSize: 16,
    color: WW,
    fontFamily: 'PlayfairDisplay_400Regular',
  },
  nameInput: {
    backgroundColor: INPUT_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 16,
    color: WW,
    fontFamily: 'PlayfairDisplay_400Regular',
  },

  // CTA
  ctaBtn: {
    marginHorizontal: 24,
    marginTop: 4,
    backgroundColor: GOLD,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  ctaBtnDisabled: { opacity: 0.42 },
  ctaBtnText: {
    fontSize: 16,
    fontFamily: 'PlayfairDisplay_700Bold',
    color: BG,
    letterSpacing: 0.5,
  },

  // STATE 3 — Joined
  joinedCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    gap: 28,
  },
  checkCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: GOLD_T,
    borderWidth: 2,
    borderColor: GOLD,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios:     { shadowColor: GOLD, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 16 },
      android: { elevation: 8 },
      default: {},
    }),
  },
  checkMark: { fontSize: 40, color: GOLD, lineHeight: 48 },

  welcomeBlock: { alignItems: 'center', gap: 6 },
  welcomeName: {
    fontSize: 26,
    color: WW,
    fontFamily: 'PlayfairDisplay_700Bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  welcomeSub: { fontSize: 16, color: MUTED, textAlign: 'center', lineHeight: 24 },
  welcomeEventName: {
    fontSize: 17,
    color: GOLD,
    fontFamily: 'PlayfairDisplay_400Regular',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 12,
  },

  // Bottom section
  joinedBottom: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 44 : 32,
    gap: 14,
  },
  addHomeBanner: {
    backgroundColor: GOLD_T,
    borderWidth: 1,
    borderColor: GOLD_SOFT,
    borderRadius: 14,
    padding: 18,
    gap: 10,
  },
  bannerIcon: { fontSize: 22 },
  bannerText: { fontSize: 13, color: MUTED, lineHeight: 20 },
  addHomeBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: GOLD,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 2,
  },
  addHomeBtnText: {
    fontSize: 13,
    color: GOLD,
    fontFamily: 'PlayfairDisplay_700Bold',
  },
  cameraBtn: {
    backgroundColor: GOLD,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  cameraBtnText: {
    fontSize: 16,
    fontFamily: 'PlayfairDisplay_700Bold',
    color: BG,
    letterSpacing: 0.5,
  },
  noteText: {
    fontSize: 12,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 18,
    opacity: 0.7,
  },
});
