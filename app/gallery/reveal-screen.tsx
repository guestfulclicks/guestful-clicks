import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useFonts,
  PlayfairDisplay_400Regular,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../../supabase/client';

// ── Constants ─────────────────────────────────────────────────────────────────

const { width: SW, height: SH } = Dimensions.get('window');
const BG      = '#0C0904';
const WW      = '#F0E8D5';
const GOLD    = '#D4A853';
const MUTED   = 'rgba(240,232,213,0.5)';
const BORDER  = 'rgba(240,232,213,0.15)';
const GOLD_T  = 'rgba(212,168,83,0.08)';
const GOLD_B  = 'rgba(212,168,83,0.25)';
const AMBER   = '#F59E0B';
const H_PAD   = 24;
const COL_W   = Math.floor((SW - 2) / 2);
const PAGE    = 30;

const TOP_PAD = Platform.OS === 'ios' ? 52 : 36;
const BOT_PAD = Platform.OS === 'ios' ? 34 : 20;

const L_RATIOS = [1.3, 0.95, 1.2, 0.85, 1.4, 1.0];
const R_RATIOS = [1.0, 1.25, 0.9, 1.35, 0.95, 1.15];
const AVATAR_COLORS = ['#C47C2A', '#6B4E3D', '#3D5A73', '#4A5E3D', '#6B3D5E'];

const SPEED_MS: Record<SlideshowSpeed, number> = { slow: 5000, medium: 3000, fast: 1500 };

// ── Types ─────────────────────────────────────────────────────────────────────

type ScreenState = 'loading' | 'waiting' | 'reveal_ready' | 'slideshow' | 'gallery';
type GalleryTab  = 'all' | 'my' | 'memories' | 'highlights';
type SlideshowSpeed = 'slow' | 'medium' | 'fast';

interface ParticipantData { id: string; event_id: string; name: string; }
interface EventData {
  id: string; title: string; aesthetic: string;
  reveal_time: string; status: string; expires_at?: string | null;
}
interface PhotoItem {
  id: string; url: string; participant_id: string; uploaded_at: string;
  participants: { name: string; upload_count: number } | { name: string; upload_count: number }[] | null;
}
interface Countdown { d: number; h: number; m: number; s: number; }

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcCountdown(iso: string): Countdown {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return { d: 0, h: 0, m: 0, s: 0 };
  return {
    d: Math.floor(diff / 86400000),
    h: Math.floor((diff % 86400000) / 3600000),
    m: Math.floor((diff % 3600000) / 60000),
    s: Math.floor((diff % 60000) / 1000),
  };
}

function fmtReveal(iso: string): string {
  if (!iso) return '';
  const dt = new Date(iso);
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const h = dt.getHours(), m = dt.getMinutes();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${dt.getDate()} ${M[dt.getMonth()]}, ${h12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function pad(n: number): string { return String(n).padStart(2, '0'); }

function getParticipant(p: PhotoItem['participants']): { name: string; upload_count: number } | null {
  if (!p) return null;
  if (Array.isArray(p)) return p[0] ?? null;
  return p;
}

function daysUntil(iso: string): number {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
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

function CdBox({ value, label }: { value: string; label: string }) {
  return (
    <View style={s.cdBox}>
      <Text style={s.cdVal}>{value}</Text>
      <Text style={s.cdUnit}>{label}</Text>
    </View>
  );
}

// ── Slideshow Player ──────────────────────────────────────────────────────────

interface SlideshowPlayerProps {
  photos: PhotoItem[];
  participantId: string;
  onDone: () => void;
}

function SlideshowPlayer({ photos, participantId, onDone }: SlideshowPlayerProps) {
  const [idx, setIdx]           = useState(0);
  const [prevIdx, setPrevIdx]   = useState<number | null>(null);
  const [paused, setPaused]     = useState(false);
  const [speed, setSpeed]       = useState<SlideshowSpeed>('medium');
  const [showPauseIcon, setShowPauseIcon] = useState(false);

  const currentOp = useRef(new Animated.Value(1)).current;
  const prevOp    = useRef(new Animated.Value(0)).current;
  const kbScale   = useRef(new Animated.Value(1)).current;
  const pauseIconOp = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kbAnimRef   = useRef<Animated.CompositeAnimation | null>(null);
  const progAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  const startPhotoAnimations = useCallback((photoIdx: number, duration: number) => {
    kbScale.setValue(1);
    kbAnimRef.current?.stop();
    kbAnimRef.current = Animated.timing(kbScale, {
      toValue: 1.08, duration, useNativeDriver: true,
    });
    kbAnimRef.current.start();

    // Progress bar
    progAnimRef.current?.stop();
    progressAnim.setValue(photoIdx / Math.max(photos.length - 1, 1));
    progAnimRef.current = Animated.timing(progressAnim, {
      toValue: (photoIdx + 1) / Math.max(photos.length - 1, 1),
      duration,
      useNativeDriver: false,
    });
    progAnimRef.current.start();
  }, [kbScale, progressAnim, photos.length]);

  const advance = useCallback((dir: 1 | -1 = 1) => {
    const nextIdx = idx + dir;
    if (nextIdx < 0) return;
    if (nextIdx >= photos.length) { onDone(); return; }

    const duration = SPEED_MS[speed];
    setPrevIdx(idx);
    prevOp.setValue(1);
    currentOp.setValue(0);
    setIdx(nextIdx);

    Animated.parallel([
      Animated.timing(prevOp,    { toValue: 0, duration: 800, useNativeDriver: true }),
      Animated.timing(currentOp, { toValue: 1, duration: 800, useNativeDriver: true }),
    ]).start();

    startPhotoAnimations(nextIdx, duration);
  }, [idx, photos.length, speed, prevOp, currentOp, onDone, startPhotoAnimations]);

  // Auto-advance timer
  useEffect(() => {
    if (paused) return;
    const duration = SPEED_MS[speed];
    startPhotoAnimations(idx, duration);
    timerRef.current = setTimeout(() => advance(), duration);
    return () => {
      timerRef.current && clearTimeout(timerRef.current);
      kbAnimRef.current?.stop();
      progAnimRef.current?.stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, paused, speed]);

  const handleTap = useCallback(() => {
    setPaused(p => {
      const next = !p;
      if (next) {
        // Show pause icon briefly
        pauseIconOp.setValue(1);
        Animated.timing(pauseIconOp, { toValue: 0, duration: 1000, delay: 800, useNativeDriver: true }).start();
        kbAnimRef.current?.stop();
        progAnimRef.current?.stop();
        timerRef.current && clearTimeout(timerRef.current);
      }
      return next;
    });
  }, [pauseIconOp]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 12,
      onPanResponderRelease: (_, gs) => {
        if (gs.dx < -40) advance(1);
        else if (gs.dx > 40) advance(-1);
      },
    })
  ).current;

  const currentPhoto = photos[idx];
  const prevPhoto    = prevIdx !== null ? photos[prevIdx] : null;
  const participantName = getParticipant(currentPhoto?.participants)?.name ?? '';

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1], outputRange: ['0%', '100%'],
  });

  return (
    <View style={ss.root} {...panResponder.panHandlers}>
      <StatusBar barStyle="light-content" hidden />

      {/* Progress bar */}
      <View style={ss.progressTrack}>
        <Animated.View style={[ss.progressFill, { width: progressWidth }]} />
      </View>

      {/* Photo layers */}
      <TouchableWithoutFeedback onPress={handleTap}>
        <View style={StyleSheet.absoluteFill}>
          {/* Prev photo (fades out) */}
          {prevPhoto && (
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: prevOp }]}>
              <Image source={{ uri: prevPhoto.url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            </Animated.View>
          )}
          {/* Current photo (Ken Burns zoom) */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: currentOp }]}>
            <Animated.Image
              source={{ uri: currentPhoto?.url }}
              style={[StyleSheet.absoluteFill, { transform: [{ scale: kbScale }] }]}
              resizeMode="cover"
            />
          </Animated.View>
        </View>
      </TouchableWithoutFeedback>

      {/* Pause icon overlay */}
      <Animated.View style={[ss.pauseIconWrap, { opacity: pauseIconOp }]} pointerEvents="none">
        <Text style={ss.pauseIcon}>{paused ? '⏸' : '▶'}</Text>
      </Animated.View>

      {/* Bottom gradient overlay + contributor name */}
      <View style={ss.bottomGrad} pointerEvents="none">
        <View style={ss.shotRow}>
          <Text style={ss.shotBy}>
            {participantName ? `Shot by ${participantName}` : ''}
          </Text>
          <Text style={ss.photoCount}>{idx + 1} / {photos.length}</Text>
        </View>
      </View>

      {/* Speed control */}
      <View style={ss.speedRow} pointerEvents="box-none">
        {(['slow', 'medium', 'fast'] as SlideshowSpeed[]).map(sp => (
          <TouchableOpacity
            key={sp}
            style={[ss.speedPill, speed === sp && ss.speedPillActive]}
            onPress={() => setSpeed(sp)}
            activeOpacity={0.7}
          >
            <Text style={[ss.speedText, speed === sp && ss.speedTextActive]}>
              {sp.charAt(0).toUpperCase() + sp.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const ss = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  progressTrack: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)', zIndex: 20,
  },
  progressFill: { height: 3, backgroundColor: GOLD },

  pauseIconWrap: {
    position: 'absolute', inset: 0,
    justifyContent: 'center', alignItems: 'center', zIndex: 10,
  },
  pauseIcon: { fontSize: 56, color: 'rgba(255,255,255,0.85)' },

  bottomGrad: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 160, justifyContent: 'flex-end',
    backgroundColor: 'transparent',
    // Simulate gradient: multiple overlapping views
  },
  shotRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: BOT_PAD + 80,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingTop: 32,
  },
  shotBy:     { fontSize: 13, color: '#FFFFFF', fontFamily: undefined, letterSpacing: 0.3 },
  photoCount: { fontSize: 11, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.3 },

  speedRow: {
    position: 'absolute', bottom: BOT_PAD + 20,
    left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', gap: 10, zIndex: 15,
  },
  speedPill: {
    borderWidth: 1, borderColor: GOLD, borderRadius: 20,
    paddingHorizontal: 18, paddingVertical: 7,
  },
  speedPillActive: { backgroundColor: GOLD },
  speedText:       { fontSize: 13, color: GOLD },
  speedTextActive: { color: '#0C0904', fontWeight: '700' },
});

// ── Slideshow Done Screen ─────────────────────────────────────────────────────

function SlideshowDone({ photoCount, guestCount, onWatchAgain, onOpenGallery }: {
  photoCount: number; guestCount: number;
  onWatchAgain: () => void; onOpenGallery: () => void;
}) {
  return (
    <View style={[sd.root, { backgroundColor: '#000' }]}>
      <StatusBar barStyle="light-content" />
      <Text style={sd.star}>✦</Text>
      <Text style={sd.title}>You've seen every angle.</Text>
      <Text style={sd.sub}>
        {photoCount} photo{photoCount !== 1 ? 's' : ''} from {guestCount} guest{guestCount !== 1 ? 's' : ''}
      </Text>
      <TouchableOpacity style={sd.outlineBtn} onPress={onWatchAgain} activeOpacity={0.82}>
        <Text style={sd.outlineBtnText}>Watch Again</Text>
      </TouchableOpacity>
      <TouchableOpacity style={sd.goldBtn} onPress={onOpenGallery} activeOpacity={0.82}>
        <Text style={sd.goldBtnText}>Open Gallery →</Text>
      </TouchableOpacity>
    </View>
  );
}

const sd = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: H_PAD },
  star: { fontSize: 56, color: GOLD, marginBottom: 8 },
  title: { fontSize: 26, color: WW, fontFamily: 'PlayfairDisplay_700Bold', textAlign: 'center', lineHeight: 34 },
  sub:   { fontSize: 14, color: MUTED, textAlign: 'center', marginBottom: 8 },
  outlineBtn: {
    width: '100%', height: 52, borderRadius: 4, borderWidth: 1.5, borderColor: GOLD,
    justifyContent: 'center', alignItems: 'center',
  },
  outlineBtnText: { fontSize: 15, color: GOLD, fontFamily: 'PlayfairDisplay_700Bold', letterSpacing: 1 },
  goldBtn: {
    width: '100%', height: 52, borderRadius: 4, backgroundColor: GOLD,
    justifyContent: 'center', alignItems: 'center',
  },
  goldBtnText: { fontSize: 15, color: '#0C0904', fontFamily: 'PlayfairDisplay_700Bold', letterSpacing: 1 },
});

// ── Main component ────────────────────────────────────────────────────────────

export default function RevealScreen() {
  const [fontsLoaded] = useFonts({ PlayfairDisplay_400Regular, PlayfairDisplay_700Bold });

  const [screenState, setScreenState] = useState<ScreenState>('loading');
  const [participant, setParticipant] = useState<ParticipantData | null>(null);
  const [event, setEvent]             = useState<EventData | null>(null);
  const [countdown, setCountdown]     = useState<Countdown>({ d: 0, h: 0, m: 0, s: 0 });
  const [guestCount, setGuestCount]   = useState(0);
  const [photoCount, setPhotoCount]   = useState(0);
  const [guestNames, setGuestNames]   = useState<string[]>([]);

  // Slideshow
  const [slideshowDone, setSlideshowDone] = useState(false);
  const [allPhotos, setAllPhotos]         = useState<PhotoItem[]>([]);

  // Gallery
  const [galleryPhotos, setGalleryPhotos] = useState<PhotoItem[]>([]);
  const [galleryPage, setGalleryPage]     = useState(0);
  const [hasMore, setHasMore]             = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [totalPhotos, setTotalPhotos]     = useState(0);
  const [activeTab, setActiveTab]         = useState<GalleryTab>('all');
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [lightboxIndex, setLightboxIndex]     = useState(0);
  const [savingProgress, setSavingProgress]   = useState<{ c: number; t: number } | null>(null);

  // Personal memories
  const [memories, setMemories]         = useState<Set<string>>(new Set());
  const [memoryLoading, setMemoryLoading] = useState<Set<string>>(new Set());
  const [hiddenPhotos, setHiddenPhotos] = useState<Set<string>>(new Set());

  // Expiry
  const [expiresWarning, setExpiresWarning] = useState<string | null>(null);

  // Animations
  const pulseScale = useRef(new Animated.Value(1)).current;

  const lightboxRef  = useRef<FlatList<PhotoItem>>(null);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const statsRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef   = useRef<any>(null);
  const isRevealingRef = useRef(false);

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('@guestful_participant');
        if (!raw) return;
        const p: ParticipantData = JSON.parse(raw);
        setParticipant(p);

        const { data: ev } = await supabase
          .from('events')
          .select('id, title, aesthetic, reveal_time, status, expires_at')
          .eq('id', p.event_id)
          .single();
        if (!ev) return;
        setEvent(ev);

        // Expiry warning
        if (ev.expires_at) {
          const days = daysUntil(ev.expires_at);
          if (days <= 3 && days >= 0) {
            setExpiresWarning(days === 0 ? 'today' : `in ${days} day${days > 1 ? 's' : ''}`);
          }
        }

        if (ev.status === 'revealed') {
          await fetchAllPhotos(ev.id);
          await fetchGalleryPage(ev.id, 0);
          await fetchMemories(ev.id, p.id);
          setScreenState('gallery');
        } else {
          setCountdown(calcCountdown(ev.reveal_time));
          setScreenState('waiting');
          startPulse();
          fetchStats(ev.id);
          setupRealtime(ev.id);
        }
      } catch (e) { console.warn('RevealScreen init:', e); }
    })();

    return () => {
      timerRef.current  && clearInterval(timerRef.current);
      statsRef.current  && clearInterval(statsRef.current);
      channelRef.current && supabase.removeChannel(channelRef.current);
    };
  }, []);

  // ── Countdown timer ───────────────────────────────────────────────────────

  useEffect(() => {
    if (screenState !== 'waiting' || !event) return;
    timerRef.current = setInterval(() => {
      const cd = calcCountdown(event.reveal_time);
      setCountdown(cd);
      if (!cd.d && !cd.h && !cd.m && !cd.s) {
        clearInterval(timerRef.current!);
        triggerReveal(event.id);
      }
    }, 1000);
    return () => { timerRef.current && clearInterval(timerRef.current); };
  }, [screenState, event]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function startPulse() {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseScale, { toValue: 1.12, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseScale, { toValue: 1.0,  duration: 1000, useNativeDriver: true }),
      ])
    ).start();
  }

  async function fetchStats(eventId: string) {
    const run = async () => {
      const [{ count: gc }, { count: pc }, { data: gs }] = await Promise.all([
        supabase.from('participants').select('*', { count: 'exact', head: true }).eq('event_id', eventId),
        supabase.from('photos').select('*', { count: 'exact', head: true }).eq('event_id', eventId),
        supabase.from('participants').select('name').eq('event_id', eventId).limit(5),
      ]);
      setGuestCount(gc ?? 0);
      setPhotoCount(pc ?? 0);
      setGuestNames(gs?.map((g: any) => g.name) ?? []);
    };
    await run();
    statsRef.current = setInterval(run, 30000);
  }

  function setupRealtime(eventId: string) {
    const ch = supabase
      .channel(`reveal-${eventId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'events', filter: `id=eq.${eventId}` },
        (payload: any) => {
          if (payload.new?.status === 'revealed') triggerReveal(eventId);
        })
      .subscribe();
    channelRef.current = ch;
  }

  async function triggerReveal(eventId: string) {
    if (isRevealingRef.current) return;
    isRevealingRef.current = true;
    statsRef.current && clearInterval(statsRef.current);

    // Fetch all photos for slideshow
    await fetchAllPhotos(eventId);
    await fetchGalleryPage(eventId, 0);
    if (participant) await fetchMemories(eventId, participant.id);

    // Count guests
    const { count: gc } = await supabase
      .from('participants').select('*', { count: 'exact', head: true }).eq('event_id', eventId);
    setGuestCount(gc ?? 0);

    setScreenState('reveal_ready');
  }

  async function fetchAllPhotos(eventId: string) {
    const { data } = await supabase
      .from('photos')
      .select('id, url, participant_id, uploaded_at, participants(name, upload_count)')
      .eq('event_id', eventId)
      .eq('is_deleted', false)
      .order('uploaded_at', { ascending: true });
    if (data) setAllPhotos(data as PhotoItem[]);
  }

  async function fetchGalleryPage(eventId: string, page: number) {
    setIsLoadingMore(true);
    const { data, count } = await supabase
      .from('photos')
      .select('id, url, participant_id, uploaded_at, participants(name, upload_count)', { count: 'exact' })
      .eq('event_id', eventId)
      .eq('is_deleted', false)
      .order('uploaded_at', { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (data) {
      const cast = data as PhotoItem[];
      setGalleryPhotos(prev => page === 0 ? cast : [...prev, ...cast]);
      if (count !== null) { setTotalPhotos(count); setPhotoCount(count); }
      setHasMore(data.length === PAGE);
    }
    setIsLoadingMore(false);
  }

  async function fetchMemories(eventId: string, participantId: string) {
    const { data } = await supabase
      .from('personal_memories')
      .select('photo_ids, hidden_photo_ids')
      .eq('event_id', eventId)
      .eq('participant_id', participantId)
      .single();
    if (data?.photo_ids)        setMemories(new Set(data.photo_ids as string[]));
    if (data?.hidden_photo_ids) setHiddenPhotos(new Set(data.hidden_photo_ids as string[]));
  }

  const openGallery = useCallback(async () => {
    if (!event) return;
    if (galleryPhotos.length === 0) await fetchGalleryPage(event.id, 0);
    setScreenState('gallery');
  }, [event, galleryPhotos.length]);

  const loadMore = useCallback(async () => {
    if (!event || isLoadingMore || !hasMore) return;
    const next = galleryPage + 1;
    setGalleryPage(next);
    await fetchGalleryPage(event.id, next);
  }, [event, galleryPage, isLoadingMore, hasMore]);

  // ── Gallery derived data ──────────────────────────────────────────────────

  // Exclude personally hidden photos from all views
  const visiblePhotos = useMemo(
    () => galleryPhotos.filter(p => !hiddenPhotos.has(p.id)),
    [galleryPhotos, hiddenPhotos]
  );

  const currentPhotos = useMemo<PhotoItem[]>(() => {
    if (activeTab === 'highlights')
      return [...visiblePhotos]
        .sort((a, b) => (getParticipant(b.participants)?.upload_count ?? 0) - (getParticipant(a.participants)?.upload_count ?? 0))
        .slice(0, Math.max(1, Math.ceil(visiblePhotos.length * 0.2)));
    if (activeTab === 'my')
      return visiblePhotos.filter(p => p.participant_id === participant?.id);
    if (activeTab === 'memories')
      return visiblePhotos.filter(p => memories.has(p.id));
    return visiblePhotos;
  }, [visiblePhotos, activeTab, participant, memories]);

  const leftPhotos  = useMemo(() => currentPhotos.filter((_, i) => i % 2 === 0), [currentPhotos]);
  const rightPhotos = useMemo(() => currentPhotos.filter((_, i) => i % 2 === 1), [currentPhotos]);

  // ── Heart (personal memories) ─────────────────────────────────────────────

  const toggleMemory = useCallback(async (photoId: string) => {
    if (!participant || !event) return;
    setMemoryLoading(prev => new Set(prev).add(photoId));

    const next = new Set(memories);
    if (next.has(photoId)) next.delete(photoId);
    else next.add(photoId);
    setMemories(next);

    await supabase.from('personal_memories').upsert({
      event_id:       event.id,
      participant_id: participant.id,
      photo_ids:      Array.from(next),
    }, { onConflict: 'event_id,participant_id' });

    setMemoryLoading(prev => { const s = new Set(prev); s.delete(photoId); return s; });
  }, [participant, event, memories]);

  // ── Hide photo (personal view only — never permanently deletes) ──────────

  const hidePhoto = useCallback((photoId: string) => {
    Alert.alert(
      'Hide Photo',
      'Hide this from your view? Other guests still see it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Hide',
          style: 'destructive',
          onPress: async () => {
            const next = new Set(hiddenPhotos);
            next.add(photoId);
            setHiddenPhotos(next);

            if (participant && event) {
              await supabase.from('personal_memories').upsert({
                event_id:         event.id,
                participant_id:   participant.id,
                hidden_photo_ids: Array.from(next),
              }, { onConflict: 'event_id,participant_id' });
            }
          },
        },
      ]
    );
  }, [participant, event, hiddenPhotos]);

  // ── Download helpers ──────────────────────────────────────────────────────

  const downloadPhoto = async (url: string) => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Allow gallery access to save photos.'); return; }
      const fn = `guestful_${Date.now()}.jpg`;
      await FileSystem.downloadAsync(url, `${FileSystem.documentDirectory}${fn}`);
      await MediaLibrary.saveToLibraryAsync(`${FileSystem.documentDirectory}${fn}`);
      Alert.alert('Saved!', 'Photo saved to your gallery.');
    } catch { Alert.alert('Error', 'Could not save photo.'); }
  };

  const downloadAll = async () => {
    if (!event) return;
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow gallery access to save photos.'); return; }
    const { data: all } = await supabase
      .from('photos').select('url').eq('event_id', event.id).eq('is_deleted', false);
    if (!all?.length) return;
    setSavingProgress({ c: 0, t: all.length });
    let saved = 0;
    for (const photo of all) {
      try {
        const fn = `guestful_${Date.now()}.jpg`;
        await FileSystem.downloadAsync(photo.url, `${FileSystem.documentDirectory}${fn}`);
        await MediaLibrary.saveToLibraryAsync(`${FileSystem.documentDirectory}${fn}`);
        saved++;
        setSavingProgress({ c: saved, t: all.length });
      } catch { /* continue */ }
    }
    setSavingProgress(null);
    Alert.alert('Done!', `Saved ${saved} of ${all.length} photos.`);
  };

  const downloadMemories = async () => {
    if (!memories.size) { Alert.alert('No memories', 'Heart some photos first.'); return; }
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow gallery access to save photos.'); return; }
    const toSave = galleryPhotos.filter(p => memories.has(p.id));
    setSavingProgress({ c: 0, t: toSave.length });
    let saved = 0;
    for (const photo of toSave) {
      try {
        const fn = `guestful_mem_${Date.now()}.jpg`;
        await FileSystem.downloadAsync(photo.url, `${FileSystem.documentDirectory}${fn}`);
        await MediaLibrary.saveToLibraryAsync(`${FileSystem.documentDirectory}${fn}`);
        saved++;
        setSavingProgress({ c: saved, t: toSave.length });
      } catch { /* continue */ }
    }
    setSavingProgress(null);
    Alert.alert('Done!', `Saved ${saved} memory photo${saved !== 1 ? 's' : ''}.`);
  };

  const openLightbox = (globalIdx: number) => {
    setLightboxIndex(globalIdx);
    setLightboxVisible(true);
    setTimeout(() => {
      lightboxRef.current?.scrollToIndex({ index: globalIdx, animated: false });
    }, 50);
  };

  // ── Guards ────────────────────────────────────────────────────────────────

  if (!fontsLoaded || screenState === 'loading') {
    return (
      <View style={[s.root, s.center]}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator color={GOLD} size="large" />
      </View>
    );
  }

  // ── STATE 1 — WAITING ─────────────────────────────────────────────────────

  if (screenState === 'waiting') {
    return (
      <ScrollView style={s.root} contentContainerStyle={s.waitContent} showsVerticalScrollIndicator={false}>
        <StatusBar barStyle="light-content" />
        <View style={s.logoArea}><Logo /></View>

        <Animated.Text style={[s.filmIcon, { transform: [{ scale: pulseScale }] }]}>🎞</Animated.Text>
        <Text style={s.waitEventName}>{event?.title}</Text>
        <Text style={s.waitSubtitle}>Your film is developing...</Text>

        <View style={s.cdRow}>
          <CdBox value={String(countdown.d)} label="d" />
          <Text style={s.cdSep}>:</Text>
          <CdBox value={pad(countdown.h)} label="h" />
          <Text style={s.cdSep}>:</Text>
          <CdBox value={pad(countdown.m)} label="m" />
          <Text style={s.cdSep}>:</Text>
          <CdBox value={pad(countdown.s)} label="s" />
        </View>

        <Text style={s.statsText}>
          {guestCount} guest{guestCount !== 1 ? 's' : ''} have uploaded {photoCount} photo{photoCount !== 1 ? 's' : ''}
        </Text>

        {guestNames.length > 0 && (
          <View style={s.avatarRow}>
            {guestNames.map((name, i) => (
              <View key={i} style={[s.avatar, { backgroundColor: AVATAR_COLORS[i % AVATAR_COLORS.length] }]}>
                <Text style={s.avatarText}>{name.charAt(0).toUpperCase()}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={s.waitDivider} />
        <Text style={s.waitNote}>We'll notify you when the gallery opens.</Text>
        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  // ── STATE 2 — GALLERY READY (Watch Reveal) ────────────────────────────────

  if (screenState === 'reveal_ready') {
    return (
      <View style={[s.root, s.center]}>
        <StatusBar barStyle="light-content" />

        <Animated.Text style={[s.filmIcon, { transform: [{ scale: pulseScale }] }]}>🎞</Animated.Text>
        <Text style={s.revReadyTitle}>Your gallery is ready</Text>
        <Text style={s.revReadyEvent}>{event?.title}</Text>
        <Text style={s.revReadyCount}>{totalPhotos || photoCount} photos</Text>

        <TouchableOpacity
          style={s.watchRevealBtn}
          onPress={() => { setSlideshowDone(false); setScreenState('slideshow'); }}
          activeOpacity={0.85}
        >
          <Text style={s.watchRevealBtnText}>Watch the Reveal 🎞</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={openGallery} activeOpacity={0.7} style={{ marginTop: 16 }}>
          <Text style={s.skipToGallery}>Or scroll to gallery →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── STATE 3 — SLIDESHOW ───────────────────────────────────────────────────

  if (screenState === 'slideshow') {
    if (slideshowDone) {
      return (
        <SlideshowDone
          photoCount={totalPhotos || photoCount}
          guestCount={guestCount}
          onWatchAgain={() => setSlideshowDone(false)}
          onOpenGallery={openGallery}
        />
      );
    }
    return (
      <SlideshowPlayer
        photos={allPhotos}
        participantId={participant?.id ?? ''}
        onDone={() => setSlideshowDone(true)}
      />
    );
  }

  // ── STATE 4 — GALLERY ─────────────────────────────────────────────────────

  const TABS: { key: GalleryTab; label: string }[] = [
    { key: 'all',       label: 'All Photos' },
    { key: 'my',        label: 'My Shots' },
    { key: 'memories',  label: `My Memories${memories.size ? ` (${memories.size})` : ''}` },
    { key: 'highlights',label: 'Highlights' },
  ];

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      {/* Top bar */}
      <View style={s.galTopBar}>
        <View style={{ flex: 1 }}>
          <Text style={s.galEventName} numberOfLines={1}>{event?.title}</Text>
          {expiresWarning && (
            <TouchableOpacity
              onPress={() => Alert.alert(
                'Gallery expires',
                `Download your photos before ${event?.expires_at ? fmtDate(event.expires_at) : 'expiry'}. After this date all photos will be permanently deleted.`
              )}
            >
              <View style={s.expiryPill}>
                <Text style={s.expiryText}>⚠ Gallery expires {expiresWarning}</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
        <Text style={s.galPhotoCount}>{totalPhotos} photos</Text>
        <TouchableOpacity style={s.dlAllBtn} onPress={downloadAll}>
          <Text style={s.dlAllIcon}>⬇️</Text>
        </TouchableOpacity>
      </View>

      {/* Saving progress banner */}
      {savingProgress && (
        <View style={s.savingBanner}>
          <Text style={s.savingText}>Saving {savingProgress.c} of {savingProgress.t}...</Text>
        </View>
      )}

      {/* Tab bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.tabBarScroll}
        contentContainerStyle={s.tabBarContent}
      >
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[s.tab, activeTab === tab.key && s.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[s.tabText, activeTab === tab.key && s.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Download My Memories button */}
      {activeTab === 'memories' && memories.size > 0 && (
        <TouchableOpacity style={s.dlMemBtn} onPress={downloadMemories} activeOpacity={0.82}>
          <Text style={s.dlMemBtnText}>⬇ Download My Memories ({memories.size} photos)</Text>
        </TouchableOpacity>
      )}

      {/* Masonry grid */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.masonryContent}
        showsVerticalScrollIndicator={false}
        onScroll={e => {
          const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
          if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 300) loadMore();
        }}
        scrollEventThrottle={400}
      >
        {currentPhotos.length === 0 ? (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>
              {activeTab === 'memories' ? '🤍' : '📷'}
            </Text>
            <Text style={s.emptyText}>
              {activeTab === 'memories'
                ? 'Heart photos to save them to your memories.'
                : activeTab === 'my'
                ? "You haven't uploaded any photos yet."
                : 'No photos yet.'}
            </Text>
          </View>
        ) : (
          <View style={s.masonryRow}>
            {/* Left column */}
            <View style={s.masonryCol}>
              {leftPhotos.map((photo, i) => {
                const h = Math.round(COL_W * L_RATIOS[i % L_RATIOS.length]);
                const isOwn = photo.participant_id === participant?.id;
                const inMem = memories.has(photo.id);
                return (
                  <View key={photo.id} style={[s.masonryCell, { height: h + 28 }]}>
                    <TouchableOpacity
                      style={{ flex: 1 }}
                      onPress={() => openLightbox(i * 2)}
                      activeOpacity={0.9}
                    >
                      <Image source={{ uri: photo.url }} style={[s.masonryCellImg, { height: h }]} />
                    </TouchableOpacity>

                    {/* Contributor name + actions row */}
                    <View style={s.photoMeta}>
                      <Text style={s.photoMetaName} numberOfLines={1}>
                        {getParticipant(photo.participants)?.name ?? ''}
                      </Text>
                      <View style={s.photoMetaActions}>
                        {/* Heart */}
                        <TouchableOpacity
                          onPress={() => toggleMemory(photo.id)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={[s.heartIcon, inMem && s.heartActive]}>
                            {inMem ? '♥' : '♡'}
                          </Text>
                        </TouchableOpacity>
                        {/* Hide from personal view */}
                        <TouchableOpacity
                          onPress={() => hidePhoto(photo.id)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={s.deleteIcon}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Right column */}
            <View style={[s.masonryCol, { marginLeft: 2 }]}>
              {rightPhotos.map((photo, i) => {
                const h = Math.round(COL_W * R_RATIOS[i % R_RATIOS.length]);
                const isOwn = photo.participant_id === participant?.id;
                const inMem = memories.has(photo.id);
                return (
                  <View key={photo.id} style={[s.masonryCell, { height: h + 28 }]}>
                    <TouchableOpacity
                      style={{ flex: 1 }}
                      onPress={() => openLightbox(i * 2 + 1)}
                      activeOpacity={0.9}
                    >
                      <Image source={{ uri: photo.url }} style={[s.masonryCellImg, { height: h }]} />
                    </TouchableOpacity>
                    <View style={s.photoMeta}>
                      <Text style={s.photoMetaName} numberOfLines={1}>
                        {getParticipant(photo.participants)?.name ?? ''}
                      </Text>
                      <View style={s.photoMetaActions}>
                        {activeTab === 'all' && (
                          <TouchableOpacity
                            onPress={() => toggleMemory(photo.id)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Text style={[s.heartIcon, inMem && s.heartActive]}>
                              {inMem ? '♥' : '♡'}
                            </Text>
                          </TouchableOpacity>
                        )}
                        {isOwn && (
                          <TouchableOpacity
                            onPress={() => deletePhoto(photo)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Text style={s.deleteIcon}>✕</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {isLoadingMore && (
          <ActivityIndicator color={GOLD} size="small" style={{ marginVertical: 16 }} />
        )}
        {hasMore && !isLoadingMore && currentPhotos.length > 0 && (
          <TouchableOpacity style={s.loadMoreBtn} onPress={loadMore}>
            <Text style={s.loadMoreText}>Load more photos...</Text>
          </TouchableOpacity>
        )}
        <View style={{ height: BOT_PAD + 20 }} />
      </ScrollView>

      {/* Lightbox */}
      <Modal
        visible={lightboxVisible}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setLightboxVisible(false)}
      >
        <View style={s.lightboxRoot}>
          <FlatList
            ref={lightboxRef}
            horizontal
            pagingEnabled
            data={currentPhotos}
            keyExtractor={item => item.id}
            initialScrollIndex={lightboxIndex}
            getItemLayout={(_, index) => ({ length: SW, offset: SW * index, index })}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={e => {
              setLightboxIndex(Math.round(e.nativeEvent.contentOffset.x / SW));
            }}
            renderItem={({ item }) => (
              <View style={s.lightboxPage}>
                <Image source={{ uri: item.url }} style={s.lightboxImg} resizeMode="contain" />
              </View>
            )}
          />
          <TouchableOpacity style={s.lightboxClose} onPress={() => setLightboxVisible(false)}>
            <Text style={s.lightboxCloseText}>✕</Text>
          </TouchableOpacity>
          <View style={s.lightboxInfo}>
            <Text style={s.lightboxGuest}>
              📷 {getParticipant(currentPhotos[lightboxIndex]?.participants)?.name ?? ''}
            </Text>
            <Text style={s.lightboxCount}>{lightboxIndex + 1} / {currentPhotos.length}</Text>
          </View>
          <View style={s.lightboxActions}>
            <TouchableOpacity style={s.lightboxActionBtn}
              onPress={() => downloadPhoto(currentPhotos[lightboxIndex]?.url ?? '')}>
              <Text style={s.lightboxActionText}>⬇️ Save</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.lightboxActionBtn}
              onPress={() => Share.share({ message: currentPhotos[lightboxIndex]?.url ?? '' }).catch(() => {})}>
              <Text style={s.lightboxActionText}>↗️ Share</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: BG },
  center: { justifyContent: 'center', alignItems: 'center' },

  logoArea: { paddingTop: TOP_PAD, paddingBottom: 8, alignItems: 'center' },
  logoRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoDot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: GOLD },
  logoText: { fontSize: 11, letterSpacing: 3, color: WW, fontFamily: 'PlayfairDisplay_400Regular' },

  // STATE 1 — Waiting
  waitContent: { alignItems: 'center', paddingHorizontal: H_PAD, paddingBottom: 40 },
  filmIcon: { fontSize: 64, marginTop: 28, marginBottom: 12 },
  waitEventName: {
    fontSize: 26, color: WW, fontFamily: 'PlayfairDisplay_700Bold',
    textAlign: 'center', marginBottom: 8, lineHeight: 34,
  },
  waitSubtitle: { fontSize: 15, color: MUTED, marginBottom: 28 },

  cdRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 24 },
  cdBox:  {
    backgroundColor: GOLD_T, borderWidth: 1, borderColor: GOLD_B,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    alignItems: 'center', minWidth: 58,
  },
  cdVal:  { fontSize: 26, color: GOLD, fontFamily: 'PlayfairDisplay_700Bold', lineHeight: 32 },
  cdUnit: { fontSize: 10, color: MUTED, letterSpacing: 1, marginTop: 2 },
  cdSep:  { fontSize: 22, color: GOLD, fontFamily: 'PlayfairDisplay_700Bold', marginBottom: 8 },

  statsText: { fontSize: 13, color: MUTED, textAlign: 'center', marginBottom: 16 },
  avatarRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  avatar:    { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 14, color: WW, fontWeight: '700' },

  waitDivider: { width: '100%', height: StyleSheet.hairlineWidth, backgroundColor: BORDER, marginVertical: 20 },
  waitNote:    { fontSize: 13, color: MUTED, textAlign: 'center', marginBottom: 16, lineHeight: 20 },

  // STATE 2 — Reveal ready
  revReadyTitle: {
    fontSize: 28, color: WW, fontFamily: 'PlayfairDisplay_700Bold',
    textAlign: 'center', lineHeight: 36, marginBottom: 8, paddingHorizontal: H_PAD,
  },
  revReadyEvent: {
    fontSize: 20, color: GOLD, fontFamily: 'PlayfairDisplay_400Regular',
    fontStyle: 'italic', textAlign: 'center', marginBottom: 6,
  },
  revReadyCount: { fontSize: 14, color: MUTED, marginBottom: 36 },
  watchRevealBtn: {
    backgroundColor: GOLD, borderRadius: 14, paddingVertical: 18, paddingHorizontal: 44,
    ...Platform.select({
      ios:     { shadowColor: GOLD, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.45, shadowRadius: 12 },
      android: { elevation: 8 },
      default: {},
    }),
  },
  watchRevealBtnText: { fontSize: 18, fontFamily: 'PlayfairDisplay_700Bold', color: BG, letterSpacing: 0.5 },
  skipToGallery:      { fontSize: 14, color: MUTED, textDecorationLine: 'underline' },

  // STATE 4 — Gallery top bar
  galTopBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: TOP_PAD, paddingHorizontal: H_PAD, paddingBottom: 8,
    backgroundColor: BG,
  },
  galEventName:  { fontSize: 16, color: WW, fontFamily: 'PlayfairDisplay_700Bold' },
  galPhotoCount: { fontSize: 13, color: GOLD, fontFamily: 'PlayfairDisplay_400Regular', marginRight: 12 },
  dlAllBtn:      { padding: 6 },
  dlAllIcon:     { fontSize: 20 },

  expiryPill: {
    alignSelf: 'flex-start', marginTop: 4,
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderWidth: 1, borderColor: AMBER,
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3,
  },
  expiryText: { fontSize: 11, color: AMBER, fontFamily: 'PlayfairDisplay_400Regular' },

  savingBanner: {
    backgroundColor: GOLD_T, borderColor: GOLD_B,
    borderTopWidth: 1, borderBottomWidth: 1,
    paddingVertical: 8, alignItems: 'center',
  },
  savingText: { fontSize: 13, color: GOLD, fontFamily: 'PlayfairDisplay_400Regular' },

  tabBarScroll:   { flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  tabBarContent:  { flexDirection: 'row', backgroundColor: BG },
  tab:            { paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center' },
  tabActive:      { borderBottomWidth: 2, borderBottomColor: GOLD },
  tabText:        { fontSize: 13, color: MUTED },
  tabTextActive:  { color: GOLD, fontFamily: 'PlayfairDisplay_700Bold' },

  dlMemBtn: {
    margin: H_PAD, marginVertical: 10,
    backgroundColor: GOLD_T, borderWidth: 1, borderColor: GOLD_B,
    borderRadius: 10, paddingVertical: 12, alignItems: 'center',
  },
  dlMemBtnText: { fontSize: 13, color: GOLD, fontFamily: 'PlayfairDisplay_700Bold' },

  masonryContent: { paddingHorizontal: 0, paddingTop: 2 },
  masonryRow:     { flexDirection: 'row' },
  masonryCol:     { flex: 1 },
  masonryCell:    { marginBottom: 2, overflow: 'visible' },
  masonryCellImg: { width: '100%' },

  photoMeta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 6, paddingVertical: 4,
  },
  photoMetaName:    { flex: 1, fontSize: 11, color: GOLD, fontFamily: 'PlayfairDisplay_400Regular', letterSpacing: 0.2 },
  photoMetaActions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  heartIcon:        { fontSize: 16, color: MUTED },
  heartActive:      { color: GOLD },
  deleteIcon:       { fontSize: 13, color: MUTED, opacity: 0.6 },

  emptyState: { flex: 1, alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyIcon:  { fontSize: 40 },
  emptyText:  { fontSize: 14, color: MUTED, textAlign: 'center', paddingHorizontal: H_PAD, lineHeight: 22 },

  loadMoreBtn:  { alignItems: 'center', paddingVertical: 16 },
  loadMoreText: { fontSize: 13, color: MUTED },

  lightboxRoot: { flex: 1, backgroundColor: '#000' },
  lightboxPage: { width: SW, height: SH, justifyContent: 'center', alignItems: 'center' },
  lightboxImg:  { width: SW, height: SH },
  lightboxClose: {
    position: 'absolute', top: TOP_PAD, right: H_PAD,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center',
  },
  lightboxCloseText: { fontSize: 14, color: WW, fontWeight: '700' },
  lightboxInfo: {
    position: 'absolute', bottom: BOT_PAD + 72, left: H_PAD, right: H_PAD,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  lightboxGuest: { fontSize: 13, color: WW, fontFamily: 'PlayfairDisplay_400Regular' },
  lightboxCount: { fontSize: 12, color: MUTED },
  lightboxActions: {
    position: 'absolute', bottom: BOT_PAD + 16, left: H_PAD, right: H_PAD,
    flexDirection: 'row', gap: 12,
  },
  lightboxActionBtn: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 10, paddingVertical: 12, alignItems: 'center',
  },
  lightboxActionText: { fontSize: 14, color: WW },
});
