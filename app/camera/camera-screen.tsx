import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import {
  useFonts,
  PlayfairDisplay_400Regular,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import { supabase } from '../../supabase/client';

// ── Constants ─────────────────────────────────────────────────────────────────

const { width: SW } = Dimensions.get('window');
const BG      = '#0C0904';
const WW      = '#F0E8D5';
const GOLD    = '#D4A853';
const MUTED   = 'rgba(240,232,213,0.5)';
const BORDER  = 'rgba(240,232,213,0.15)';
const GOLD_T  = 'rgba(212,168,83,0.08)';
const GOLD_B  = 'rgba(212,168,83,0.25)';
const DANGER  = '#FF6B6B';
const H_PAD   = 24;
const CELL    = Math.floor((SW - 4) / 3); // 3 cols with 2px gaps

// ── Types ─────────────────────────────────────────────────────────────────────

type ScreenState = 'loading' | 'camera' | 'selection' | 'uploading' | 'success';
type UploadStatus = 'waiting' | 'uploading' | 'done' | 'error';

interface ParticipantData {
  id: string;
  qr_token: string;
  event_id: string;
  name: string;
  shot_limit: number;
}

interface EventData {
  id: string;
  title: string;
  aesthetic: string;
  reveal_time: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const AESTHETICS = [
  { key: 'original', label: 'Original' },
  { key: 'film',     label: 'Film'     },
  { key: 'noir',     label: 'Noir'     },
];

function aestheticColor(a: string): string | null {
  if (a === 'film') return 'rgba(180,120,40,0.25)';
  if (a === 'noir') return 'rgba(0,0,0,0.55)';
  return null;
}

function formatReveal(iso: string): string {
  if (!iso) return '';
  const dt = new Date(iso);
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const h = dt.getHours(), m = dt.getMinutes();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${dt.getDate()} ${M[dt.getMonth()]}, ${h12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Logo() {
  return (
    <View style={s.logoRow}>
      <View style={s.logoDot} />
      <Text style={s.logoText}>GUESTFUL CLICKS</Text>
    </View>
  );
}

function PermissionScreen({ onRequest }: { onRequest: () => void }) {
  return (
    <View style={[s.root, s.center]}>
      <StatusBar barStyle="light-content" />
      <Text style={s.permEmoji}>📷</Text>
      <Text style={s.permTitle}>Camera Access</Text>
      <Text style={s.permBody}>
        Grant camera access to take photos for this event.
      </Text>
      <TouchableOpacity style={s.permBtn} onPress={onRequest} activeOpacity={0.85}>
        <Text style={s.permBtnText}>Grant Access →</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CameraScreen() {
  const [fontsLoaded] = useFonts({ PlayfairDisplay_400Regular, PlayfairDisplay_700Bold });
  const [permission, requestPermission] = useCameraPermissions();

  const [screenState, setScreenState] = useState<ScreenState>('loading');
  const [participant, setParticipant] = useState<ParticipantData | null>(null);
  const [event, setEvent]             = useState<EventData | null>(null);

  // Camera controls
  const [facing, setFacing]     = useState<'front' | 'back'>('back');
  const [flash, setFlash]       = useState<'on' | 'off'>('off');
  const [hapticOn, setHapticOn] = useState(true);

  // Photos taken in this session
  const [photos, setPhotos]       = useState<string[]>([]);
  const [shotsLeft, setShotsLeft] = useState(18);

  // Selection (STATE 2)
  const [selectedIdx, setSelectedIdx]   = useState<Set<number>>(new Set());
  const [selAesthetic, setSelAesthetic] = useState('original');

  // Upload (STATE 3)
  const [uploadList, setUploadList]           = useState<string[]>([]);
  const [uploadStatuses, setUploadStatuses]   = useState<UploadStatus[]>([]);
  const [uploadDone, setUploadDone]           = useState(0);

  // PWA install prompt
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  const cameraRef = useRef<CameraView>(null);
  const flashAnim = useRef(new Animated.Value(0)).current;

  // ── Load participant + event ──────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('@guestful_participant');
        if (!raw) { router.replace('/guest/join' as any); return; }

        const p: ParticipantData = JSON.parse(raw);
        setParticipant(p);
        setShotsLeft(p.shot_limit);

        const hapticPref = await AsyncStorage.getItem('@guestful_haptic');
        setHapticOn(hapticPref !== '0');

        const { data: ev } = await supabase
          .from('events')
          .select('id, title, aesthetic, reveal_time')
          .eq('id', p.event_id)
          .single();

        if (ev) {
          setEvent(ev);
          setSelAesthetic(ev.aesthetic?.toLowerCase() ?? 'original');
        }

        setScreenState('camera');
      } catch {
        router.replace('/guest/join' as any);
      }
    })();
  }, []);

  // ── PWA install prompt (web) ──────────────────────────────────────────────

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (e: Event) => { e.preventDefault(); setDeferredPrompt(e); };
    (window as any).addEventListener('beforeinstallprompt', handler);
    return () => (window as any).removeEventListener('beforeinstallprompt', handler);
  }, []);

  // ── Camera handlers ───────────────────────────────────────────────────────

  const handleShutter = useCallback(async () => {
    if (!cameraRef.current || shotsLeft <= 0) return;

    if (hapticOn) {
      try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    }

    // Brief white flash
    Animated.sequence([
      Animated.timing(flashAnim, { toValue: 1, duration: 60,  useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start();

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      setPhotos(prev => [...prev, photo.uri]);
      setShotsLeft(prev => prev - 1);
    } catch (e) {
      console.warn('takePicture error:', e);
    }
  }, [shotsLeft, hapticOn, flashAnim]);

  const toggleHaptic = async () => {
    const next = !hapticOn;
    setHapticOn(next);
    await AsyncStorage.setItem('@guestful_haptic', next ? '1' : '0');
  };

  // ── Upload handler ────────────────────────────────────────────────────────

  const startUpload = useCallback(async () => {
    if (!participant || !event || selectedIdx.size === 0) return;

    const toUpload = photos.filter((_, i) => selectedIdx.has(i));
    setUploadList(toUpload);
    setUploadStatuses(toUpload.map(() => 'waiting'));
    setUploadDone(0);
    setScreenState('uploading');

    let done = 0;

    for (let i = 0; i < toUpload.length; i++) {
      setUploadStatuses(prev => { const n = [...prev]; n[i] = 'uploading'; return n; });

      try {
        const uri  = toUpload[i];
        const path = `${event.id}/${participant.id}/${Date.now()}_${i}.jpg`;

        const resp = await fetch(uri);
        const blob = await resp.blob();

        const { error: stErr } = await supabase.storage
          .from('event-photos')
          .upload(path, blob, { contentType: 'image/jpeg', upsert: true });

        if (stErr) throw stErr;

        const { data: { publicUrl } } = supabase.storage
          .from('event-photos')
          .getPublicUrl(path);

        await supabase.from('photos').insert({
          event_id:       event.id,
          participant_id: participant.id,
          url:            publicUrl,
          is_revealed:    false,
          uploaded_at:    new Date().toISOString(),
        });

        // Sequential uploads: select-then-update is safe (no parallel race)
        const { data: pRow } = await supabase
          .from('participants')
          .select('upload_count')
          .eq('id', participant.id)
          .single();
        await supabase
          .from('participants')
          .update({ upload_count: (pRow?.upload_count ?? 0) + 1 })
          .eq('id', participant.id);

        done++;
        setUploadDone(done);
        setUploadStatuses(prev => { const n = [...prev]; n[i] = 'done'; return n; });
      } catch {
        setUploadStatuses(prev => { const n = [...prev]; n[i] = 'error'; return n; });
      }
    }

    setScreenState('success');
  }, [participant, event, photos, selectedIdx]);

  // ── Guards ────────────────────────────────────────────────────────────────

  if (!fontsLoaded || screenState === 'loading') {
    return (
      <View style={[s.root, s.center]}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator color={GOLD} size="large" />
      </View>
    );
  }

  if (!permission?.granted) {
    return <PermissionScreen onRequest={requestPermission} />;
  }

  const evAesthetic = event?.aesthetic?.toLowerCase() ?? 'original';

  // ── STATE 1 — CAMERA ──────────────────────────────────────────────────────

  if (screenState === 'camera') {
    const lastPhoto  = photos[photos.length - 1];
    const camOverlay = aestheticColor(evAesthetic);

    return (
      <View style={s.root}>
        <StatusBar hidden />

        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          flash={flash}
        />

        {/* Aesthetic overlay */}
        {camOverlay ? (
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: camOverlay }]}
            pointerEvents="none"
          />
        ) : null}
        {evAesthetic === 'noir' ? (
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(80,80,80,0.38)' }]}
            pointerEvents="none"
          />
        ) : null}

        {/* Flash burst */}
        <Animated.View
          style={[StyleSheet.absoluteFill, s.flashLayer, { opacity: flashAnim }]}
          pointerEvents="none"
        />

        {/* Top bar */}
        <View style={s.camTopBar} pointerEvents="box-none">
          <TouchableOpacity
            style={s.exitBtn}
            onPress={() => router.back()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={s.exitText}>← Exit</Text>
          </TouchableOpacity>
          <Text style={s.camEventName} numberOfLines={1}>{event?.title ?? ''}</Text>
          <Text style={[s.shotCounter, shotsLeft <= 3 && s.shotCounterRed]}>
            📷 {shotsLeft} left
          </Text>
        </View>

        {/* 3-shots-left warning */}
        {shotsLeft > 0 && shotsLeft <= 3 ? (
          <View style={s.warnBanner} pointerEvents="none">
            <Text style={s.warnText}>
              ⚠ {shotsLeft} shot{shotsLeft !== 1 ? 's' : ''} left
            </Text>
          </View>
        ) : null}

        {/* Thumbnail — last photo taken */}
        {lastPhoto ? (
          <View style={s.thumbnail} pointerEvents="none">
            <Image source={{ uri: lastPhoto }} style={s.thumbnailImg} />
          </View>
        ) : null}

        {/* Bottom overlay */}
        <View style={s.camBottomBar} pointerEvents="box-none">
          {/* Upload button — appears after ≥1 photo */}
          {photos.length > 0 ? (
            <TouchableOpacity
              style={s.uploadAboveBtn}
              onPress={() => setScreenState('selection')}
              activeOpacity={0.85}
            >
              <Text style={s.uploadAboveBtnText}>Upload Your Shots →</Text>
            </TouchableOpacity>
          ) : null}

          <View style={s.shutterRow}>
            {/* Haptic toggle */}
            <TouchableOpacity style={s.camIconBtn} onPress={toggleHaptic}>
              <Text style={s.camIcon}>{hapticOn ? '📳' : '🔇'}</Text>
            </TouchableOpacity>

            {/* Shutter */}
            <TouchableOpacity
              style={s.shutterOuter}
              onPress={handleShutter}
              disabled={shotsLeft <= 0}
              activeOpacity={0.75}
            >
              <View style={[s.shutterInner, shotsLeft <= 0 && { opacity: 0.3 }]} />
            </TouchableOpacity>

            {/* Flip */}
            <TouchableOpacity
              style={s.camIconBtn}
              onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}
            >
              <Text style={s.camIcon}>🔄</Text>
            </TouchableOpacity>

            {/* Flash */}
            <TouchableOpacity
              style={[s.camIconBtn, flash === 'on' && s.camIconBtnActive]}
              onPress={() => setFlash(f => f === 'off' ? 'on' : 'off')}
            >
              <Text style={s.camIcon}>⚡</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // ── STATE 2 — SELECTION ───────────────────────────────────────────────────

  if (screenState === 'selection') {
    const limit    = participant?.shot_limit ?? 18;
    const selCount = selectedIdx.size;
    const atLimit  = selCount >= limit;
    const selColor = aestheticColor(selAesthetic);

    return (
      <View style={s.root}>
        <StatusBar barStyle="light-content" />

        <View style={s.selHeader}>
          <View style={{ flex: 1 }}>
            <Text style={s.selHeading}>Choose your best shots.</Text>
            <Text style={s.selSubtext}>
              Select up to {limit} photos to upload to your film.
            </Text>
          </View>
          <Text style={[s.selCounter, atLimit && s.selCounterGold]}>
            {selCount} / {limit}
          </Text>
        </View>

        <FlatList
          data={photos}
          keyExtractor={(_, i) => `p${i}`}
          numColumns={3}
          style={{ flex: 1 }}
          contentContainerStyle={s.gridContent}
          columnWrapperStyle={{ gap: 2 }}
          ItemSeparatorComponent={() => <View style={{ height: 2 }} />}
          renderItem={({ item, index }) => {
            const selected = selectedIdx.has(index);
            return (
              <TouchableOpacity
                style={[s.gridCell, selected && s.gridCellSelected]}
                onPress={() => {
                  setSelectedIdx(prev => {
                    const n = new Set(prev);
                    if (n.has(index)) { n.delete(index); }
                    else if (n.size < limit) { n.add(index); }
                    return n;
                  });
                }}
                activeOpacity={0.85}
              >
                <Image source={{ uri: item }} style={s.gridImg} />

                {/* Aesthetic preview on all photos */}
                {selColor ? (
                  <View
                    style={[StyleSheet.absoluteFill, { backgroundColor: selColor }]}
                    pointerEvents="none"
                  />
                ) : null}
                {selAesthetic === 'noir' ? (
                  <View
                    style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(80,80,80,0.38)' }]}
                    pointerEvents="none"
                  />
                ) : null}

                {/* Dim unselected */}
                {!selected ? (
                  <View
                    style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
                    pointerEvents="none"
                  />
                ) : null}

                {/* Gold checkmark on selected */}
                {selected ? (
                  <View style={s.gridCheck}>
                    <Text style={s.gridCheckText}>✓</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          }}
        />

        {/* Aesthetic selector */}
        <View style={s.aestheticRow}>
          {AESTHETICS.map(a => (
            <TouchableOpacity
              key={a.key}
              style={[s.aestheticPill, selAesthetic === a.key && s.aestheticPillActive]}
              onPress={() => setSelAesthetic(a.key)}
            >
              <Text style={[
                s.aestheticPillText,
                selAesthetic === a.key && s.aestheticPillTextActive,
              ]}>
                {a.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={s.selBottomBar}>
          <TouchableOpacity
            style={s.retakeBtn}
            onPress={() => setScreenState('camera')}
            activeOpacity={0.8}
          >
            <Text style={s.retakeBtnText}>Retake</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.uploadBtn, selCount === 0 && s.uploadBtnDisabled]}
            onPress={startUpload}
            disabled={selCount === 0}
            activeOpacity={0.85}
          >
            <Text style={s.uploadBtnText}>
              Upload {selCount > 0 ? selCount : ''} Photo{selCount !== 1 ? 's' : ''} →
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── STATE 3 — UPLOADING ───────────────────────────────────────────────────

  if (screenState === 'uploading') {
    return (
      <View style={s.root}>
        <StatusBar barStyle="light-content" />

        <View style={s.uploadHeader}>
          <Logo />
          <Text style={s.uploadTitle}>Developing your film...</Text>
          <Text style={s.uploadCounter}>
            {uploadDone} of {uploadList.length} uploaded
          </Text>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={s.uploadListContent}
          showsVerticalScrollIndicator={false}
        >
          {uploadList.map((uri, i) => {
            const status = uploadStatuses[i] ?? 'waiting';
            const icon   = { done: '✅', error: '❌', uploading: '', waiting: '📁' }[status];
            const label  = { done: 'Uploaded', error: 'Failed', uploading: 'Uploading...', waiting: 'Waiting' }[status];
            return (
              <View key={`u${i}`} style={s.uploadRow}>
                <Image source={{ uri }} style={s.uploadThumb} />
                <View style={s.uploadStatusWrap}>
                  {status === 'uploading' ? (
                    <ActivityIndicator color={GOLD} size="small" />
                  ) : (
                    <Text style={s.uploadStatusIcon}>{icon}</Text>
                  )}
                  <Text style={[
                    s.uploadStatusLabel,
                    status === 'done'  && { color: '#4CAF50' },
                    status === 'error' && { color: DANGER },
                  ]}>
                    {label}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  // ── STATE 4 — SUCCESS ─────────────────────────────────────────────────────

  const canUploadMore = (participant?.shot_limit ?? 0) > uploadList.length;

  return (
    <View style={s.successRoot}>
      <StatusBar barStyle="light-content" />
      <Logo />

      <Text style={s.successEmoji}>🎞</Text>
      <Text style={s.successTitle}>Your film is full.</Text>
      <Text style={s.successSub}>See you at the reveal.</Text>

      {event?.reveal_time ? (
        <Text style={s.successReveal}>
          Reveals on {formatReveal(event.reveal_time)}
        </Text>
      ) : null}

      <View style={s.addHomeBanner}>
        <Text style={s.bannerIcon}>📱</Text>
        <Text style={s.bannerText}>
          Save Guestful Clicks to your home screen to find your gallery after the reveal.
        </Text>
        <TouchableOpacity
          style={s.addHomeBtn}
          onPress={async () => {
            if (deferredPrompt) {
              deferredPrompt.prompt();
              await deferredPrompt.userChoice;
              setDeferredPrompt(null);
            }
          }}
        >
          <Text style={s.addHomeBtnText}>Add Shortcut →</Text>
        </TouchableOpacity>
      </View>

      {canUploadMore ? (
        <TouchableOpacity
          style={s.uploadMoreBtn}
          onPress={() => { setSelectedIdx(new Set()); setScreenState('camera'); }}
        >
          <Text style={s.uploadMoreText}>Upload More</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={s.noteText}>
        No account needed. Your name is saved for this event only.
      </Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const TOP_PAD = Platform.OS === 'ios' ? 52 : 36;
const BOT_PAD = Platform.OS === 'ios' ? 44 : 24;

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: BG },
  center: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: H_PAD },

  // Logo
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoDot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: GOLD },
  logoText: { fontSize: 11, letterSpacing: 3, color: WW, fontFamily: 'PlayfairDisplay_400Regular' },

  // Permission screen
  permEmoji: { fontSize: 44, marginBottom: 16 },
  permTitle: {
    fontSize: 22,
    color: WW,
    fontFamily: 'PlayfairDisplay_700Bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  permBody: {
    fontSize: 14,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  permBtn:     { backgroundColor: GOLD, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 32 },
  permBtnText: { fontSize: 16, fontFamily: 'PlayfairDisplay_700Bold', color: BG },

  // Camera STATE 1
  flashLayer: { backgroundColor: '#FFFFFF' },

  camTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: TOP_PAD,
    paddingBottom: 14,
    paddingHorizontal: H_PAD,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(12,9,4,0.55)',
  },
  exitBtn:  {},
  exitText: { fontSize: 15, color: WW },
  camEventName: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    color: WW,
    opacity: 0.7,
    paddingHorizontal: 8,
    fontFamily: 'PlayfairDisplay_400Regular',
  },
  shotCounter:    { fontSize: 13, color: GOLD, fontFamily: 'PlayfairDisplay_700Bold' },
  shotCounterRed: { color: DANGER },

  warnBanner: {
    position: 'absolute',
    top: TOP_PAD + 60,
    alignSelf: 'center',
    backgroundColor: 'rgba(220,50,50,0.9)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  warnText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  thumbnail: {
    position: 'absolute',
    bottom: BOT_PAD + 88,
    left: H_PAD,
    width: 52,
    height: 68,
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.65)',
  },
  thumbnailImg: { width: '100%', height: '100%' },

  camBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 12,
    paddingBottom: BOT_PAD,
    paddingHorizontal: H_PAD,
    backgroundColor: 'rgba(12,9,4,0.55)',
    gap: 10,
  },
  uploadAboveBtn: {
    alignSelf: 'center',
    backgroundColor: GOLD,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 22,
  },
  uploadAboveBtnText: {
    fontSize: 14,
    fontFamily: 'PlayfairDisplay_700Bold',
    color: BG,
    letterSpacing: 0.3,
  },
  shutterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  camIconBtn: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 24,
  },
  camIconBtnActive: { backgroundColor: 'rgba(212,168,83,0.3)' },
  camIcon:          { fontSize: 24 },
  shutterOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 8 },
      android: { elevation: 6 },
      default: {},
    }),
  },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFFFFF' },

  // Selection STATE 2
  selHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: TOP_PAD,
    paddingHorizontal: H_PAD,
    paddingBottom: 14,
    backgroundColor: BG,
  },
  selHeading:      { fontSize: 20, color: WW, fontFamily: 'PlayfairDisplay_700Bold', lineHeight: 28 },
  selSubtext:      { fontSize: 13, color: MUTED, marginTop: 4 },
  selCounter:      { fontSize: 14, color: MUTED, fontFamily: 'PlayfairDisplay_700Bold', marginTop: 4 },
  selCounterGold:  { color: GOLD },

  gridContent:     { paddingBottom: 4 },
  gridCell:        { width: CELL, height: CELL, overflow: 'hidden' },
  gridCellSelected: { borderWidth: 2.5, borderColor: GOLD },
  gridImg:         { width: '100%', height: '100%' },
  gridCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: GOLD,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridCheckText: { fontSize: 12, color: BG, fontWeight: '700' },

  aestheticRow:          { flexDirection: 'row', gap: 10, paddingHorizontal: H_PAD, paddingVertical: 12, backgroundColor: BG },
  aestheticPill:         { borderWidth: 1, borderColor: BORDER, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  aestheticPillActive:   { borderColor: GOLD },
  aestheticPillText:     { fontSize: 13, color: MUTED },
  aestheticPillTextActive: { color: GOLD, fontFamily: 'PlayfairDisplay_700Bold' },

  selBottomBar: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: H_PAD,
    paddingTop: 14,
    paddingBottom: BOT_PAD,
    backgroundColor: BG,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
  },
  retakeBtn:     { flex: 1, borderWidth: 1, borderColor: BORDER, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  retakeBtnText: { fontSize: 15, color: WW, fontFamily: 'PlayfairDisplay_400Regular' },
  uploadBtn:         { flex: 2, backgroundColor: GOLD, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  uploadBtnDisabled: { opacity: 0.42 },
  uploadBtnText:     { fontSize: 15, color: BG, fontFamily: 'PlayfairDisplay_700Bold', letterSpacing: 0.4 },

  // Uploading STATE 3
  uploadHeader: {
    paddingTop: TOP_PAD,
    paddingHorizontal: H_PAD,
    paddingBottom: 20,
    gap: 10,
    alignItems: 'center',
  },
  uploadTitle:   { fontSize: 22, color: WW, fontFamily: 'PlayfairDisplay_700Bold', marginTop: 8, textAlign: 'center' },
  uploadCounter: { fontSize: 14, color: GOLD, fontFamily: 'PlayfairDisplay_400Regular' },
  uploadListContent: { paddingHorizontal: H_PAD, paddingBottom: 40, gap: 4 },
  uploadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  uploadThumb:       { width: 56, height: 56, borderRadius: 8 },
  uploadStatusWrap:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  uploadStatusIcon:  { fontSize: 18 },
  uploadStatusLabel: { fontSize: 14, color: MUTED, fontFamily: 'PlayfairDisplay_400Regular' },

  // Success STATE 4
  successRoot: {
    flex: 1,
    backgroundColor: BG,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: H_PAD,
    paddingVertical: 40,
    gap: 14,
  },
  successEmoji:  { fontSize: 64 },
  successTitle:  { fontSize: 28, color: WW, fontFamily: 'PlayfairDisplay_700Bold', textAlign: 'center' },
  successSub:    { fontSize: 18, color: MUTED, textAlign: 'center' },
  successReveal: { fontSize: 14, color: GOLD, fontFamily: 'PlayfairDisplay_400Regular', textAlign: 'center' },

  addHomeBanner: {
    width: '100%',
    backgroundColor: GOLD_T,
    borderWidth: 1,
    borderColor: GOLD_B,
    borderRadius: 14,
    padding: 18,
    gap: 10,
    marginTop: 4,
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
  },
  addHomeBtnText: { fontSize: 13, color: GOLD, fontFamily: 'PlayfairDisplay_700Bold' },

  uploadMoreBtn:  { borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 },
  uploadMoreText: { fontSize: 14, color: WW, fontFamily: 'PlayfairDisplay_400Regular' },

  noteText: {
    fontSize: 12,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 18,
    opacity: 0.7,
    paddingHorizontal: 8,
  },
});
