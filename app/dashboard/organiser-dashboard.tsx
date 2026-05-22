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
import { router } from 'expo-router';
import {
  useFonts,
  PlayfairDisplay_400Regular,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import QRCode from 'react-native-qrcode-svg';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import { supabase } from '../../supabase/client';
import { REVENUE_SHARE } from '../../shared/constants';

// ── Theme ─────────────────────────────────────────────────────────────────────

const THEMES: Record<string, { background: string; text: string }> = {
  midnight: { background: '#0C0904', text: '#F0E8D5' },
  graphite: { background: '#1A1A1A', text: '#FFFFFF'  },
  navy:     { background: '#0D1B2A', text: '#E8F0FE'  },
  forest:   { background: '#0D1F17', text: '#EAF5EE'  },
  wine:     { background: '#1A0A0F', text: '#F5E8EC'  },
};
const THEME_KEY  = '@guestful_onboarding_theme';
const DEFAULT_TH = THEMES.midnight;
const GOLD       = '#D4A853';
const GOLD_T     = 'rgba(212,168,83,0.08)';
const GOLD_B     = 'rgba(212,168,83,0.25)';
const GREEN      = '#4CAF50';
const BLUE       = '#5B8AF0';
const RED        = '#FF5252';
const H_PAD      = 24;
const JOIN_BASE  = 'https://join.guestfulclicks.com';
const { width: SW } = Dimensions.get('window');

// Avatar colors — deterministic by name initial
const AVATAR_COLORS = ['#C47C2A', '#6B4E3D', '#3D5A73', '#4A5E3D', '#6B3D5E'];

// ── Types ─────────────────────────────────────────────────────────────────────

type DashView = 'list' | 'event';

interface EventRow {
  id: string;
  title: string;
  type: 'private' | 'public';
  date: string;
  reveal_time: string;
  event_end_time: string | null;
  aesthetic: string;
  status: 'active' | 'revealed' | 'archived';
  share_code: string;
  invitation_card: string | null;
  pricing_tier: string;
}

interface CardStats {
  guestCount: number;
  photoCount: number;
  totalRevenue: number;
}

interface ParticipantRow {
  id: string;
  name: string;
  upload_count: number;
  joined_at: string;
  amount_paid: number;
}

interface PayoutRow {
  id: string;
  amount: number;
  status: 'pending' | 'scheduled' | 'paid' | 'failed';
  scheduled_date: string;
}

interface EventStats {
  guestCount: number;
  photoCount: number;
  totalRevenue: number;
  organiserShare: number;
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
  if (diff <= 0) return 'Auto';
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (d > 0)  return `${d}d ${pad(h)}h`;
  if (h > 0)  return `${h}h ${pad(m)}m`;
  return `${pad(m)}m ${pad(s)}s`;
}

function fmtINR(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`;
}

function avatarColor(name: string): string {
  const code = name.charCodeAt(0) || 0;
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}

function payoutStatusMeta(status: PayoutRow['status']): { label: string; color: string } {
  switch (status) {
    case 'pending':   return { label: 'Pending',   color: GOLD  };
    case 'scheduled': return { label: 'Scheduled', color: BLUE  };
    case 'paid':      return { label: 'Paid',       color: GREEN };
    case 'failed':    return { label: 'Failed',     color: RED   };
  }
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

// ── Main component ────────────────────────────────────────────────────────────

export default function OrganiserDashboard() {
  const [fontsLoaded] = useFonts({ PlayfairDisplay_400Regular, PlayfairDisplay_700Bold });
  const serif     = fontsLoaded ? 'PlayfairDisplay_400Regular' : undefined;
  const serifBold = fontsLoaded ? 'PlayfairDisplay_700Bold'    : undefined;

  const [theme, setTheme]         = useState(DEFAULT_TH);
  const [dashView, setDashView]   = useState<DashView>('list');
  const [isLoading, setIsLoading] = useState(true);

  // Events list
  const [events, setEvents]         = useState<EventRow[]>([]);
  const [eventStats, setEventStats] = useState<Record<string, CardStats>>({});

  // Selected event (VIEW 2)
  const [selectedEvent, setSelectedEvent]   = useState<EventRow | null>(null);
  const [stats, setStats]                   = useState<EventStats>({ guestCount: 0, photoCount: 0, totalRevenue: 0, organiserShare: 0 });
  const [revealStr, setRevealStr]           = useState('');
  const [participants, setParticipants]     = useState<ParticipantRow[]>([]);
  const [payout, setPayout]                 = useState<PayoutRow | null>(null);
  const [savingProgress, setSavingProgress] = useState<{ c: number; t: number } | null>(null);
  const [isRevealing, setIsRevealing]       = useState(false);

  const qrRef         = useRef<any>(null);
  const statsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cdTimerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef    = useRef<any>(null);

  // ── Init ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const key = await AsyncStorage.getItem(THEME_KEY);
      if (key && THEMES[key]) setTheme(THEMES[key]);
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

    const { data: evs } = await supabase
      .from('events')
      .select('id, title, type, date, reveal_time, event_end_time, aesthetic, status, share_code, invitation_card, pricing_tier')
      .eq('host_id', user.id)
      .order('date', { ascending: false });

    if (!evs?.length) { setEvents([]); return; }
    setEvents(evs as EventRow[]);

    const statEntries = await Promise.all(
      evs.map(async ev => {
        const [{ count: gc }, { count: pc }, { data: paid }] = await Promise.all([
          supabase.from('participants').select('*', { count: 'exact', head: true }).eq('event_id', ev.id),
          supabase.from('photos').select('*', { count: 'exact', head: true }).eq('event_id', ev.id),
          supabase.from('participants').select('amount_paid').eq('event_id', ev.id),
        ]);
        const totalRevenue = (paid ?? []).reduce((sum: number, r: any) => sum + (r.amount_paid ?? 0), 0);
        return [ev.id, { guestCount: gc ?? 0, photoCount: pc ?? 0, totalRevenue }] as const;
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
    const [{ count: gc }, { count: pc }, { data: ps }, { data: po }] = await Promise.all([
      supabase.from('participants').select('*', { count: 'exact', head: true }).eq('event_id', ev.id),
      supabase.from('photos').select('*', { count: 'exact', head: true }).eq('event_id', ev.id),
      supabase.from('participants')
        .select('id, name, upload_count, joined_at, amount_paid')
        .eq('event_id', ev.id)
        .order('joined_at', { ascending: false }),
      supabase.from('payouts')
        .select('id, amount, status, scheduled_date')
        .eq('event_id', ev.id)
        .maybeSingle(),
    ]);

    const rows = (ps ?? []) as ParticipantRow[];
    const totalRevenue = rows.reduce((sum, r) => sum + (r.amount_paid ?? 0), 0);
    const organiserShare = Math.floor(totalRevenue * REVENUE_SHARE.organiserPercent / 100);

    setStats({ guestCount: gc ?? 0, photoCount: pc ?? 0, totalRevenue, organiserShare });
    setParticipants(rows);
    setPayout(po as PayoutRow | null);
  }

  function setupRealtimeAndPolling(ev: EventRow) {
    statsTimerRef.current && clearInterval(statsTimerRef.current);
    channelRef.current    && supabase.removeChannel(channelRef.current);

    statsTimerRef.current = setInterval(() => fetchEventData(ev), 30000);

    const ch = supabase
      .channel(`org-ev-${ev.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'participants', filter: `event_id=eq.${ev.id}` },
        (payload: any) => {
          const newP = payload.new as ParticipantRow;
          setStats(p => ({
            ...p,
            guestCount:    p.guestCount + 1,
            totalRevenue:  p.totalRevenue + (newP.amount_paid ?? 0),
            organiserShare: Math.floor((p.totalRevenue + (newP.amount_paid ?? 0)) * REVENUE_SHARE.organiserPercent / 100),
          }));
          setParticipants(p => [newP, ...p]);
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
    loadEvents();
  }

  // ── Reveal handler ────────────────────────────────────────────────────────

  const handleReveal = () => {
    if (!selectedEvent) return;
    Alert.alert(
      'Reveal gallery now?',
      'All participants will be able to see the gallery immediately. This cannot be undone.',
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
    await Share.share({ message: `Join my event: ${url}`, title: selectedEvent.title }).catch(() => {});
  };

  const handleSaveQR = async () => {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow gallery access to save the QR code.'); return; }
    qrRef.current?.toDataURL(async (base64: string) => {
      try {
        const uri = `${FileSystem.cacheDirectory}guestful_qr_${selectedEvent?.share_code}.png`;
        await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
        await MediaLibrary.saveToLibraryAsync(uri);
        Alert.alert('Saved!', 'QR code saved to your gallery.');
      } catch { Alert.alert('Error', 'Could not save QR code.'); }
    });
  };

  const handleWhatsApp = async () => {
    if (!selectedEvent) return;
    const url = `${JOIN_BASE}/${selectedEvent.share_code}`;
    const wa  = `whatsapp://send?text=${encodeURIComponent(`Join my event: ${url}`)}`;
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
        const loc = `${FileSystem.cacheDirectory}${fn}`;
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

  const BG    = theme.background;
  const TXT   = theme.text;
  const MUTED = `${TXT}88`;

  // ── VIEW 1 — EVENTS LIST ─────────────────────────────────────────────────

  if (dashView === 'list') {
    return (
      <View style={[sc.root, { backgroundColor: BG }]}>
        <StatusBar barStyle="light-content" />

        <View style={[sc.topBar, { borderBottomColor: 'rgba(255,255,255,0.08)' }]}>
          <View style={sc.topBarCenter}><Logo textColor={TXT} /></View>
        </View>

        <View style={[sc.listHeader, { borderBottomColor: 'rgba(255,255,255,0.08)' }]}>
          <Text style={[sc.listHeading, { color: TXT, fontFamily: serifBold }]}>My Events</Text>
          <TouchableOpacity
            style={sc.newEventBtn}
            onPress={() => router.push('/create-event/event-type' as any)}
          >
            <Text style={[sc.newEventBtnText, { fontFamily: serifBold }]}>＋ New Event</Text>
          </TouchableOpacity>
        </View>

        {events.length === 0 ? (
          <View style={sc.emptyState}>
            <Text style={sc.emptyIcon}>🎭</Text>
            <Text style={[sc.emptyTitle, { color: TXT, fontFamily: serifBold }]}>No events yet.</Text>
            <Text style={[sc.emptyBody, { color: TXT, fontFamily: serif }]}>
              Create your first public event and start collecting memories.
            </Text>
            <TouchableOpacity
              style={sc.createBtn}
              onPress={() => router.push('/create-event/event-type' as any)}
            >
              <Text style={[sc.createBtnText, { fontFamily: serifBold }]}>Create an Event →</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={events}
            keyExtractor={item => item.id}
            style={{ flex: 1 }}
            contentContainerStyle={sc.listContent}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const cs = eventStats[item.id] ?? { guestCount: 0, photoCount: 0, totalRevenue: 0 };
              return (
                <TouchableOpacity
                  style={[sc.eventCard, { borderColor: 'rgba(255,255,255,0.1)' }]}
                  onPress={() => openEvent(item)}
                  activeOpacity={0.82}
                >
                  {item.invitation_card ? (
                    <Image source={{ uri: item.invitation_card }} style={sc.cardThumb} />
                  ) : (
                    <View style={[sc.cardThumb, sc.cardThumbPlaceholder]}>
                      <Text style={{ fontSize: 20 }}>🎭</Text>
                    </View>
                  )}

                  <View style={sc.cardBody}>
                    <View style={sc.cardTitleRow}>
                      <Text style={[sc.cardTitle, { color: TXT, fontFamily: serifBold }]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <StatusPill status={item.status} />
                    </View>
                    <Text style={[sc.cardDate, { color: MUTED, fontFamily: serif }]}>
                      {fmtDate(item.date)}
                    </Text>
                    <View style={sc.cardStatsRow}>
                      <Text style={[sc.cardStat, { color: GOLD, fontFamily: serif }]}>
                        👥 {cs.guestCount}
                      </Text>
                      <Text style={[sc.cardStat, { color: GOLD, fontFamily: serif }]}>
                        📷 {cs.photoCount}
                      </Text>
                      {cs.totalRevenue > 0 && (
                        <Text style={[sc.cardStat, { color: GOLD, fontFamily: serifBold }]}>
                          {fmtINR(cs.totalRevenue)}
                        </Text>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    );
  }

  // ── VIEW 2 — EVENT DASHBOARD ──────────────────────────────────────────────

  if (!selectedEvent) return null;

  const shareUrl = `${JOIN_BASE}/${selectedEvent.share_code}`;

  // Revenue compact display
  const revenueDisplay = stats.totalRevenue > 0
    ? fmtINR(stats.totalRevenue)
    : '₹0';

  return (
    <View style={[sc.root, { backgroundColor: BG }]}>
      <StatusBar barStyle="light-content" />

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
        {/* Cover */}
        <View style={sc.coverWrap}>
          {selectedEvent.invitation_card ? (
            <Image source={{ uri: selectedEvent.invitation_card }} style={sc.coverImg} resizeMode="cover" />
          ) : (
            <View style={[sc.coverImg, sc.coverPlaceholder]}>
              <Text style={{ fontSize: 36 }}>🎭</Text>
            </View>
          )}
          <View style={sc.coverOverlay} />
          <Text style={[sc.coverTitle, { fontFamily: serifBold }]}>{selectedEvent.title}</Text>
          <View style={sc.coverPillWrap}><StatusPill status={selectedEvent.status} /></View>
        </View>

        {/* Stats row */}
        <View style={sc.statsRow}>
          <StatCard icon="👥" label="Guests"  value={String(stats.guestCount)} textColor={TXT} />
          <StatCard icon="📷" label="Photos"  value={String(stats.photoCount)} textColor={TXT} />
          <StatCard icon="💰" label="Revenue" value={revenueDisplay}           textColor={TXT} />
          <StatCard icon="⏱"  label="Reveal"  value={revealStr}               textColor={TXT} />
        </View>

        {/* Who's joining */}
        <View style={[sc.section, { borderColor: 'rgba(255,255,255,0.08)' }]}>
          <Text style={[sc.sectionHeading, { color: TXT, fontFamily: serifBold }]}>WHO'S JOINING</Text>
          {participants.length === 0 ? (
            <Text style={[sc.emptySection, { color: MUTED, fontFamily: serif }]}>
              No participants yet. Share your event link to get started.
            </Text>
          ) : (
            participants.map(p => (
              <View key={p.id} style={[sc.guestRow, { borderBottomColor: 'rgba(255,255,255,0.06)' }]}>
                <View style={[sc.guestAvatar, { backgroundColor: avatarColor(p.name) }]}>
                  <Text style={sc.guestAvatarText}>{p.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={sc.guestInfo}>
                  <Text style={[sc.guestName, { color: TXT, fontFamily: serifBold }]}>{p.name}</Text>
                  <Text style={[sc.guestMeta, { color: MUTED, fontFamily: serif }]}>
                    {p.upload_count} photo{p.upload_count !== 1 ? 's' : ''} · {timeAgo(p.joined_at)}
                  </Text>
                </View>
                {p.amount_paid > 0 && (
                  <Text style={[sc.guestAmount, { fontFamily: serifBold }]}>
                    {fmtINR(p.amount_paid)}
                  </Text>
                )}
              </View>
            ))
          )}
        </View>

        {/* Share / QR */}
        <View style={[sc.section, { borderColor: 'rgba(255,255,255,0.08)' }]}>
          <Text style={[sc.sectionHeading, { color: TXT, fontFamily: serifBold }]}>SHARE YOUR EVENT</Text>
          <View style={sc.qrCard}>
            <QRCode
              value={shareUrl}
              size={160}
              getRef={(c: any) => { qrRef.current = c; }}
              backgroundColor="white"
              color="#0C0904"
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

        {/* Reveal */}
        <View style={[sc.section, { borderColor: 'rgba(255,255,255,0.08)' }]}>
          <Text style={[sc.sectionHeading, { color: TXT, fontFamily: serifBold }]}>REVEAL</Text>

          <View style={[sc.revealInfoRow, { borderColor: 'rgba(255,255,255,0.08)' }]}>
            <Text style={[sc.revealInfoLabel, { color: MUTED, fontFamily: serif }]}>Auto-reveals</Text>
            <Text style={[sc.revealInfoValue, { color: TXT, fontFamily: serifBold }]}>
              {fmtRevealTime(selectedEvent.reveal_time)}
            </Text>
          </View>

          {selectedEvent.status === 'active' ? (
            <>
              <Text style={[sc.revealNote, { color: MUTED, fontFamily: serif }]}>
                The gallery will open automatically 2 hours after your event ends. You can also trigger it early below.
              </Text>
              <TouchableOpacity
                style={[sc.revealBtn, isRevealing && sc.revealBtnDisabled]}
                onPress={handleReveal}
                disabled={isRevealing}
                activeOpacity={0.85}
              >
                {isRevealing ? (
                  <ActivityIndicator color={BG} size="small" />
                ) : (
                  <Text style={[sc.revealBtnText, { fontFamily: serifBold }]}>Reveal Early</Text>
                )}
              </TouchableOpacity>
            </>
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

        {/* Revenue */}
        <View style={[sc.section, { borderColor: 'rgba(255,255,255,0.08)' }]}>
          <Text style={[sc.sectionHeading, { color: TXT, fontFamily: serifBold }]}>REVENUE</Text>

          <View style={sc.revenueGrid}>
            <View style={[sc.revenueCard, { borderColor: GOLD_B, backgroundColor: GOLD_T }]}>
              <Text style={[sc.revenueCardLabel, { color: MUTED, fontFamily: serif }]}>Total Collected</Text>
              <Text style={[sc.revenueCardValue, { color: GOLD, fontFamily: serifBold }]}>
                {fmtINR(stats.totalRevenue)}
              </Text>
            </View>
            <View style={[sc.revenueCard, { borderColor: GOLD_B, backgroundColor: GOLD_T }]}>
              <Text style={[sc.revenueCardLabel, { color: MUTED, fontFamily: serif }]}>
                Your Share ({REVENUE_SHARE.organiserPercent}%)
              </Text>
              <Text style={[sc.revenueCardValue, { color: GOLD, fontFamily: serifBold }]}>
                {fmtINR(stats.organiserShare)}
              </Text>
            </View>
          </View>

          {/* Payout status */}
          <View style={[sc.payoutBox, { borderColor: 'rgba(255,255,255,0.08)' }]}>
            <Text style={[sc.payoutBoxTitle, { color: TXT, fontFamily: serifBold }]}>Payout</Text>
            {payout ? (
              <View style={sc.payoutRow}>
                <View>
                  <Text style={[sc.payoutAmount, { color: TXT, fontFamily: serifBold }]}>
                    {fmtINR(payout.amount)}
                  </Text>
                  {payout.scheduled_date ? (
                    <Text style={[sc.payoutDate, { color: MUTED, fontFamily: serif }]}>
                      {fmtDate(payout.scheduled_date)}
                    </Text>
                  ) : null}
                </View>
                <View style={[sc.payoutBadge, { borderColor: payoutStatusMeta(payout.status).color }]}>
                  <Text style={[sc.payoutBadgeText, { color: payoutStatusMeta(payout.status).color }]}>
                    {payoutStatusMeta(payout.status).label.toUpperCase()}
                  </Text>
                </View>
              </View>
            ) : (
              <Text style={[sc.payoutNote, { color: MUTED, fontFamily: serif }]}>
                Payouts are initiated between day {REVENUE_SHARE.payoutWindowStartDay}–{REVENUE_SHARE.payoutWindowEndDay} after your event date.
              </Text>
            )}
          </View>
        </View>

        {/* Download — post-reveal only */}
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

const sc = StyleSheet.create({
  root:   { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },

  // Logo
  logoRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoDot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: GOLD },
  logoText: { fontSize: 11, letterSpacing: 3, fontFamily: 'PlayfairDisplay_400Regular' },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: TOP_PAD,
    paddingBottom: 14,
    paddingHorizontal: H_PAD,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topBarCenter: { flex: 1, alignItems: 'center' },
  backBtn:  { width: 32 },
  backArrow: { fontSize: 22 },

  // VIEW 1 — List
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: H_PAD,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listHeading:    { fontSize: 24, lineHeight: 30 },
  newEventBtn:    { backgroundColor: GOLD, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  newEventBtnText: { fontSize: 14, color: '#0C0904', letterSpacing: 0.3 },

  listContent: { paddingHorizontal: H_PAD, paddingTop: 12, paddingBottom: 40 },

  // Empty state
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: H_PAD, gap: 12 },
  emptyIcon:  { fontSize: 48 },
  emptyTitle: { fontSize: 22, textAlign: 'center' },
  emptyBody:  { fontSize: 14, textAlign: 'center', lineHeight: 22, opacity: 0.6, paddingHorizontal: 8 },
  createBtn:  { marginTop: 8, backgroundColor: GOLD, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28 },
  createBtnText: { fontSize: 15, color: '#0C0904' },

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
  cardThumb: { width: 60, height: 60, borderRadius: 8, overflow: 'hidden' },
  cardThumbPlaceholder: { backgroundColor: '#1A1208', justifyContent: 'center', alignItems: 'center' },
  cardBody:     { flex: 1, gap: 4 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTitle:    { flex: 1, fontSize: 16, lineHeight: 22 },
  cardDate:     { fontSize: 12 },
  cardStatsRow: { flexDirection: 'row', gap: 14, marginTop: 4 },
  cardStat:     { fontSize: 12 },

  // Status pill
  pill:     { borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: 10, letterSpacing: 0.8 },

  // VIEW 2 — Event scroll
  eventScrollContent: { paddingBottom: 0 },

  // Cover
  coverWrap: { height: 200, overflow: 'hidden', position: 'relative', justifyContent: 'flex-end' },
  coverImg:  { width: '100%', height: '100%' },
  coverPlaceholder: { backgroundColor: '#1A1208', justifyContent: 'center', alignItems: 'center' },
  coverOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  coverTitle: {
    position: 'absolute', bottom: 14, left: H_PAD, right: 100,
    fontSize: 20, color: '#FFFFFF', lineHeight: 26,
  },
  coverPillWrap: { position: 'absolute', top: 14, right: H_PAD },

  // Stats row
  statsRow: { flexDirection: 'row', paddingHorizontal: H_PAD, paddingVertical: 16, gap: 8 },
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
  emptySection:   { fontSize: 13, lineHeight: 20 },

  // Guest rows
  guestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  guestAvatar:     { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
  guestAvatarText: { fontSize: 16, color: '#FFFFFF', fontWeight: '700' },
  guestInfo:       { flex: 1, gap: 2 },
  guestName:       { fontSize: 14, lineHeight: 20 },
  guestMeta:       { fontSize: 12 },
  guestAmount:     { fontSize: 13, color: GOLD },

  // QR section
  qrCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    alignSelf: 'center',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10 },
      android: { elevation: 6 },
      default: {},
    }),
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
  revealInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 14,
  },
  revealInfoLabel: { fontSize: 12, letterSpacing: 0.3 },
  revealInfoValue: { fontSize: 13 },
  revealNote: { fontSize: 13, lineHeight: 20 },
  revealBtn: {
    backgroundColor: GOLD,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  revealBtnDisabled: { opacity: 0.7 },
  revealBtnText:     { fontSize: 15, color: '#0C0904', letterSpacing: 0.4 },

  revealedState:       { gap: 12 },
  revealedMsg:         { fontSize: 15, color: GREEN },
  viewGalleryBtn:      { borderWidth: 1.5, borderRadius: 12, paddingVertical: 14, alignItems: 'center', backgroundColor: GOLD_T },
  viewGalleryBtnText:  { fontSize: 14, color: GOLD, letterSpacing: 1.4 },

  // Revenue section
  revenueGrid: { flexDirection: 'row', gap: 10 },
  revenueCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    gap: 6,
  },
  revenueCardLabel: { fontSize: 11, letterSpacing: 0.3, lineHeight: 16 },
  revenueCardValue: { fontSize: 20 },

  payoutBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  payoutBoxTitle: { fontSize: 12, letterSpacing: 1.5 },
  payoutRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  payoutAmount:   { fontSize: 18 },
  payoutDate:     { fontSize: 12, marginTop: 2 },
  payoutNote:     { fontSize: 13, lineHeight: 20 },
  payoutBadge:    { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  payoutBadgeText: { fontSize: 10, letterSpacing: 1 },

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
