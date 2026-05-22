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
  Platform,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useFonts,
  PlayfairDisplay_400Regular,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
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
const H_PAD   = 24;
const COL_W   = Math.floor((SW - 2) / 2);           // masonry column width
const RCELL   = Math.floor((SW - 6) / 4);           // reveal grid cell
const REVEAL_N = 12;
const PAGE    = 30;

// Alternating height ratios for masonry columns
const L_RATIOS = [1.3, 0.95, 1.2, 0.85, 1.4, 1.0];
const R_RATIOS = [1.0, 1.25, 0.9, 1.35, 0.95, 1.15];
const AVATAR_COLORS = ['#C47C2A','#6B4E3D','#3D5A73','#4A5E3D','#6B3D5E'];

// ── Types ─────────────────────────────────────────────────────────────────────

type ScreenState = 'loading' | 'waiting' | 'reveal_anim' | 'gallery';
type GalleryTab  = 'all' | 'highlights' | 'my';

interface ParticipantData { id: string; event_id: string; name: string; }
interface EventData {
  id: string; title: string; aesthetic: string;
  reveal_time: string; status: string;
}
interface PhotoItem {
  id: string; url: string; participant_id: string; uploaded_at: string;
  participants: { name: string; upload_count: number } | null;
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
  const [revealPhotos, setRevealPhotos] = useState<PhotoItem[]>([]);
  const [showRevealBtn, setShowRevealBtn] = useState(false);

  // Gallery
  const [galleryPhotos, setGalleryPhotos] = useState<PhotoItem[]>([]);
  const [galleryPage, setGalleryPage]     = useState(0);
  const [hasMore, setHasMore]             = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [totalPhotos, setTotalPhotos]     = useState(0);
  const [activeTab, setActiveTab]         = useState<GalleryTab>('all');
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [lightboxIndex, setLightboxIndex]     = useState(0);
  const [savingProgress, setSavingProgress]   = useState<{c:number;t:number}|null>(null);
  const [deferredPrompt, setDeferredPrompt]   = useState<any>(null);

  // Animations
  const pulseScale = useRef(new Animated.Value(1)).current;
  const iconOp     = useRef(new Animated.Value(0)).current;
  const text1Op    = useRef(new Animated.Value(0)).current;
  const text2Op    = useRef(new Animated.Value(0)).current;
  const text3Op    = useRef(new Animated.Value(0)).current;
  const btnScale   = useRef(new Animated.Value(1)).current;
  const btnOp      = useRef(new Animated.Value(0)).current;
  const photoAnims = useRef(Array.from({length: REVEAL_N}, () => new Animated.Value(SH * 0.4))).current;
  const photoOps   = useRef(Array.from({length: REVEAL_N}, () => new Animated.Value(0))).current;

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
          .select('id, title, aesthetic, reveal_time, status')
          .eq('id', p.event_id)
          .single();
        if (!ev) return;
        setEvent(ev);

        if (ev.status === 'revealed') {
          await fetchGalleryPage(ev.id, 0);
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

  // ── PWA install prompt ────────────────────────────────────────────────────

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const h = (e: Event) => { e.preventDefault(); setDeferredPrompt(e); };
    (window as any).addEventListener('beforeinstallprompt', h);
    return () => (window as any).removeEventListener('beforeinstallprompt', h);
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
      setGuestNames(gs?.map(g => g.name) ?? []);
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
    setScreenState('reveal_anim');
    statsRef.current && clearInterval(statsRef.current);

    const { data: rp } = await supabase
      .from('photos')
      .select('id, url, participant_id, uploaded_at, participants(name, upload_count)')
      .eq('event_id', eventId)
      .order('uploaded_at', { ascending: false })
      .limit(REVEAL_N);
    if (rp) setRevealPhotos(rp as PhotoItem[]);

    // Reset
    [iconOp, text1Op, text2Op, text3Op, btnOp].forEach(a => a.setValue(0));
    btnScale.setValue(1);
    photoAnims.forEach(a => a.setValue(SH * 0.4));
    photoOps.forEach(a => a.setValue(0));

    // Sequence: icon → text1 → text2 → text3 → pause → photo flood → button
    Animated.sequence([
      Animated.delay(400),
      Animated.timing(iconOp,  { toValue: 1, duration: 1000, useNativeDriver: true }),
      Animated.timing(text1Op, { toValue: 1, duration: 500,  useNativeDriver: true }),
      Animated.timing(text2Op, { toValue: 1, duration: 500,  useNativeDriver: true }),
      Animated.timing(text3Op, { toValue: 1, duration: 500,  useNativeDriver: true }),
      Animated.delay(1000),
    ]).start(() => {
      photoAnims.forEach((anim, i) => {
        setTimeout(() => {
          Animated.parallel([
            Animated.spring(anim, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
            Animated.timing(photoOps[i], { toValue: 1, duration: 400, useNativeDriver: true }),
          ]).start();
        }, i * 80);
      });
      setTimeout(() => {
        setShowRevealBtn(true);
        Animated.timing(btnOp, { toValue: 1, duration: 400, useNativeDriver: true }).start(() => {
          Animated.loop(Animated.sequence([
            Animated.timing(btnScale, { toValue: 1.07, duration: 700, useNativeDriver: true }),
            Animated.timing(btnScale, { toValue: 1.0,  duration: 700, useNativeDriver: true }),
          ])).start();
        });
      }, REVEAL_N * 80 + 800);
    });
  }

  async function fetchGalleryPage(eventId: string, page: number) {
    setIsLoadingMore(true);
    const { data, count } = await supabase
      .from('photos')
      .select('id, url, participant_id, uploaded_at, participants(name, upload_count)', { count: 'exact' })
      .eq('event_id', eventId)
      .eq('is_revealed', true)
      .order('uploaded_at', { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (data) {
      const cast = data as PhotoItem[];
      setGalleryPhotos(prev => page === 0 ? cast : [...prev, ...cast]);
      if (count !== null) setTotalPhotos(count);
      setHasMore(data.length === PAGE);
    }
    setIsLoadingMore(false);
  }

  const openGallery = useCallback(async () => {
    if (!event) return;
    await fetchGalleryPage(event.id, 0);
    setScreenState('gallery');
  }, [event]);

  const loadMore = useCallback(async () => {
    if (!event || isLoadingMore || !hasMore) return;
    const next = galleryPage + 1;
    setGalleryPage(next);
    await fetchGalleryPage(event.id, next);
  }, [event, galleryPage, isLoadingMore, hasMore]);

  // Gallery derived data
  const currentPhotos = useMemo<PhotoItem[]>(() => {
    if (activeTab === 'highlights')
      return [...galleryPhotos]
        .sort((a, b) => (b.participants?.upload_count ?? 0) - (a.participants?.upload_count ?? 0))
        .slice(0, Math.max(1, Math.ceil(galleryPhotos.length * 0.2)));
    if (activeTab === 'my')
      return galleryPhotos.filter(p => p.participant_id === participant?.id);
    return galleryPhotos;
  }, [galleryPhotos, activeTab, participant]);

  const leftPhotos  = useMemo(() => currentPhotos.filter((_, i) => i % 2 === 0), [currentPhotos]);
  const rightPhotos = useMemo(() => currentPhotos.filter((_, i) => i % 2 === 1), [currentPhotos]);

  const openLightbox = (globalIdx: number) => {
    setLightboxIndex(globalIdx);
    setLightboxVisible(true);
    setTimeout(() => {
      lightboxRef.current?.scrollToIndex({ index: globalIdx, animated: false });
    }, 50);
  };

  const downloadPhoto = async (url: string) => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Allow gallery access to save photos.'); return; }
      const fn = `guestful_${Date.now()}.jpg`;
      await FileSystem.downloadAsync(url, `${FileSystem.cacheDirectory}${fn}`);
      await MediaLibrary.saveToLibraryAsync(`${FileSystem.cacheDirectory}${fn}`);
      Alert.alert('Saved!', 'Photo saved to your gallery.');
    } catch { Alert.alert('Error', 'Could not save photo.'); }
  };

  const downloadAll = async () => {
    if (!event) return;
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow gallery access to save photos.'); return; }
    const { data: all } = await supabase
      .from('photos').select('url').eq('event_id', event.id).eq('is_revealed', true);
    if (!all?.length) return;
    setSavingProgress({ c: 0, t: all.length });
    let saved = 0;
    for (const photo of all) {
      try {
        const fn = `guestful_${Date.now()}.jpg`;
        await FileSystem.downloadAsync(photo.url, `${FileSystem.cacheDirectory}${fn}`);
        await MediaLibrary.saveToLibraryAsync(`${FileSystem.cacheDirectory}${fn}`);
        saved++;
        setSavingProgress({ c: saved, t: all.length });
      } catch { /* continue */ }
    }
    setSavingProgress(null);
    Alert.alert('Done!', `Saved ${saved} of ${all.length} photos.`);
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
      <ScrollView
        style={s.root}
        contentContainerStyle={s.waitContent}
        showsVerticalScrollIndicator={false}
      >
        <StatusBar barStyle="light-content" />
        <View style={s.logoArea}><Logo /></View>

        {/* Pulsing 🎞 icon */}
        <Animated.Text style={[s.filmIcon, { transform: [{ scale: pulseScale }] }]}>
          🎞
        </Animated.Text>

        <Text style={s.waitEventName}>{event?.title}</Text>
        <Text style={s.waitSubtitle}>Your film is developing...</Text>

        {/* Countdown */}
        <View style={s.cdRow}>
          <CdBox value={String(countdown.d)} label="d" />
          <Text style={s.cdSep}>:</Text>
          <CdBox value={pad(countdown.h)} label="h" />
          <Text style={s.cdSep}>:</Text>
          <CdBox value={pad(countdown.m)} label="m" />
          <Text style={s.cdSep}>:</Text>
          <CdBox value={pad(countdown.s)} label="s" />
        </View>

        {/* Live stats */}
        <Text style={s.statsText}>
          {guestCount} guest{guestCount !== 1 ? 's' : ''} have uploaded {photoCount} photo{photoCount !== 1 ? 's' : ''}
        </Text>

        {/* Guest avatars */}
        {guestNames.length > 0 && (
          <View style={s.avatarRow}>
            {guestNames.map((name, i) => (
              <View
                key={i}
                style={[s.avatar, { backgroundColor: AVATAR_COLORS[i % AVATAR_COLORS.length] }]}
              >
                <Text style={s.avatarText}>{name.charAt(0).toUpperCase()}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={s.waitDivider} />

        <Text style={s.waitNote}>We'll notify you when the gallery opens.</Text>

        {/* Add to Home Screen */}
        <TouchableOpacity
          style={s.addHomeBtn}
          onPress={async () => {
            if (deferredPrompt) { deferredPrompt.prompt(); await deferredPrompt.userChoice; setDeferredPrompt(null); }
          }}
        >
          <Text style={s.addHomeBtnText}>Add to Home Screen</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  // ── STATE 2 — REVEAL ANIMATION ────────────────────────────────────────────

  if (screenState === 'reveal_anim') {
    return (
      <View style={[s.root, { backgroundColor: '#000' }]}>
        <StatusBar barStyle="light-content" hidden />

        {/* Text section */}
        <View style={s.revealTextSection}>
          <Animated.Text style={[s.revealFilmIcon, { opacity: iconOp }]}>🎞</Animated.Text>
          <Animated.Text style={[s.revealText1, { opacity: text1Op }]}>
            Your gallery is ready.
          </Animated.Text>
          <Animated.Text style={[s.revealText2, { opacity: text2Op }]}>
            {event?.title}
          </Animated.Text>
          <Animated.Text style={[s.revealText3, { opacity: text3Op }]}>
            Every angle. Every guest. One gallery.
          </Animated.Text>
        </View>

        {/* Photo flood grid — 4 cols × 3 rows */}
        <View style={s.revealGrid}>
          {Array.from({ length: 3 }).map((_, row) => (
            <View key={row} style={s.revealRow}>
              {Array.from({ length: 4 }).map((_, col) => {
                const idx = row * 4 + col;
                const photo = revealPhotos[idx];
                return (
                  <Animated.View
                    key={col}
                    style={[
                      s.revealCell,
                      {
                        opacity: photoOps[idx],
                        transform: [{ translateY: photoAnims[idx] }],
                      },
                    ]}
                  >
                    {photo ? (
                      <Image source={{ uri: photo.url }} style={s.revealCellImg} />
                    ) : (
                      <View style={[s.revealCellImg, { backgroundColor: '#1A1208' }]} />
                    )}
                  </Animated.View>
                );
              })}
            </View>
          ))}
        </View>

        {/* Open Gallery button */}
        {showRevealBtn && (
          <View style={s.revealBtnWrap}>
            <Animated.View style={{ opacity: btnOp, transform: [{ scale: btnScale }] }}>
              <TouchableOpacity style={s.openGalleryBtn} onPress={openGallery} activeOpacity={0.85}>
                <Text style={s.openGalleryBtnText}>Open Gallery →</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        )}
      </View>
    );
  }

  // ── STATE 3 — GALLERY ─────────────────────────────────────────────────────

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      {/* Top bar */}
      <View style={s.galTopBar}>
        <Text style={s.galEventName} numberOfLines={1}>{event?.title}</Text>
        <Text style={s.galPhotoCount}>{totalPhotos} photos</Text>
        <TouchableOpacity style={s.dlAllBtn} onPress={downloadAll}>
          <Text style={s.dlAllIcon}>⬇️</Text>
        </TouchableOpacity>
      </View>

      {/* Saving progress banner */}
      {savingProgress && (
        <View style={s.savingBanner}>
          <Text style={s.savingText}>
            Saving {savingProgress.c} of {savingProgress.t}...
          </Text>
        </View>
      )}

      {/* Tab bar */}
      <View style={s.tabBar}>
        {(['all', 'highlights', 'my'] as GalleryTab[]).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[s.tab, activeTab === tab && s.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[s.tabText, activeTab === tab && s.tabTextActive]}>
              {tab === 'all' ? 'All Photos' : tab === 'highlights' ? 'Highlights' : 'My Shots'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Masonry grid */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.masonryContent}
        showsVerticalScrollIndicator={false}
        onScroll={e => {
          const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
          if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 300) {
            loadMore();
          }
        }}
        scrollEventThrottle={400}
      >
        {currentPhotos.length === 0 ? (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>📷</Text>
            <Text style={s.emptyText}>
              {activeTab === 'my' ? "You haven't uploaded any photos yet." : 'No photos yet.'}
            </Text>
          </View>
        ) : (
          <View style={s.masonryRow}>
            {/* Left column */}
            <View style={s.masonryCol}>
              {leftPhotos.map((photo, i) => {
                const h = Math.round(COL_W * L_RATIOS[i % L_RATIOS.length]);
                return (
                  <TouchableOpacity
                    key={photo.id}
                    style={[s.masonryCell, { height: h }]}
                    onPress={() => openLightbox(i * 2)}
                    activeOpacity={0.9}
                  >
                    <Image source={{ uri: photo.url }} style={s.masonryCellImg} />
                  </TouchableOpacity>
                );
              })}
            </View>
            {/* Right column */}
            <View style={[s.masonryCol, { marginLeft: 2 }]}>
              {rightPhotos.map((photo, i) => {
                const h = Math.round(COL_W * R_RATIOS[i % R_RATIOS.length]);
                return (
                  <TouchableOpacity
                    key={photo.id}
                    style={[s.masonryCell, { height: h }]}
                    onPress={() => openLightbox(i * 2 + 1)}
                    activeOpacity={0.9}
                  >
                    <Image source={{ uri: photo.url }} style={s.masonryCellImg} />
                  </TouchableOpacity>
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
        <View style={{ height: 32 }} />
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

          {/* Close */}
          <TouchableOpacity style={s.lightboxClose} onPress={() => setLightboxVisible(false)}>
            <Text style={s.lightboxCloseText}>✕</Text>
          </TouchableOpacity>

          {/* Info bar */}
          <View style={s.lightboxInfo}>
            <Text style={s.lightboxGuest}>
              📷 {currentPhotos[lightboxIndex]?.participants?.name ?? ''}
            </Text>
            <Text style={s.lightboxCount}>
              {lightboxIndex + 1} / {currentPhotos.length}
            </Text>
          </View>

          {/* Action buttons */}
          <View style={s.lightboxActions}>
            <TouchableOpacity
              style={s.lightboxActionBtn}
              onPress={() => downloadPhoto(currentPhotos[lightboxIndex]?.url ?? '')}
            >
              <Text style={s.lightboxActionText}>⬇️ Save</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.lightboxActionBtn}
              onPress={() => Share.share({ message: currentPhotos[lightboxIndex]?.url ?? '' }).catch(() => {})}
            >
              <Text style={s.lightboxActionText}>↗️ Share</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const TOP_PAD = Platform.OS === 'ios' ? 52 : 36;
const BOT_PAD = Platform.OS === 'ios' ? 34 : 20;

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: BG },
  center: { justifyContent: 'center', alignItems: 'center' },

  // Logo
  logoArea: { paddingTop: TOP_PAD, paddingBottom: 8, alignItems: 'center' },
  logoRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoDot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: GOLD },
  logoText: { fontSize: 11, letterSpacing: 3, color: WW, fontFamily: 'PlayfairDisplay_400Regular' },

  // STATE 1 — Waiting
  waitContent: { alignItems: 'center', paddingHorizontal: H_PAD, paddingBottom: 40 },
  filmIcon: { fontSize: 64, marginTop: 28, marginBottom: 12 },
  waitEventName: {
    fontSize: 26,
    color: WW,
    fontFamily: 'PlayfairDisplay_700Bold',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 34,
  },
  waitSubtitle: { fontSize: 15, color: MUTED, marginBottom: 28 },

  // Countdown
  cdRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 24 },
  cdBox:  {
    backgroundColor: GOLD_T,
    borderWidth: 1,
    borderColor: GOLD_B,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    minWidth: 58,
  },
  cdVal:  { fontSize: 26, color: GOLD, fontFamily: 'PlayfairDisplay_700Bold', lineHeight: 32 },
  cdUnit: { fontSize: 10, color: MUTED, letterSpacing: 1, marginTop: 2 },
  cdSep:  { fontSize: 22, color: GOLD, fontFamily: 'PlayfairDisplay_700Bold', marginBottom: 8 },

  // Stats + avatars
  statsText: { fontSize: 13, color: MUTED, textAlign: 'center', marginBottom: 16 },
  avatarRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  avatar:    { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 14, color: WW, fontWeight: '700' },

  waitDivider: { width: '100%', height: StyleSheet.hairlineWidth, backgroundColor: BORDER, marginVertical: 20 },
  waitNote:    { fontSize: 13, color: MUTED, textAlign: 'center', marginBottom: 16, lineHeight: 20 },

  addHomeBtn: {
    borderWidth: 1,
    borderColor: GOLD,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  addHomeBtnText: { fontSize: 13, color: GOLD, fontFamily: 'PlayfairDisplay_700Bold' },

  // STATE 2 — Reveal animation
  revealTextSection: {
    alignItems: 'center',
    paddingTop: TOP_PAD + 16,
    paddingHorizontal: H_PAD,
    paddingBottom: 16,
    gap: 10,
  },
  revealFilmIcon: { fontSize: 56 },
  revealText1: {
    fontSize: 24,
    color: WW,
    fontFamily: 'PlayfairDisplay_700Bold',
    textAlign: 'center',
  },
  revealText2: {
    fontSize: 18,
    color: GOLD,
    fontFamily: 'PlayfairDisplay_400Regular',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  revealText3: { fontSize: 13, color: MUTED, textAlign: 'center', lineHeight: 20 },

  revealGrid: { paddingHorizontal: 2, gap: 2 },
  revealRow:  { flexDirection: 'row', gap: 2 },
  revealCell: { width: RCELL, height: RCELL * 1.1, borderRadius: 4, overflow: 'hidden' },
  revealCellImg: { width: '100%', height: '100%' },

  revealBtnWrap: { position: 'absolute', bottom: BOT_PAD + 16, left: 0, right: 0, alignItems: 'center' },
  openGalleryBtn: {
    backgroundColor: GOLD,
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 44,
    ...Platform.select({
      ios:     { shadowColor: GOLD, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.45, shadowRadius: 12 },
      android: { elevation: 8 },
      default: {},
    }),
  },
  openGalleryBtnText: {
    fontSize: 17,
    fontFamily: 'PlayfairDisplay_700Bold',
    color: BG,
    letterSpacing: 0.5,
  },

  // STATE 3 — Gallery
  galTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: TOP_PAD,
    paddingHorizontal: H_PAD,
    paddingBottom: 12,
    backgroundColor: BG,
  },
  galEventName:  { flex: 1, fontSize: 16, color: WW, fontFamily: 'PlayfairDisplay_700Bold' },
  galPhotoCount: { fontSize: 13, color: GOLD, fontFamily: 'PlayfairDisplay_400Regular', marginRight: 12 },
  dlAllBtn:      { padding: 6 },
  dlAllIcon:     { fontSize: 20 },

  savingBanner: {
    backgroundColor: GOLD_T,
    borderColor: GOLD_B,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: 8,
    alignItems: 'center',
  },
  savingText: { fontSize: 13, color: GOLD, fontFamily: 'PlayfairDisplay_400Regular' },

  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
    backgroundColor: BG,
  },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: GOLD },
  tabText:        { fontSize: 13, color: MUTED },
  tabTextActive:  { color: GOLD, fontFamily: 'PlayfairDisplay_700Bold' },

  masonryContent: { paddingHorizontal: 0, paddingTop: 2 },
  masonryRow:     { flexDirection: 'row' },
  masonryCol:     { flex: 1 },
  masonryCell:    { marginBottom: 2, overflow: 'hidden' },
  masonryCellImg: { width: '100%', height: '100%' },

  emptyState: { flex: 1, alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyIcon:  { fontSize: 40 },
  emptyText:  { fontSize: 14, color: MUTED, textAlign: 'center' },

  loadMoreBtn: { alignItems: 'center', paddingVertical: 16 },
  loadMoreText: { fontSize: 13, color: MUTED },

  // Lightbox
  lightboxRoot: { flex: 1, backgroundColor: '#000' },
  lightboxPage: { width: SW, height: SH, justifyContent: 'center', alignItems: 'center' },
  lightboxImg:  { width: SW, height: SH },

  lightboxClose: {
    position: 'absolute',
    top: TOP_PAD,
    right: H_PAD,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxCloseText: { fontSize: 14, color: WW, fontWeight: '700' },

  lightboxInfo: {
    position: 'absolute',
    bottom: BOT_PAD + 72,
    left: H_PAD,
    right: H_PAD,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lightboxGuest: { fontSize: 13, color: WW, fontFamily: 'PlayfairDisplay_400Regular' },
  lightboxCount: { fontSize: 12, color: MUTED },

  lightboxActions: {
    position: 'absolute',
    bottom: BOT_PAD + 16,
    left: H_PAD,
    right: H_PAD,
    flexDirection: 'row',
    gap: 12,
  },
  lightboxActionBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  lightboxActionText: { fontSize: 14, color: WW },
});
