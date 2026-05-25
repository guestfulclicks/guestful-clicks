import React, {
  useCallback, useEffect, useRef, useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
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
import CameraQRCode from '../../shared/components/CameraQRCode';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../../supabase/client';
import { sendImmediateNotification } from '../../shared/notifications';

// ── Theme ─────────────────────────────────────────────────────────────────────

const THEMES: Record<string, { background: string; text: string }> = {
  midnight:      { background: '#0C0904', text: '#F0E8D5' },
  graphite:      { background: '#1A1A1A', text: '#FFFFFF'  },
  navy:          { background: '#0D1B2A', text: '#E8F0FE'  },
  forest:        { background: '#0D1F17', text: '#EAF5EE'  },
  wine:          { background: '#1A0A0F', text: '#F5E8EC'  },
  'deep-pink':   { background: '#3B1321', text: '#F5C8D8'  },
  'burnt-orange':{ background: '#3D1C01', text: '#FFE0C0'  },
};
const THEME_KEY  = '@guestful_onboarding_theme';
const DEFAULT_TH = THEMES.midnight;
const GOLD       = '#D4A853';
const GOLD_T     = 'rgba(212,168,83,0.08)';
const GOLD_B     = 'rgba(212,168,83,0.25)';
const GREEN      = '#4CAF50';
const H_PAD      = 24;
const JOIN_BASE  = 'https://join.guestfulclicks.com';
const { width: SW } = Dimensions.get('window');

// ── Types ─────────────────────────────────────────────────────────────────────

type DashView = 'list' | 'event';

interface EventRow {
  id: string;
  title: string;
  type: 'private' | 'public';
  event_date: string;
  reveal_time: string;
  aesthetic: string;
  status: 'active' | 'revealed' | 'archived';
  share_code: string;
  invitation_card: string | null;
  pricing_tier: string;
  event_end_time: string | null;
}

interface CardStats { guestCount: number; photoCount: number; }

interface ParticipantRow {
  id: string;
  name: string;
  upload_count: number;
  joined_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d} ${months[m - 1]} ${y}`;
}

function fmtRevealTime(iso: string): string {
  if (!iso) return '—';
  const dt = new Date(iso);
  const M  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const h  = dt.getHours(), min = dt.getMinutes();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${dt.getDate()} ${M[dt.getMonth()]} ${dt.getFullYear()}, ${h12}:${String(min).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)  return 'Just now';
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function pad(n: number): string { return String(n).padStart(2, '0'); }

function revealCountdownStr(iso: string, status: string): string {
  if (status === 'revealed') return 'Revealed';
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'Ready';
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (d > 0)  return `${d}d ${pad(h)}h`;
  if (h > 0)  return `${h}h ${pad(m)}m`;
  return `${pad(m)}m ${pad(s)}s`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Logo({ textColor }: { textColor: string }) {
  return (
    <View style={sc.logoRow}>
      <View style={sc.logoDot} />
      <Text style={[sc.logoText, { color: textColor }]}>GUESTFUL CLICKS</Text>
    </View>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { icon: string; label: string; color: string }> = {
    active:   { icon: '●', label: 'LIVE',     color: GREEN  },
    revealed: { icon: '✦', label: 'REVEALED', color: GOLD   },
    archived: { icon: '◎', label: 'ARCHIVED', color: '#888' },
  };
  const { icon, label, color } = map[status] ?? map.archived;
  return (
    <View style={[sc.pill, { borderColor: color }]}>
      <Text style={[sc.pillText, { color }]}>{icon} {label}</Text>
    </View>
  );
}

function StatCard({ icon, label, value, textColor }: {
  icon: string; label: string; value: string; textColor: string;
}) {
  return (
    <View style={[sc.statCard, { borderColor: GOLD_B }]}>
      <Text style={sc.statIcon}>{icon}</Text>
      <Text style={[sc.statVal, { color: GOLD }]}>{value}</Text>
      <Text style={[sc.statLabel, { color: textColor, opacity: 0.55 }]}>{label}</Text>
    </View>
  );
}

// ── Participant push dispatch ─────────────────────────────────────────────────
// Fetches push tokens for every participant in the event and batch-sends a
// reveal notification via the Expo Push API (100 tokens per request).

async function sendRevealPushToParticipants(
  eventId: string,
  eventName: string,
): Promise<void> {
  const { data: rows } = await supabase
    .from('participants')
    .select('push_token')
    .eq('event_id', eventId)
    .not('push_token', 'is', null);

  const tokens = (rows ?? [])
    .map((r: any) => r.push_token as string)
    .filter(t => t?.startsWith('ExponentPushToken'));

  if (!tokens.length) return;

  for (let i = 0; i < tokens.length; i += 100) {
    const batch = tokens.slice(i, i + 100);
    await fetch('https://exp.host/--/api/v2/push/send', {
      method:  'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(
        batch.map(to => ({
          to,
          title: 'Your gallery is ready 🎞',
          body:  `${eventName} — See every angle, every guest, one gallery.`,
          data:  { type: 'reveal', eventName },
        }))
      ),
    });
  }
}

// ── Main component ────────────────────────────────────────────────────────────

export default function HostDashboard() {
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts({ PlayfairDisplay_400Regular, PlayfairDisplay_700Bold });
  const serif     = fontsLoaded ? 'PlayfairDisplay_400Regular' : undefined;
  const serifBold = fontsLoaded ? 'PlayfairDisplay_700Bold'    : undefined;

  const [theme, setTheme]       = useState(DEFAULT_TH);
  const [dashView, setDashView] = useState<DashView>('list');
  const [isLoading, setIsLoading] = useState(true);

  // Profile / sign-out
  const [profileOpen, setProfileOpen] = useState(false);
  const [userInfo, setUserInfo] = useState<{ name: string; email: string } | null>(null);

  // Events list
  const [events, setEvents]         = useState<EventRow[]>([]);
  const [eventStats, setEventStats] = useState<Record<string, CardStats>>({});

  // Selected event (VIEW 2)
  const [selectedEvent, setSelectedEvent] = useState<EventRow | null>(null);
  const [stats, setStats]                 = useState<CardStats>({ guestCount: 0, photoCount: 0 });
  const [revealStr, setRevealStr]         = useState('');
  const [participants, setParticipants]   = useState<ParticipantRow[]>([]);
  const [savingProgress, setSavingProgress] = useState<{c:number;t:number}|null>(null);
  const [isRevealing, setIsRevealing]     = useState(false);

  const qrRef       = useRef<any>(null);
  const statsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cdTimerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef    = useRef<any>(null);

  // ── Init ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const key = await AsyncStorage.getItem(THEME_KEY);
      if (key && THEMES[key]) setTheme(THEMES[key]);

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserInfo({
          name:  user.user_metadata?.full_name ?? user.user_metadata?.name ?? 'User',
          email: user.email ?? '',
        });
      }

      await loadEvents();
      setIsLoading(false);
    })();
    return () => {
      statsTimerRef.current && clearInterval(statsTimerRef.current);
      cdTimerRef.current    && clearInterval(cdTimerRef.current);
      channelRef.current    && supabase.removeChannel(channelRef.current);
    };
  }, []);

  // ── Countdown ticker (VIEW 2) ────────────────────────────────────────────

  useEffect(() => {
    cdTimerRef.current && clearInterval(cdTimerRef.current);
    if (!selectedEvent) return;
    const tick = () => setRevealStr(revealCountdownStr(selectedEvent.reveal_time, selectedEvent.status));
    tick();
    cdTimerRef.current = setInterval(tick, 1000);
    return () => { cdTimerRef.current && clearInterval(cdTimerRef.current); };
  }, [selectedEvent]);

  // ── Data loaders ──────────────────────────────────────────────────────────

  const loadEvents = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    console.log('[Dashboard] Loading events for user:', user.id);

    const { data: evs, error } = await supabase
      .from('events')
      .select('*')
      .eq('host_id', user.id)
      .order('created_at', { ascending: false });

    console.log('[Dashboard] Events returned:', evs?.length ?? 0, error ?? '');

    setEvents((evs ?? []) as EventRow[]);

    if (!evs?.length) return;

    // Fetch stats for each event card
    const statEntries = await Promise.all(
      evs.map(async ev => {
        const [{ count: gc }, { count: pc }] = await Promise.all([
          supabase.from('participants').select('id', { count: 'exact' }).eq('event_id', ev.id),
          supabase.from('photos').select('id', { count: 'exact' }).eq('event_id', ev.id),
        ]);
        return [ev.id, { guestCount: gc ?? 0, photoCount: pc ?? 0 }] as const;
      })
    );
    setEventStats(Object.fromEntries(statEntries));
  }, []);

  const openEvent = useCallback(async (ev: EventRow) => {
    setSelectedEvent(ev);
    setDashView('event');
    await fetchEventData(ev);
    setupRealtimeAndPolling(ev);
  }, []);

  async function fetchEventData(ev: EventRow) {
    const [{ count: gc }, { count: pc }, { data: ps }] = await Promise.all([
      supabase.from('participants').select('*', { count: 'exact', head: true }).eq('event_id', ev.id),
      supabase.from('photos').select('*', { count: 'exact', head: true }).eq('event_id', ev.id),
      supabase.from('participants')
        .select('id, name, upload_count, joined_at')
        .eq('event_id', ev.id)
        .order('joined_at', { ascending: false }),
    ]);
    setStats({ guestCount: gc ?? 0, photoCount: pc ?? 0 });
    setParticipants((ps ?? []) as ParticipantRow[]);
  }

  function setupRealtimeAndPolling(ev: EventRow) {
    // Clean up old subscriptions
    statsTimerRef.current && clearInterval(statsTimerRef.current);
    channelRef.current    && supabase.removeChannel(channelRef.current);

    // 30-second polling
    statsTimerRef.current = setInterval(() => fetchEventData(ev), 30000);

    // Realtime for instant participant / photo count updates
    const ch = supabase
      .channel(`host-ev-${ev.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'participants', filter: `event_id=eq.${ev.id}` },
        (payload: any) => {
          setStats(p => ({ ...p, guestCount: p.guestCount + 1 }));
          setParticipants(p => [payload.new as ParticipantRow, ...p]);
        })
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'photos', filter: `event_id=eq.${ev.id}` },
        () => setStats(p => ({ ...p, photoCount: p.photoCount + 1 })))
      .subscribe();
    channelRef.current = ch;
  }

  function goBack() {
    statsTimerRef.current && clearInterval(statsTimerRef.current);
    channelRef.current    && supabase.removeChannel(channelRef.current);
    setDashView('list');
    setSelectedEvent(null);
    loadEvents(); // refresh counts
  }

  const handleSignOut = async () => {
    setProfileOpen(false);
    await supabase.auth.signOut();
    await AsyncStorage.clear();
    router.replace('/onboarding/slides');
  };

  // ── Reveal handler ────────────────────────────────────────────────────────

  const handleReveal = () => {
    if (!selectedEvent) return;
    Alert.alert(
      'Reveal your film?',
      'All guests will be able to see the gallery immediately.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reveal Now',
          style: 'destructive',
          onPress: async () => {
            setIsRevealing(true);
            try {
              await supabase.from('events').update({ status: 'revealed' }).eq('id', selectedEvent.id);
              await supabase.from('photos').update({ is_revealed: true }).eq('event_id', selectedEvent.id);
              const updated = { ...selectedEvent, status: 'revealed' as const };
              setSelectedEvent(updated);
              setEvents(prev => prev.map(e => e.id === selectedEvent.id ? updated : e));

              // Local notification to the host.
              await sendImmediateNotification(
                'Film revealed! 🎉',
                `Your ${selectedEvent.title} gallery is now live for all guests.`,
              ).catch(() => {});

              // Push to all participants — fire-and-forget, failures don't block UI.
              sendRevealPushToParticipants(selectedEvent.id, selectedEvent.title).catch(() => {});
            } finally {
              setIsRevealing(false);
            }
          },
        },
      ]
    );
  };

  // ── QR / share handlers ───────────────────────────────────────────────────

  const handleShareLink = async () => {
    if (!selectedEvent) return;
    const url = `${JOIN_BASE}/${selectedEvent.share_code}`;
    await Share.share({ message: `Join my film: ${url}`, title: selectedEvent.title }).catch(() => {});
  };

  const handleSaveQR = async () => {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow gallery access to save the QR code.'); return; }
    qrRef.current?.toDataURL(async (base64: string) => {
      try {
        const uri = `${FileSystem.documentDirectory}guestful_qr_${selectedEvent?.share_code}.png`;
        await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
        await MediaLibrary.saveToLibraryAsync(uri);
        Alert.alert('Saved!', 'QR code saved to your gallery.');
      } catch { Alert.alert('Error', 'Could not save QR code.'); }
    });
  };

  const handleWhatsApp = async () => {
    if (!selectedEvent) return;
    const url = `${JOIN_BASE}/${selectedEvent.share_code}`;
    const wa  = `whatsapp://send?text=${encodeURIComponent(`Join my film: ${url}`)}`;
    (await Linking.canOpenURL(wa)) ? Linking.openURL(wa) : Alert.alert('WhatsApp not installed');
  };

  // ── Download all (post-reveal) ────────────────────────────────────────────

  const handleDownloadAll = async () => {
    if (!selectedEvent) return;
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow gallery access to save photos.'); return; }
    const { data: photos } = await supabase
      .from('photos').select('url').eq('event_id', selectedEvent.id).eq('is_revealed', true);
    if (!photos?.length) { Alert.alert('No photos yet', 'No revealed photos found for this event.'); return; }
    setSavingProgress({ c: 0, t: photos.length });
    let saved = 0;
    for (const photo of photos) {
      try {
        const fn  = `guestful_${Date.now()}.jpg`;
        const loc = `${FileSystem.documentDirectory}${fn}`;
        await FileSystem.downloadAsync(photo.url, loc);
        await MediaLibrary.saveToLibraryAsync(loc);
        saved++;
        setSavingProgress({ c: saved, t: photos.length });
      } catch { /* continue */ }
    }
    setSavingProgress(null);
    Alert.alert('Done!', `Saved ${saved} of ${photos.length} photos.`);
  };

  // ── Guards ────────────────────────────────────────────────────────────────

  if (!fontsLoaded || isLoading) {
    return (
      <View style={[sc.root, { backgroundColor: theme.background }, sc.center]}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator color={GOLD} size="large" />
      </View>
    );
  }

  const BG = theme.background;
  const TXT = theme.text;
  const MUTED = `${TXT}88`;

  // ── VIEW 1 — FILMS LIST ───────────────────────────────────────────────────

  if (dashView === 'list') {
    return (
      <View style={[sc.root, { backgroundColor: BG }]}>
        <StatusBar barStyle="light-content" />

        {/* Top bar */}
        <View style={[sc.topBar, { borderBottomColor: 'rgba(255,255,255,0.08)' }]}>
          <View style={sc.topBarSpacer} />
          <View style={sc.topBarCenter}><Logo textColor={TXT} /></View>
          <TouchableOpacity style={sc.profileBtn} onPress={() => setProfileOpen(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <View style={sc.profileCircle}>
              <Text style={sc.profileInitial}>{userInfo?.name?.charAt(0).toUpperCase() ?? '?'}</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={[sc.listHeader, { borderBottomColor: 'rgba(255,255,255,0.08)' }]}>
          <Text style={[sc.listHeading, { color: TXT, fontFamily: serifBold }]}>My Films</Text>
          <TouchableOpacity
            style={sc.newFilmBtn}
            onPress={() => router.push('/create-event/event-type' as any)}
          >
            <Text style={[sc.newFilmBtnText, { fontFamily: serifBold }]}>＋ New Film</Text>
          </TouchableOpacity>
        </View>

        {events.length === 0 ? (
          <View style={sc.emptyState}>
            <Text style={sc.emptyIcon}>🎞</Text>
            <Text style={[sc.emptyTitle, { color: TXT, fontFamily: serifBold }]}>No films yet.</Text>
            <Text style={[sc.emptyBody, { color: TXT, fontFamily: serif }]}>
              Tap "New Film" above to create your first film and share it with your guests.
            </Text>
          </View>
        ) : (
          <FlatList
            data={events}
            keyExtractor={item => item.id}
            style={{ flex: 1 }}
            contentContainerStyle={[sc.listContent, { paddingBottom: insets.bottom + 24 }]}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const cs = eventStats[item.id] ?? { guestCount: 0, photoCount: 0 };
              return (
                <TouchableOpacity
                  style={[sc.eventCard, { borderColor: 'rgba(255,255,255,0.1)' }]}
                  onPress={() => openEvent(item)}
                  activeOpacity={0.82}
                >
                  {/* Cover thumbnail */}
                  {item.invitation_card ? (
                    <Image source={{ uri: item.invitation_card }} style={sc.cardThumb} />
                  ) : (
                    <View style={[sc.cardThumb, sc.cardThumbPlaceholder]}>
                      <Text style={{ fontSize: 20 }}>🎞</Text>
                    </View>
                  )}

                  <View style={sc.cardBody}>
                    <View style={sc.cardTitleRow}>
                      <Text
                        style={[sc.cardTitle, { color: TXT, fontFamily: serifBold }]}
                        numberOfLines={1}
                      >
                        {item.title}
                      </Text>
                      <StatusPill status={item.status} />
                    </View>
                    <Text style={[sc.cardDate, { color: TXT, fontFamily: serif, opacity: 0.55 }]}>
                      {fmtDate(item.event_date)}
                    </Text>
                    <View style={sc.cardStatsRow}>
                      <Text style={[sc.cardStat, { color: GOLD, fontFamily: serif }]}>
                        👥 {cs.guestCount}
                      </Text>
                      <Text style={[sc.cardStat, { color: GOLD, fontFamily: serif }]}>
                        📷 {cs.photoCount}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}

        {/* ── Profile / Sign Out modal ── */}
        <Modal visible={profileOpen} transparent animationType="slide" onRequestClose={() => setProfileOpen(false)}>
          <Pressable style={sc.profileOverlay} onPress={() => setProfileOpen(false)}>
            <Pressable style={[sc.profileSheet, { backgroundColor: BG }]}>
              <View style={[sc.profileHandle, { backgroundColor: TXT }]} />
              <View style={sc.profileAvatarCircle}>
                <Text style={sc.profileAvatarInitial}>{userInfo?.name?.charAt(0).toUpperCase() ?? '?'}</Text>
              </View>
              <Text style={[sc.profileName, { color: TXT, fontFamily: serifBold }]}>{userInfo?.name ?? ''}</Text>
              <Text style={[sc.profileEmail, { color: TXT, fontFamily: serif }]}>{userInfo?.email ?? ''}</Text>
              <TouchableOpacity style={sc.signOutBtn} onPress={handleSignOut} activeOpacity={0.82}>
                <Text style={[sc.signOutText, { fontFamily: serifBold }]}>Sign Out</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    );
  }

  // ── VIEW 2 — EVENT DASHBOARD ──────────────────────────────────────────────

  if (!selectedEvent) return null;

  const shareUrl = `${JOIN_BASE}/${selectedEvent.share_code}`;
  const amount   = parseInt(selectedEvent.pricing_tier || '0', 10);

  return (
    <View style={[sc.root, { backgroundColor: BG }]}>
      <StatusBar barStyle="light-content" />

      {/* Fixed top bar */}
      <View style={[sc.topBar, { borderBottomColor: 'rgba(255,255,255,0.08)' }]}>
        <TouchableOpacity style={sc.backBtn} onPress={goBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={[sc.backArrow, { color: TXT }]}>←</Text>
        </TouchableOpacity>
        <View style={sc.topBarCenter}><Logo textColor={TXT} /></View>
        <View style={sc.backBtn} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={sc.eventScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Cover image */}
        <View style={sc.coverWrap}>
          {selectedEvent.invitation_card ? (
            <Image source={{ uri: selectedEvent.invitation_card }} style={sc.coverImg} resizeMode="cover" />
          ) : (
            <View style={[sc.coverImg, sc.coverPlaceholder]}>
              <Text style={{ fontSize: 36 }}>🎞</Text>
            </View>
          )}
          <View style={sc.coverOverlay} />
          <Text style={[sc.coverTitle, { fontFamily: serifBold }]}>{selectedEvent.title}</Text>
          <View style={sc.coverPillWrap}><StatusPill status={selectedEvent.status} /></View>
        </View>

        {/* Stats row */}
        <View style={sc.statsRow}>
          <StatCard icon="👥" label="Guests"   value={String(stats.guestCount)} textColor={TXT} />
          <StatCard icon="📷" label="Photos"   value={String(stats.photoCount)} textColor={TXT} />
          <StatCard icon="⏱"  label="Reveal"   value={revealStr}                 textColor={TXT} />
          <StatCard icon="💰" label="Paid"     value={`₹${amount.toLocaleString('en-IN')}`} textColor={TXT} />
        </View>

        {/* Guest list */}
        <View style={[sc.section, { borderColor: 'rgba(255,255,255,0.08)' }]}>
          <Text style={[sc.sectionHeading, { color: TXT, fontFamily: serifBold }]}>WHO'S SHOOTING</Text>
          {participants.length === 0 ? (
            <Text style={[sc.emptySection, { color: TXT, fontFamily: serif }]}>
              No guests have joined yet.
            </Text>
          ) : (
            participants.map(p => (
              <View key={p.id} style={[sc.guestRow, { borderBottomColor: 'rgba(255,255,255,0.06)' }]}>
                <View style={sc.guestAvatar}>
                  <Text style={sc.guestAvatarText}>{p.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={sc.guestInfo}>
                  <Text style={[sc.guestName, { color: TXT, fontFamily: serifBold }]}>{p.name}</Text>
                  <Text style={[sc.guestMeta, { color: TXT, fontFamily: serif, opacity: 0.5 }]}>
                    {p.upload_count} photo{p.upload_count !== 1 ? 's' : ''} · {timeAgo(p.joined_at)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* QR code */}
        <View style={[sc.section, { borderColor: 'rgba(255,255,255,0.08)' }]}>
          <Text style={[sc.sectionHeading, { color: TXT, fontFamily: serifBold }]}>SHARE YOUR FILM</Text>
          <View style={sc.qrCard}>
            <CameraQRCode
              value={shareUrl}
              shareCode={selectedEvent.share_code}
              qrRef={qrRef}
              size={220}
            />
          </View>
          <View style={sc.qrActions}>
            <TouchableOpacity style={[sc.qrBtn, { borderColor: 'rgba(255,255,255,0.15)' }]} onPress={handleShareLink}>
              <Text style={sc.qrBtnIcon}>🔗</Text>
              <Text style={[sc.qrBtnText, { color: TXT, fontFamily: serif }]}>Share Link</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[sc.qrBtn, { borderColor: 'rgba(255,255,255,0.15)' }]} onPress={handleSaveQR}>
              <Text style={sc.qrBtnIcon}>💾</Text>
              <Text style={[sc.qrBtnText, { color: TXT, fontFamily: serif }]}>Save QR</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[sc.qrBtn, { borderColor: 'rgba(255,255,255,0.15)' }]} onPress={handleWhatsApp}>
              <Text style={sc.qrBtnIcon}>💬</Text>
              <Text style={[sc.qrBtnText, { color: TXT, fontFamily: serif }]}>WhatsApp</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Reveal section */}
        <View style={[sc.section, { borderColor: 'rgba(255,255,255,0.08)' }]}>
          <Text style={[sc.sectionHeading, { color: TXT, fontFamily: serifBold }]}>REVEAL</Text>
          <Text style={[sc.revealTimeText, { color: TXT, fontFamily: serif, opacity: 0.6 }]}>
            Scheduled: {fmtRevealTime(selectedEvent.reveal_time)}
          </Text>

          {selectedEvent.status === 'active' ? (
            <TouchableOpacity
              style={[sc.revealBtn, isRevealing && sc.revealBtnDisabled]}
              onPress={handleReveal}
              disabled={isRevealing}
              activeOpacity={0.85}
            >
              {isRevealing ? (
                <ActivityIndicator color={BG} size="small" />
              ) : (
                <Text style={[sc.revealBtnText, { fontFamily: serifBold }]}>Reveal Now</Text>
              )}
            </TouchableOpacity>
          ) : selectedEvent.status === 'revealed' ? (
            <View style={sc.revealedState}>
              <Text style={[sc.revealedMsg, { fontFamily: serif }]}>✓ Gallery is live</Text>
              <TouchableOpacity
                style={[sc.viewGalleryBtn, { borderColor: GOLD }]}
                onPress={() => router.push('/gallery/reveal-screen' as any)}
                activeOpacity={0.85}
              >
                <Text style={[sc.viewGalleryBtnText, { fontFamily: serifBold }]}>View Gallery →</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        {/* Download section — post-reveal only */}
        {selectedEvent.status === 'revealed' && (
          <View style={[sc.section, { borderColor: 'rgba(255,255,255,0.08)' }]}>
            <Text style={[sc.sectionHeading, { color: TXT, fontFamily: serifBold }]}>DOWNLOAD</Text>
            {savingProgress ? (
              <View style={sc.savingWrap}>
                <ActivityIndicator color={GOLD} size="small" />
                <Text style={[sc.savingText, { color: GOLD, fontFamily: serif }]}>
                  Saving {savingProgress.c} of {savingProgress.t}...
                </Text>
              </View>
            ) : (
              <TouchableOpacity style={sc.dlBtn} onPress={handleDownloadAll} activeOpacity={0.85}>
                <Text style={[sc.dlBtnText, { fontFamily: serifBold }]}>⬇️ Download All Photos</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={{ height: 48 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const TOP_PAD = Platform.OS === 'ios' ? 52 : 36;
const BOT_PAD = Platform.OS === 'ios' ? 34 : 20;

const sc = StyleSheet.create({
  root:   { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },

  // Logo
  logoRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoDot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: GOLD },
  logoText: { fontSize: 11, letterSpacing: 3, fontFamily: 'PlayfairDisplay_400Regular' },

  // Top bar (shared)
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: TOP_PAD,
    paddingBottom: 14,
    paddingHorizontal: H_PAD,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topBarCenter: { flex: 1, alignItems: 'center' },
  backBtn:    { width: 32 },
  backArrow:  { fontSize: 22 },

  // VIEW 1 — List
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: H_PAD,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listHeading: { fontSize: 24, lineHeight: 30 },
  newFilmBtn:  { backgroundColor: GOLD, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  newFilmBtnText: { fontSize: 14, color: '#0C0904', letterSpacing: 0.3 },

  listContent: { paddingHorizontal: H_PAD, paddingTop: 12 },

  // Empty state
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: H_PAD, gap: 12 },
  emptyIcon:  { fontSize: 48 },
  emptyTitle: { fontSize: 22, textAlign: 'center' },
  emptyBody:  { fontSize: 14, textAlign: 'center', lineHeight: 22, opacity: 0.6, paddingHorizontal: 8 },

  // Profile button (top right)
  topBarSpacer: { width: 36 },
  profileBtn: { width: 36, alignItems: 'flex-end' },
  profileCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: GOLD,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInitial: { fontSize: 14, color: '#0C0904', fontFamily: 'PlayfairDisplay_700Bold' },

  // Profile sheet modal
  profileOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  profileSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 28,
    paddingTop: 14,
    paddingBottom: BOT_PAD + 20,
    alignItems: 'center',
    gap: 8,
  },
  profileHandle: { width: 36, height: 3, borderRadius: 2, opacity: 0.3, marginBottom: 20 },
  profileAvatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: GOLD,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  profileAvatarInitial: { fontSize: 26, color: '#0C0904', fontFamily: 'PlayfairDisplay_700Bold' },
  profileName:  { fontSize: 18, letterSpacing: 0.2 },
  profileEmail: { fontSize: 13, opacity: 0.5, marginBottom: 24 },
  signOutBtn: {
    width: '100%',
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  signOutText: { fontSize: 15, color: '#FFFFFF', letterSpacing: 0.4 },

  // Event card
  eventCard: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    gap: 14,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  cardThumb: {
    width: 60,
    height: 60,
    borderRadius: 8,
    overflow: 'hidden',
  },
  cardThumbPlaceholder: {
    backgroundColor: '#1A1208',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBody:      { flex: 1, gap: 4 },
  cardTitleRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTitle:     { flex: 1, fontSize: 16, lineHeight: 22 },
  cardDate:      { fontSize: 12 },
  cardStatsRow:  { flexDirection: 'row', gap: 14, marginTop: 4 },
  cardStat:      { fontSize: 12 },

  // Status pill
  pill:     { borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: 10, letterSpacing: 0.8 },

  // VIEW 2 — Event scroll
  eventScrollContent: { paddingBottom: 0 },

  // Cover
  coverWrap: {
    height: 200,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'flex-end',
  },
  coverImg:         { width: '100%', height: '100%' },
  coverPlaceholder: { backgroundColor: '#1A1208', justifyContent: 'center', alignItems: 'center' },
  coverOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  coverTitle: {
    position: 'absolute',
    bottom: 14,
    left: H_PAD,
    right: 100,
    fontSize: 20,
    color: '#FFFFFF',
    lineHeight: 26,
  },
  coverPillWrap: { position: 'absolute', top: 14, right: H_PAD },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: H_PAD,
    paddingVertical: 16,
    gap: 8,
  },
  statCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 4,
    backgroundColor: GOLD_T,
  },
  statIcon:  { fontSize: 16 },
  statVal:   { fontSize: 15, fontFamily: 'PlayfairDisplay_700Bold' },
  statLabel: { fontSize: 10, letterSpacing: 0.4, textAlign: 'center' },

  // Section
  section: {
    paddingHorizontal: H_PAD,
    paddingTop: 20,
    paddingBottom: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  sectionHeading: { fontSize: 11, letterSpacing: 2.5, marginBottom: 4 },
  emptySection:   { fontSize: 13, opacity: 0.5, lineHeight: 20 },

  // Guest rows
  guestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  guestAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: GOLD,
    justifyContent: 'center',
    alignItems: 'center',
  },
  guestAvatarText: { fontSize: 16, color: '#0C0904', fontWeight: '700' },
  guestInfo:       { flex: 1, gap: 2 },
  guestName:       { fontSize: 14, lineHeight: 20 },
  guestMeta:       { fontSize: 12 },

  // QR section
  qrCard: {
    alignSelf: 'center',
  },
  qrActions: { flexDirection: 'row', gap: 10 },
  qrBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  qrBtnIcon: { fontSize: 20 },
  qrBtnText: { fontSize: 11, letterSpacing: 0.4, opacity: 0.8 },

  // Reveal section
  revealTimeText: { fontSize: 14, lineHeight: 22 },
  revealBtn: {
    backgroundColor: GOLD,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  revealBtnDisabled: { opacity: 0.7 },
  revealBtnText:     { fontSize: 15, color: '#0C0904', letterSpacing: 0.4 },

  revealedState: { gap: 12 },
  revealedMsg:   { fontSize: 15, color: GREEN },
  viewGalleryBtn: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: GOLD_T,
  },
  viewGalleryBtnText: { fontSize: 14, color: GOLD, letterSpacing: 1.4 },

  // Download section
  savingWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  savingText: { fontSize: 13 },
  dlBtn: {
    borderWidth: 1,
    borderColor: GOLD_B,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: GOLD_T,
  },
  dlBtnText: { fontSize: 15, color: GOLD, letterSpacing: 0.3 },
});
