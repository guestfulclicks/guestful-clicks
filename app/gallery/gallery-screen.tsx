import React, {
  useCallback, useEffect, useRef, useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
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
const CELL     = Math.floor((SW - 4) / 3);
const BG       = '#0C0904';
const WW       = '#F0E8D5';
const GOLD     = '#D4A853';
const MUTED    = 'rgba(240,232,213,0.5)';
const BORDER   = 'rgba(240,232,213,0.12)';
const GOLD_T   = 'rgba(212,168,83,0.08)';
const GOLD_B   = 'rgba(212,168,83,0.25)';
const GREEN    = '#4CAF50';
const H_PAD    = 24;
const PART_KEY = '@candid_participant';

// ── Types ─────────────────────────────────────────────────────────────────────

type ScreenState = 'loading' | 'my_shots' | 'revealed';

interface ParticipantData {
  id: string;
  event_id: string;
  name: string;
  shot_limit: number;
}

interface EventData {
  id: string;
  title: string;
  reveal_time: string;
  status: 'active' | 'revealed' | 'archived';
  invitation_card: string | null;
}

interface PhotoItem {
  id: string;
  url: string;
  uploaded_at: string;
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

function pad(n: number): string { return String(n).padStart(2, '0'); }

function fmtReveal(iso: string): string {
  if (!iso) return '—';
  const dt = new Date(iso);
  const M  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const h  = dt.getHours(), min = dt.getMinutes();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${dt.getDate()} ${M[dt.getMonth()]}, ${h12}:${pad(min)} ${h >= 12 ? 'PM' : 'AM'}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Logo() {
  return (
    <View style={sc.logoRow}>
      <View style={sc.logoDot} />
      <Text style={sc.logoText}>CANDID CLICKS</Text>
    </View>
  );
}

function CountdownBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={sc.cdBox}>
      <Text style={sc.cdValue}>{value}</Text>
      <Text style={sc.cdLabel}>{label}</Text>
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function GalleryScreen() {
  const [fontsLoaded] = useFonts({ PlayfairDisplay_400Regular, PlayfairDisplay_700Bold });
  const serif     = fontsLoaded ? 'PlayfairDisplay_400Regular' : undefined;
  const serifBold = fontsLoaded ? 'PlayfairDisplay_700Bold'    : undefined;

  const [screenState, setScreenState] = useState<ScreenState>('loading');
  const [participant, setParticipant] = useState<ParticipantData | null>(null);
  const [event, setEvent]             = useState<EventData | null>(null);
  const [photos, setPhotos]           = useState<PhotoItem[]>([]);
  const [countdown, setCountdown]     = useState<Countdown>({ d: 0, h: 0, m: 0, s: 0 });
  const [deleting, setDeleting]       = useState<string | null>(null);

  const cdTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef  = useRef<any>(null);

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    loadData();
    return () => {
      cdTimerRef.current  && clearInterval(cdTimerRef.current);
      channelRef.current  && supabase.removeChannel(channelRef.current);
    };
  }, []);

  // ── Countdown timer ───────────────────────────────────────────────────────

  useEffect(() => {
    cdTimerRef.current && clearInterval(cdTimerRef.current);
    if (!event || event.status !== 'active') return;
    const tick = () => setCountdown(calcCountdown(event.reveal_time));
    tick();
    cdTimerRef.current = setInterval(tick, 1000);
    return () => { cdTimerRef.current && clearInterval(cdTimerRef.current); };
  }, [event]);

  // ── Data loader ───────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    const raw = await AsyncStorage.getItem(PART_KEY);
    if (!raw) { router.replace('/guest/join' as any); return; }

    let part: ParticipantData;
    try { part = JSON.parse(raw); } catch { router.replace('/guest/join' as any); return; }
    setParticipant(part);

    // Load event
    const { data: ev } = await supabase
      .from('events')
      .select('id, title, reveal_time, status, invitation_card')
      .eq('id', part.event_id)
      .single();

    if (!ev) { setScreenState('my_shots'); return; }
    setEvent(ev as EventData);

    // Load participant's own photos
    await loadPhotos(part.id);

    if (ev.status === 'revealed') {
      setScreenState('revealed');
    } else {
      setScreenState('my_shots');
      subscribeToReveal(ev.id);
    }
  }, []);

  async function loadPhotos(participantId: string) {
    const { data } = await supabase
      .from('photos')
      .select('id, url, uploaded_at')
      .eq('participant_id', participantId)
      .order('uploaded_at', { ascending: false });
    setPhotos((data ?? []) as PhotoItem[]);
  }

  function subscribeToReveal(eventId: string) {
    channelRef.current && supabase.removeChannel(channelRef.current);
    const ch = supabase
      .channel(`gallery-ev-${eventId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'events', filter: `id=eq.${eventId}` },
        (payload: any) => {
          if (payload.new?.status === 'revealed') {
            setEvent(prev => prev ? { ...prev, status: 'revealed' } : prev);
            setScreenState('revealed');
          }
        })
      .subscribe();
    channelRef.current = ch;
  }

  // ── Delete photo ──────────────────────────────────────────────────────────

  const handleDeletePhoto = (photo: PhotoItem) => {
    Alert.alert(
      'Delete this photo?',
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(photo.id);
            try {
              // Extract storage path from URL (path after /storage/v1/object/public/)
              const urlParts = photo.url.split('/storage/v1/object/public/event-photos/');
              if (urlParts[1]) {
                await supabase.storage.from('event-photos').remove([urlParts[1]]);
              }
              await supabase.from('photos').delete().eq('id', photo.id);
              // Decrement upload_count
              if (participant) {
                const { data: row } = await supabase
                  .from('participants').select('upload_count').eq('id', participant.id).single();
                if (row) {
                  await supabase.from('participants')
                    .update({ upload_count: Math.max(0, (row.upload_count ?? 1) - 1) })
                    .eq('id', participant.id);
                }
              }
              setPhotos(prev => prev.filter(p => p.id !== photo.id));
            } finally {
              setDeleting(null);
            }
          },
        },
      ]
    );
  };

  // ── Guards ────────────────────────────────────────────────────────────────

  if (!fontsLoaded || screenState === 'loading') {
    return (
      <View style={[sc.root, sc.center]}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator color={GOLD} size="large" />
      </View>
    );
  }

  const shotsUsed = photos.length;
  const shotLimit = participant?.shot_limit ?? 0;
  const shotsLeft = Math.max(0, shotLimit - shotsUsed);

  // ── STATE: REVEALED — redirect to full gallery ────────────────────────────

  if (screenState === 'revealed') {
    return (
      <View style={[sc.root, sc.center, { paddingHorizontal: H_PAD }]}>
        <StatusBar barStyle="light-content" />

        <Text style={sc.revealedIcon}>✦</Text>
        <Text style={[sc.revealedTitle, { fontFamily: serifBold }]}>The film is revealed!</Text>
        <Text style={[sc.revealedBody, { fontFamily: serif }]}>
          {event?.title ? `"${event.title}"` : 'The gallery'} is now open.
        </Text>

        <TouchableOpacity
          style={sc.viewBtn}
          onPress={() => router.replace('/gallery/reveal-screen' as any)}
          activeOpacity={0.85}
        >
          <Text style={[sc.viewBtnText, { fontFamily: serifBold }]}>View Full Gallery →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── STATE: MY SHOTS ───────────────────────────────────────────────────────

  const showCountdown = !!(event && event.status === 'active');

  return (
    <View style={sc.root}>
      <StatusBar barStyle="light-content" />

      {/* Top bar */}
      <View style={sc.topBar}>
        <TouchableOpacity
          style={sc.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={sc.backArrow}>←</Text>
        </TouchableOpacity>
        <Logo />
        <View style={sc.backBtn} />
      </View>

      {/* Event title + shot counter */}
      <View style={[sc.infoBar, { borderBottomColor: BORDER }]}>
        <View style={sc.infoLeft}>
          <Text style={[sc.eventTitle, { fontFamily: serifBold }]} numberOfLines={1}>
            {event?.title ?? 'My Shots'}
          </Text>
          <Text style={[sc.shotCount, { fontFamily: serif }]}>
            <Text style={{ color: GOLD }}>{shotsUsed}</Text>
            {` / ${shotLimit} shots used`}
          </Text>
        </View>
        {shotsLeft > 0 && (
          <TouchableOpacity
            style={sc.cameraBtn}
            onPress={() => router.push('/camera/camera-screen' as any)}
            activeOpacity={0.82}
          >
            <Text style={[sc.cameraBtnText, { fontFamily: serifBold }]}>📷 Shoot</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Reveal countdown */}
      {showCountdown && (
        <View style={[sc.cdWrap, { borderBottomColor: BORDER }]}>
          <Text style={[sc.cdTitle, { fontFamily: serif }]}>Gallery reveals in</Text>
          <View style={sc.cdRow}>
            {countdown.d > 0 && <CountdownBox label="DAYS"  value={String(countdown.d)} />}
            <CountdownBox label="HRS"  value={pad(countdown.h)} />
            <CountdownBox label="MIN"  value={pad(countdown.m)} />
            <CountdownBox label="SEC"  value={pad(countdown.s)} />
          </View>
          <Text style={[sc.cdRevealDate, { fontFamily: serif }]}>
            {fmtReveal(event!.reveal_time)}
          </Text>
        </View>
      )}

      {/* Photo grid or empty state */}
      {photos.length === 0 ? (
        <View style={[sc.emptyState, { flex: 1 }]}>
          <Text style={sc.emptyIcon}>📷</Text>
          <Text style={[sc.emptyTitle, { fontFamily: serifBold }]}>No shots yet.</Text>
          <Text style={[sc.emptyBody, { fontFamily: serif }]}>
            Tap the camera button to start capturing memories.
          </Text>
          <TouchableOpacity
            style={sc.shootBtn}
            onPress={() => router.push('/camera/camera-screen' as any)}
            activeOpacity={0.82}
          >
            <Text style={[sc.shootBtnText, { fontFamily: serifBold }]}>Open Camera →</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Section heading */}
          <View style={[sc.gridHeader, { borderBottomColor: BORDER }]}>
            <Text style={[sc.gridHeading, { fontFamily: serifBold }]}>MY SHOTS</Text>
            <Text style={[sc.gridNote, { fontFamily: serif }]}>Hold to delete · reveals at {fmtReveal(event?.reveal_time ?? '')}</Text>
          </View>

          <FlatList
            data={photos}
            keyExtractor={item => item.id}
            numColumns={3}
            style={{ flex: 1 }}
            contentContainerStyle={sc.grid}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                onLongPress={() => handleDeletePhoto(item)}
                activeOpacity={0.85}
                style={[sc.cell, { width: CELL, height: CELL }]}
                delayLongPress={400}
              >
                <Image source={{ uri: item.url }} style={sc.cellImage} />
                {deleting === item.id && (
                  <View style={sc.deletingOverlay}>
                    <ActivityIndicator color="#fff" size="small" />
                  </View>
                )}
              </TouchableOpacity>
            )}
            ListFooterComponent={
              shotsLeft > 0 ? (
                <TouchableOpacity
                  style={sc.moreShots}
                  onPress={() => router.push('/camera/camera-screen' as any)}
                  activeOpacity={0.82}
                >
                  <Text style={[sc.moreShotsText, { fontFamily: serifBold }]}>
                    📷  {shotsLeft} shot{shotsLeft !== 1 ? 's' : ''} remaining — keep shooting
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={sc.allUsedWrap}>
                  <Text style={[sc.allUsedText, { fontFamily: serif }]}>
                    All shots used.
                  </Text>
                  <TouchableOpacity
                    onPress={() => router.push('/upload/paywall-screen' as any)}
                  >
                    <Text style={[sc.getMoreText, { fontFamily: serifBold }]}>Get more shots →</Text>
                  </TouchableOpacity>
                </View>
              )
            }
          />
        </>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const TOP_PAD = Platform.OS === 'ios' ? 52 : 36;

const sc = StyleSheet.create({
  root:   { flex: 1, backgroundColor: BG },
  center: { justifyContent: 'center', alignItems: 'center' },

  // Logo
  logoRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoDot:  { width: 7, height: 7, borderRadius: 4, backgroundColor: GOLD },
  logoText: {
    fontSize: 11, letterSpacing: 3, color: WW,
    fontFamily: 'PlayfairDisplay_400Regular',
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: TOP_PAD,
    paddingBottom: 12,
    paddingHorizontal: H_PAD,
  },
  backBtn:   { width: 32 },
  backArrow: { fontSize: 22, color: WW },

  // Info bar
  infoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: H_PAD,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  infoLeft:   { flex: 1 },
  eventTitle: { fontSize: 18, color: WW, lineHeight: 24 },
  shotCount:  { fontSize: 13, color: MUTED, marginTop: 2 },

  cameraBtn: {
    backgroundColor: GOLD,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  cameraBtnText: { fontSize: 13, color: '#0C0904' },

  // Countdown
  cdWrap: {
    paddingHorizontal: H_PAD,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    gap: 10,
    backgroundColor: GOLD_T,
  },
  cdTitle:      { fontSize: 12, color: MUTED, letterSpacing: 1.5, textTransform: 'uppercase' },
  cdRow:        { flexDirection: 'row', gap: 10 },
  cdBox: {
    minWidth: 60,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: GOLD_B,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: GOLD_T,
  },
  cdValue:      { fontSize: 26, color: GOLD, fontFamily: 'PlayfairDisplay_700Bold' },
  cdLabel:      { fontSize: 9, color: MUTED, letterSpacing: 1.5, marginTop: 2 },
  cdRevealDate: { fontSize: 12, color: MUTED },

  // Grid header
  gridHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: H_PAD,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  gridHeading: { fontSize: 11, color: WW, letterSpacing: 2.5 },
  gridNote:    { fontSize: 11, color: MUTED },

  // Grid
  grid: { padding: 1, paddingBottom: 100 },
  cell: { margin: 1, overflow: 'hidden' },
  cellImage: { width: '100%', height: '100%' },
  deletingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Footer CTAs
  moreShots: {
    margin: 16,
    borderWidth: 1,
    borderColor: GOLD_B,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: GOLD_T,
  },
  moreShotsText: { fontSize: 14, color: GOLD },

  allUsedWrap: {
    margin: 16,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  allUsedText: { fontSize: 13, color: MUTED },
  getMoreText: { fontSize: 14, color: GOLD, letterSpacing: 0.5 },

  // Empty state
  emptyState: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: H_PAD, gap: 12 },
  emptyIcon:  { fontSize: 48 },
  emptyTitle: { fontSize: 22, color: WW, textAlign: 'center' },
  emptyBody:  { fontSize: 14, color: MUTED, textAlign: 'center', lineHeight: 22 },
  shootBtn: {
    marginTop: 8, backgroundColor: GOLD,
    borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28,
  },
  shootBtnText: { fontSize: 15, color: '#0C0904' },

  // Revealed state
  revealedIcon:  { fontSize: 48, color: GOLD, marginBottom: 16 },
  revealedTitle: { fontSize: 28, color: WW, textAlign: 'center', lineHeight: 36, marginBottom: 10 },
  revealedBody:  { fontSize: 15, color: MUTED, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  viewBtn: {
    backgroundColor: GOLD,
    borderRadius: 4,
    paddingVertical: 16,
    paddingHorizontal: 40,
  },
  viewBtnText: { fontSize: 15, color: '#0C0904', letterSpacing: 1.4, textTransform: 'uppercase' },
});
