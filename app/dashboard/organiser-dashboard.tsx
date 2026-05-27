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
import { REVENUE_SHARE, PUBLIC_PARTICIPANT_PRICING } from '../../shared/constants';

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
const GOLD_B     = 'rgba(212,168,83,0.28)';
const GREEN      = '#4CAF50';
const BLUE       = '#5B8AF0';
const RED        = '#FF5252';
const H_PAD      = 24;
const JOIN_BASE  = 'https://join.guestfulclicks.com/guest/join?code=';
const { width: SW } = Dimensions.get('window');

// Tier display meta
const TIER_META: Record<number, { label: string; color: string }> = {
  99:  { label: '₹99',  color: '#888888' },
  199: { label: '₹199', color: BLUE      },
  299: { label: '₹299', color: GOLD      },
  499: { label: '₹499', color: '#E8C456' },
};
const TIER_PRICES = PUBLIC_PARTICIPANT_PRICING.map(t => t.price) as number[];

// ── Types ─────────────────────────────────────────────────────────────────────

type DashView = 'list' | 'event';

interface EventRow {
  id: string;
  title: string;
  event_date: string;
  reveal_time: string;
  event_end_time: string | null;
  aesthetic: string;
  status: 'active' | 'revealed' | 'archived';
  share_code: string;
  invitation_card: string | null;
}

interface CardStats {
  guestCount: number;
  photoCount: number;
  totalRevenue: number;
  organiserShare: number;
}

interface Earnings {
  thisMonth: number;
  pendingPayout: number;
  totalEarned: number;
}

interface PendingPayoutInfo {
  amount: number;
  scheduled_date: string;
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
  total_collected: number;
  status: 'pending' | 'scheduled' | 'paid' | 'failed';
  scheduled_date: string;
}

interface TierRow {
  price: number;
  count: number;
  revenue: number;
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
  const dt  = new Date(iso);
  const M   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const h   = dt.getHours(), min = dt.getMinutes();
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

function fmtINR(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`;
}

function organiserShare(revenue: number): number {
  return Math.floor(revenue * REVENUE_SHARE.organiserPercent / 100);
}

function platformShare(revenue: number): number {
  return Math.floor(revenue * (100 - REVENUE_SHARE.organiserPercent) / 100);
}

function buildTierBreakdown(participants: ParticipantRow[]): TierRow[] {
  const map: Record<number, number> = {};
  TIER_PRICES.forEach(p => { map[p] = 0; });
  participants.forEach(p => {
    if (p.amount_paid in map) map[p.amount_paid]++;
  });
  return TIER_PRICES.map(price => ({
    price,
    count:   map[price],
    revenue: map[price] * price,
  }));
}

function pad(n: number): string { return String(n).padStart(2, '0'); }

function revealCountdown(iso: string, status: string): string {
  if (status === 'revealed') return 'Revealed';
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'Auto-reveal';
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
      <View style={[sc.logoDot, { backgroundColor: GOLD }]} />
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
      <Text style={[sc.statLabel, { color: textColor, opacity: 0.5 }]}>{label}</Text>
    </View>
  );
}

function TierPill({ amount }: { amount: number }) {
  const meta = TIER_META[amount];
  if (!meta) return null;
  return (
    <View style={[sc.tierPill, { borderColor: meta.color }]}>
      <Text style={[sc.tierPillText, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OrganiserDashboard() {
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts({ PlayfairDisplay_400Regular, PlayfairDisplay_700Bold });
  const serif     = fontsLoaded ? 'PlayfairDisplay_400Regular' : undefined;
  const serifBold = fontsLoaded ? 'PlayfairDisplay_700Bold'    : undefined;

  const [theme, setTheme]         = useState(DEFAULT_TH);
  const [userId, setUserId]       = useState('');
  const [dashView, setDashView]   = useState<DashView>('list');
  const [isLoading, setIsLoading] = useState(true);

  // VIEW 1
  const [events, setEvents]         = useState<EventRow[]>([]);
  const [eventStats, setEventStats] = useState<Record<string, CardStats>>({});
  const [earnings, setEarnings]     = useState<Earnings>({ thisMonth: 0, pendingPayout: 0, totalEarned: 0 });
  const [pendingInfo, setPendingInfo] = useState<PendingPayoutInfo | null>(null);

  // VIEW 2
  const [selectedEvent, setSelectedEvent]   = useState<EventRow | null>(null);
  const [liveStats, setLiveStats]           = useState<CardStats & { platformShare: number }>({
    guestCount: 0, photoCount: 0, totalRevenue: 0, organiserShare: 0, platformShare: 0,
  });
  const [participants, setParticipants]     = useState<ParticipantRow[]>([]);
  const [tierBreakdown, setTierBreakdown]   = useState<TierRow[]>([]);
  const [eventPayout, setEventPayout]       = useState<PayoutRow | null>(null);
  const [revealStr, setRevealStr]           = useState('');
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsLoading(false); return; }
      setUserId(user.id);
      await Promise.all([loadEvents(user.id), loadEarnings(user.id)]);
      setIsLoading(false);
    })();
    return () => {
      statsTimerRef.current && clearInterval(statsTimerRef.current);
      cdTimerRef.current    && clearInterval(cdTimerRef.current);
      channelRef.current    && supabase.removeChannel(channelRef.current);
    };
  }, []);

  // ── Countdown ticker ────────────────────────────────────────────────────

  useEffect(() => {
    cdTimerRef.current && clearInterval(cdTimerRef.current);
    if (!selectedEvent) return;
    const tick = () => setRevealStr(revealCountdown(selectedEvent.reveal_time, selectedEvent.status));
    tick();
    cdTimerRef.current = setInterval(tick, 1000);
    return () => { cdTimerRef.current && clearInterval(cdTimerRef.current); };
  }, [selectedEvent]);

  // ── Data loaders ──────────────────────────────────────────────────────────

  const loadEvents = useCallback(async (uid: string) => {
    const { data: evs } = await supabase
      .from('events')
      .select('id, title, event_date, reveal_time, event_end_time, aesthetic, status, share_code, invitation_card')
      .eq('host_id', uid)
      .order('event_date', { ascending: false });

    if (!evs?.length) { setEvents([]); return; }
    setEvents(evs as EventRow[]);

    const entries = await Promise.all(
      evs.map(async ev => {
        const [{ count: gc }, { count: pc }, { data: paid }] = await Promise.all([
          supabase.from('participants').select('*', { count: 'exact', head: true }).eq('event_id', ev.id),
          supabase.from('photos').select('*', { count: 'exact', head: true }).eq('event_id', ev.id),
          supabase.from('participants').select('amount_paid').eq('event_id', ev.id),
        ]);
        const rev = (paid ?? []).reduce((s: number, r: any) => s + (r.amount_paid ?? 0), 0);
        return [ev.id, {
          guestCount:     gc ?? 0,
          photoCount:     pc ?? 0,
          totalRevenue:   rev,
          organiserShare: organiserShare(rev),
        }] as const;
      })
    );
    setEventStats(Object.fromEntries(entries));
  }, []);

  const loadEarnings = useCallback(async (uid: string) => {
    const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    // Get organiser's event IDs for this-month calculation
    const { data: evIds } = await supabase
      .from('events').select('id').eq('host_id', uid);
    const ids = (evIds ?? []).map((e: any) => e.id);

    const [{ data: thisMonthParts }, { data: pending }, { data: paid }] = await Promise.all([
      ids.length
        ? supabase.from('participants').select('amount_paid').in('event_id', ids).gte('joined_at', firstOfMonth)
        : Promise.resolve({ data: [] }),
      supabase.from('payouts').select('total_collected, scheduled_date, status')
        .eq('organiser_id', uid).in('status', ['pending', 'scheduled'])
        .order('scheduled_date', { ascending: true }),
      supabase.from('payouts').select('total_collected')
        .eq('organiser_id', uid).eq('status', 'paid'),
    ]);

    const thisMonth    = organiserShare((thisMonthParts ?? []).reduce((s: number, r: any) => s + (r.amount_paid ?? 0), 0));
    const pendingTotal = (pending ?? []).reduce((s: number, r: any) => s + (r.total_collected ?? 0), 0);
    const totalEarned  = (paid ?? []).reduce((s: number, r: any) => s + (r.total_collected ?? 0), 0);

    setEarnings({ thisMonth, pendingPayout: pendingTotal, totalEarned });

    const firstPending = (pending ?? []).find((p: any) => p.scheduled_date) ?? null;
    if (firstPending) {
      setPendingInfo({ amount: firstPending.total_collected ?? 0, scheduled_date: firstPending.scheduled_date });
    }
  }, []);

  const openEvent = useCallback(async (ev: EventRow) => {
    setSelectedEvent(ev);
    setDashView('event');
    await fetchEventDetail(ev);
    setupRealtimeAndPolling(ev);
  }, []);

  async function fetchEventDetail(ev: EventRow) {
    const [{ count: gc }, { count: pc }, { data: ps }, { data: po }] = await Promise.all([
      supabase.from('participants').select('*', { count: 'exact', head: true }).eq('event_id', ev.id),
      supabase.from('photos').select('*', { count: 'exact', head: true }).eq('event_id', ev.id),
      supabase.from('participants')
        .select('id, name, upload_count, joined_at, amount_paid')
        .eq('event_id', ev.id)
        .order('joined_at', { ascending: false }),
      supabase.from('payouts')
        .select('id, total_collected, status, scheduled_date')
        .eq('event_id', ev.id)
        .maybeSingle(),
    ]);

    const rows  = (ps ?? []) as ParticipantRow[];
    const rev   = rows.reduce((s, r) => s + (r.amount_paid ?? 0), 0);
    const oShare = organiserShare(rev);
    const pShare = platformShare(rev);

    setLiveStats({ guestCount: gc ?? 0, photoCount: pc ?? 0, totalRevenue: rev, organiserShare: oShare, platformShare: pShare });
    setParticipants(rows);
    setTierBreakdown(buildTierBreakdown(rows));
    setEventPayout(po as PayoutRow | null);
  }

  function setupRealtimeAndPolling(ev: EventRow) {
    statsTimerRef.current && clearInterval(statsTimerRef.current);
    channelRef.current    && supabase.removeChannel(channelRef.current);
    statsTimerRef.current = setInterval(() => fetchEventDetail(ev), 30000);

    const ch = supabase
      .channel(`org-ev-${ev.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'participants', filter: `event_id=eq.${ev.id}` },
        (payload: any) => {
          const np = payload.new as ParticipantRow;
          setParticipants(prev => {
            const next = [np, ...prev];
            setTierBreakdown(buildTierBreakdown(next));
            return next;
          });
          setLiveStats(prev => {
            const newRev   = prev.totalRevenue + (np.amount_paid ?? 0);
            return {
              ...prev,
              guestCount:     prev.guestCount + 1,
              totalRevenue:   newRev,
              organiserShare: organiserShare(newRev),
              platformShare:  platformShare(newRev),
            };
          });
        })
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'photos', filter: `event_id=eq.${ev.id}` },
        () => setLiveStats(prev => ({ ...prev, photoCount: prev.photoCount + 1 })))
      .subscribe();
    channelRef.current = ch;
  }

  function goBack() {
    statsTimerRef.current && clearInterval(statsTimerRef.current);
    channelRef.current    && supabase.removeChannel(channelRef.current);
    setDashView('list');
    setSelectedEvent(null);
    if (userId) loadEvents(userId);
  }

  // ── Reveal handler ────────────────────────────────────────────────────────

  const handleReveal = () => {
    if (!selectedEvent) return;
    Alert.alert(
      'Reveal gallery now?',
      'All participants will see the full gallery immediately. This cannot be undone.',
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

  // ── Share / QR actions ─────────────────────────────────────────────────────

  const shareUrl = selectedEvent ? `${JOIN_BASE}${selectedEvent.share_code}` : '';

  const handleShareLink = async () => {
    await Share.share({ message: `Join ${selectedEvent?.title}: ${shareUrl}` }).catch(() => {});
  };

  const handleWhatsApp = async () => {
    const wa = `whatsapp://send?text=${encodeURIComponent(`Join ${selectedEvent?.title ?? 'my event'}: ${shareUrl}`)}`;
    (await Linking.canOpenURL(wa)) ? Linking.openURL(wa) : Alert.alert('WhatsApp not installed');
  };

  const handleEmail = () => {
    const subject = encodeURIComponent(`Join ${selectedEvent?.title ?? 'my event'}`);
    const body    = encodeURIComponent(`Hi! I'd love for you to join my event.\n\nScan the QR or visit: ${shareUrl}`);
    Linking.openURL(`mailto:?subject=${subject}&body=${body}`);
  };

  const handleCopyLink = async () => {
    if (Platform.OS === 'web') {
      try {
        await (navigator as any).clipboard?.writeText(shareUrl);
        Alert.alert('Copied!', shareUrl);
      } catch {
        Alert.alert('Link', shareUrl);
      }
    } else {
      await Share.share({ message: shareUrl }).catch(() => {});
    }
  };

  const handlePrint = () => {
    if (Platform.OS === 'web') {
      (window as any).print?.();
    } else {
      Alert.alert('Print', 'Open Guestful Clicks on a web browser to print the poster.');
    }
  };

  const handleSavePoster = async () => {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow gallery access to save the QR code.'); return; }
    qrRef.current?.toDataURL(async (base64: string) => {
      try {
        const uri = `${FileSystem.documentDirectory}guestful_poster_${selectedEvent?.share_code}.png`;
        await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
        await MediaLibrary.saveToLibraryAsync(uri);
        Alert.alert('Saved!', 'QR code saved to your gallery.');
      } catch { Alert.alert('Error', 'Could not save. Please try again.'); }
    });
  };

  // ── Download all ──────────────────────────────────────────────────────────

  const handleDownloadAll = async () => {
    if (!selectedEvent) return;
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow gallery access to save photos.'); return; }
    const { data: photos } = await supabase
      .from('photos').select('url').eq('event_id', selectedEvent.id).eq('is_revealed', true);
    if (!photos?.length) { Alert.alert('No photos', 'No revealed photos for this event yet.'); return; }
    setSavingProgress({ c: 0, t: photos.length });
    let saved = 0;
    for (const photo of photos) {
      try {
        const loc = `${FileSystem.documentDirectory}guestful_${Date.now()}.jpg`;
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
  const MUTED = `${TXT}80`;

  // ── VIEW 1 — ORGANISER HOME ───────────────────────────────────────────────

  if (dashView === 'list') {
    return (
      <View style={[sc.root, { backgroundColor: BG }]}>
        <StatusBar barStyle="light-content" />

        {/* Top bar */}
        <View style={[sc.topBar, { borderBottomColor: `${TXT}14` }]}>
          <View style={sc.topBarCenter}><Logo textColor={TXT} /></View>
        </View>

        {/* List header */}
        <View style={[sc.listHeader, { borderBottomColor: `${TXT}14` }]}>
          <Text style={[sc.listHeading, { color: TXT, fontFamily: serifBold }]}>My Events</Text>
          <TouchableOpacity
            style={sc.newEventBtn}
            onPress={() => router.push('/create-event/event-type' as any)}
          >
            <Text style={[sc.newEventBtnText, { fontFamily: serifBold }]}>＋ New Event</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>

          {/* ── Earnings summary card ─────────────────────────────────── */}
          <View style={[sc.earningsCard, { borderColor: GOLD_B, backgroundColor: GOLD_T }]}>
            <View style={sc.earningsRow}>
              {/* This month */}
              <View style={sc.earningsCol}>
                <Text style={[sc.earningsLabel, { color: MUTED, fontFamily: serif }]}>THIS MONTH</Text>
                <Text style={[sc.earningsAmount, { fontFamily: serifBold }]}>
                  {fmtINR(earnings.thisMonth)}
                </Text>
              </View>

              <View style={[sc.earningsDivider, { backgroundColor: GOLD_B }]} />

              {/* Pending payout */}
              <View style={sc.earningsCol}>
                <Text style={[sc.earningsLabel, { color: MUTED, fontFamily: serif }]}>PENDING PAYOUT</Text>
                <Text style={[sc.earningsAmount, { fontFamily: serifBold }]}>
                  {fmtINR(earnings.pendingPayout)}
                </Text>
              </View>

              <View style={[sc.earningsDivider, { backgroundColor: GOLD_B }]} />

              {/* Total earned */}
              <View style={sc.earningsCol}>
                <Text style={[sc.earningsLabel, { color: MUTED, fontFamily: serif }]}>TOTAL EARNED</Text>
                <Text style={[sc.earningsAmount, { fontFamily: serifBold }]}>
                  {fmtINR(earnings.totalEarned)}
                </Text>
              </View>
            </View>
          </View>

          {/* ── Pending payout info banner ────────────────────────────── */}
          {pendingInfo && pendingInfo.scheduled_date && (
            <View style={[sc.pendingBanner, { borderColor: GOLD_B }]}>
              <Text style={sc.pendingIcon}>⏳</Text>
              <Text style={[sc.pendingText, { fontFamily: serif, color: TXT }]}>
                <Text style={{ fontFamily: serifBold, color: GOLD }}>{fmtINR(pendingInfo.amount)}</Text>
                {' transfers to your UPI on '}
                <Text style={{ fontFamily: serifBold }}>{fmtDate(pendingInfo.scheduled_date)}</Text>
              </Text>
            </View>
          )}

          {/* ── Events list ───────────────────────────────────────────── */}
          {events.length === 0 ? (
            <View style={sc.emptyState}>
              <Text style={sc.emptyIcon}>🎪</Text>
              <Text style={[sc.emptyTitle, { color: TXT, fontFamily: serifBold }]}>No events yet.</Text>
              <Text style={[sc.emptyBody, { color: MUTED, fontFamily: serif }]}>
                Create your first public event and start earning.
              </Text>
              <TouchableOpacity
                style={sc.createBtn}
                onPress={() => router.push('/create-event/event-type' as any)}
              >
                <Text style={[sc.createBtnText, { fontFamily: serifBold }]}>Create an Event →</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={sc.eventsList}>
              {events.map(ev => {
                const cs = eventStats[ev.id] ?? { guestCount: 0, photoCount: 0, totalRevenue: 0, organiserShare: 0 };
                return (
                  <TouchableOpacity
                    key={ev.id}
                    style={[sc.eventCard, { borderColor: `${TXT}18` }]}
                    onPress={() => openEvent(ev)}
                    activeOpacity={0.82}
                  >
                    {ev.invitation_card ? (
                      <Image source={{ uri: ev.invitation_card }} style={sc.cardThumb} />
                    ) : (
                      <View style={[sc.cardThumb, sc.cardThumbPH]}>
                        <Text style={{ fontSize: 20 }}>🎪</Text>
                      </View>
                    )}

                    <View style={sc.cardBody}>
                      <View style={sc.cardTitleRow}>
                        <Text style={[sc.cardTitle, { color: TXT, fontFamily: serifBold }]} numberOfLines={1}>
                          {ev.title}
                        </Text>
                        <StatusPill status={ev.status} />
                      </View>
                      <Text style={[sc.cardDate, { color: MUTED, fontFamily: serif }]}>{fmtDate(ev.event_date)}</Text>
                      <View style={sc.cardStatsRow}>
                        <Text style={[sc.cardStat, { color: TXT, fontFamily: serif }]}>
                          👥 {cs.guestCount}
                        </Text>
                        <Text style={[sc.cardStat, { color: TXT, fontFamily: serif }]}>
                          📷 {cs.photoCount}
                        </Text>
                        <Text style={[sc.cardStat, { color: TXT, fontFamily: serif }]}>
                          {fmtINR(cs.totalRevenue)}
                        </Text>
                      </View>
                      {cs.totalRevenue > 0 && (
                        <Text style={[sc.cardShare, { fontFamily: serifBold }]}>
                          {fmtINR(cs.organiserShare)} ({REVENUE_SHARE.organiserPercent}% your share)
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    );
  }

  // ── VIEW 2 — SINGLE EVENT DASHBOARD ──────────────────────────────────────

  if (!selectedEvent) return null;

  const tierTotal = tierBreakdown.reduce((s, t) => ({ count: s.count + t.count, revenue: s.revenue + t.revenue }), { count: 0, revenue: 0 });

  const payoutStatusMeta: Record<string, { icon: string; label: string; color: string }> = {
    pending:   { icon: '●', label: 'Pending',            color: MUTED },
    scheduled: { icon: '●', label: `Scheduled · transfers ${eventPayout?.scheduled_date ? fmtDate(eventPayout.scheduled_date) : '—'}`, color: GREEN },
    paid:      { icon: '●', label: `Paid · ${eventPayout?.scheduled_date ? fmtDate(eventPayout.scheduled_date) : '—'}`, color: GOLD },
    failed:    { icon: '●', label: 'Failed',             color: RED   },
  };

  return (
    <View style={[sc.root, { backgroundColor: BG }]}>
      <StatusBar barStyle="light-content" />

      {/* Top bar */}
      <View style={[sc.topBar, { borderBottomColor: `${TXT}14` }]}>
        <TouchableOpacity style={sc.backBtn} onPress={goBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={[sc.backArrow, { color: TXT }]}>←</Text>
        </TouchableOpacity>
        <View style={sc.topBarCenter}><Logo textColor={TXT} /></View>
        <View style={sc.backBtn} />
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>

        {/* ── Event header ──────────────────────────────────────────── */}
        <View style={sc.eventHeader}>
          <Text style={[sc.eventTitle, { color: TXT, fontFamily: serifBold }]} numberOfLines={2}>
            {selectedEvent.title}
          </Text>
          <View style={sc.eventMetaRow}>
            <Text style={[sc.eventMeta, { color: MUTED, fontFamily: serif }]}>{fmtDate(selectedEvent.event_date)}</Text>
            <StatusPill status={selectedEvent.status} />
          </View>
        </View>

        {/* ── Live stats row ────────────────────────────────────────── */}
        <View style={sc.statsRow}>
          <StatCard icon="👥" label="Participants" value={String(liveStats.guestCount)} textColor={TXT} />
          <StatCard icon="💰" label="Revenue"      value={fmtINR(liveStats.totalRevenue)} textColor={TXT} />
          <StatCard icon="📊" label="Your 25%"     value={fmtINR(liveStats.organiserShare)} textColor={TXT} />
          <StatCard icon="📷" label="Photos"       value={String(liveStats.photoCount)} textColor={TXT} />
        </View>

        {/* ── Revenue breakdown card ────────────────────────────────── */}
        <View style={[sc.section, { borderColor: `${TXT}14` }]}>
          <Text style={[sc.sectionHeading, { color: TXT, fontFamily: serifBold }]}>REVENUE</Text>

          <View style={[sc.revenueCard, { borderColor: GOLD_B, backgroundColor: GOLD_T }]}>
            <View style={sc.revRow}>
              <Text style={[sc.revLabel, { color: MUTED, fontFamily: serif }]}>Total collected</Text>
              <Text style={[sc.revValue, { color: TXT, fontFamily: serifBold }]}>{fmtINR(liveStats.totalRevenue)}</Text>
            </View>
            <View style={[sc.revDivider, { backgroundColor: GOLD_B }]} />
            <View style={sc.revRow}>
              <Text style={[sc.revLabel, { color: MUTED, fontFamily: serif }]}>Guestful share (75%)</Text>
              <Text style={[sc.revValue, { color: MUTED, fontFamily: serif }]}>{fmtINR(liveStats.platformShare)}</Text>
            </View>
            <View style={[sc.revDivider, { backgroundColor: GOLD_B }]} />
            <View style={sc.revRow}>
              <Text style={[sc.revLabelBig, { color: GOLD, fontFamily: serifBold }]}>Your share (25%)</Text>
              <Text style={[sc.revValueBig, { fontFamily: serifBold }]}>{fmtINR(liveStats.organiserShare)}</Text>
            </View>
            {eventPayout && (
              <>
                <View style={[sc.revDivider, { backgroundColor: GOLD_B }]} />
                <View style={sc.revRow}>
                  <Text style={[sc.revLabel, { color: MUTED, fontFamily: serif }]}>Payout status</Text>
                  <View style={sc.payoutStatusRow}>
                    <Text style={[sc.payoutStatusIcon, { color: payoutStatusMeta[eventPayout.status]?.color ?? MUTED }]}>
                      {payoutStatusMeta[eventPayout.status]?.icon}
                    </Text>
                    <Text style={[sc.payoutStatusText, { color: payoutStatusMeta[eventPayout.status]?.color ?? MUTED, fontFamily: serif }]}>
                      {payoutStatusMeta[eventPayout.status]?.label}
                    </Text>
                  </View>
                </View>
              </>
            )}
            {!eventPayout && (
              <>
                <View style={[sc.revDivider, { backgroundColor: GOLD_B }]} />
                <Text style={[sc.payoutNote, { color: MUTED, fontFamily: serif }]}>
                  Payout initiated day {REVENUE_SHARE.payoutWindowStartDay}–{REVENUE_SHARE.payoutWindowEndDay} after your event.
                </Text>
              </>
            )}
          </View>
        </View>

        {/* ── Tier breakdown table ──────────────────────────────────── */}
        <View style={[sc.section, { borderColor: `${TXT}14` }]}>
          <Text style={[sc.sectionHeading, { color: TXT, fontFamily: serifBold }]}>TIER BREAKDOWN</Text>

          <View style={[sc.tierTable, { borderColor: `${TXT}18` }]}>
            {/* Header */}
            <View style={[sc.tierRow, sc.tierHeaderRow, { borderBottomColor: `${TXT}18` }]}>
              <Text style={[sc.tierColTier,  { color: MUTED, fontFamily: serifBold }]}>TIER</Text>
              <Text style={[sc.tierColCount, { color: MUTED, fontFamily: serifBold }]}>GUESTS</Text>
              <Text style={[sc.tierColRev,   { color: MUTED, fontFamily: serifBold }]}>REVENUE</Text>
            </View>

            {tierBreakdown.map(t => (
              <View key={t.price} style={[sc.tierRow, { borderBottomColor: `${TXT}0A` }]}>
                <View style={sc.tierColTier}>
                  <TierPill amount={t.price} />
                </View>
                <Text style={[sc.tierColCount, { color: TXT, fontFamily: serifBold }]}>{t.count}</Text>
                <Text style={[sc.tierColRev,   { color: GOLD, fontFamily: serifBold }]}>{fmtINR(t.revenue)}</Text>
              </View>
            ))}

            {/* Total row */}
            <View style={[sc.tierRow, sc.tierTotalRow, { borderTopColor: GOLD_B }]}>
              <Text style={[sc.tierColTier,  { color: TXT, fontFamily: serifBold }]}>TOTAL</Text>
              <Text style={[sc.tierColCount, { color: TXT, fontFamily: serifBold }]}>{tierTotal.count}</Text>
              <Text style={[sc.tierColRev,   { color: GOLD, fontFamily: serifBold }]}>{fmtINR(tierTotal.revenue)}</Text>
            </View>
          </View>
        </View>

        {/* ── QR Poster section ─────────────────────────────────────── */}
        <View style={[sc.section, { borderColor: `${TXT}14` }]}>
          <Text style={[sc.sectionHeading, { color: TXT, fontFamily: serifBold }]}>SHARE YOUR EVENT</Text>

          {/* Poster preview */}
          <View style={[sc.poster, { borderColor: GOLD_B }]}>
            <Text style={[sc.posterEventName, { fontFamily: serifBold }]} numberOfLines={2}>
              {selectedEvent.title}
            </Text>
            <Text style={[sc.posterDate, { fontFamily: serif }]}>{fmtDate(selectedEvent.event_date)}</Text>

            <View style={sc.posterQRWrap}>
              <CameraQRCode
                value={shareUrl}
                shareCode={selectedEvent.share_code}
                qrRef={qrRef}
                size={200}
              />
            </View>

            <Text style={[sc.posterScanText, { fontFamily: serif }]}>Scan to join the film</Text>

            <View style={[sc.posterDivider, { backgroundColor: GOLD_B }]} />
            <View style={sc.posterWatermark}>
              <View style={sc.posterDot} />
              <Text style={[sc.posterWatermarkText, { fontFamily: serif }]}>Guestful Clicks</Text>
            </View>
          </View>

          {/* Share buttons — 2 rows of 3 */}
          <View style={sc.shareGrid}>
            <TouchableOpacity style={[sc.shareBtn, { borderColor: `${TXT}20` }]} onPress={handlePrint}>
              <Text style={sc.shareBtnIcon}>🖨</Text>
              <Text style={[sc.shareBtnText, { color: TXT, fontFamily: serif }]}>Print</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[sc.shareBtn, { borderColor: `${TXT}20` }]} onPress={handleWhatsApp}>
              <Text style={sc.shareBtnIcon}>💬</Text>
              <Text style={[sc.shareBtnText, { color: TXT, fontFamily: serif }]}>WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[sc.shareBtn, { borderColor: `${TXT}20` }]} onPress={handleEmail}>
              <Text style={sc.shareBtnIcon}>📧</Text>
              <Text style={[sc.shareBtnText, { color: TXT, fontFamily: serif }]}>Email</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[sc.shareBtn, { borderColor: `${TXT}20` }]} onPress={handleCopyLink}>
              <Text style={sc.shareBtnIcon}>🔗</Text>
              <Text style={[sc.shareBtnText, { color: TXT, fontFamily: serif }]}>Copy Link</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[sc.shareBtn, { borderColor: `${TXT}20` }]} onPress={handleSavePoster}>
              <Text style={sc.shareBtnIcon}>⬇️</Text>
              <Text style={[sc.shareBtnText, { color: TXT, fontFamily: serif }]}>Save Poster</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[sc.shareBtn, { borderColor: `${TXT}20` }]} onPress={handleShareLink}>
              <Text style={sc.shareBtnIcon}>↗</Text>
              <Text style={[sc.shareBtnText, { color: TXT, fontFamily: serif }]}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Reveal section ────────────────────────────────────────── */}
        <View style={[sc.section, { borderColor: `${TXT}14` }]}>
          <Text style={[sc.sectionHeading, { color: TXT, fontFamily: serifBold }]}>REVEAL</Text>

          <View style={[sc.revealInfoBox, { borderColor: `${TXT}18` }]}>
            <Text style={[sc.revealInfoTitle, { color: MUTED, fontFamily: serif }]}>
              Gallery reveals 2 hours after your event ends
            </Text>
            {selectedEvent.event_end_time && (
              <View style={sc.revealTimeline}>
                <View style={sc.revealTimelineItem}>
                  <Text style={[sc.revealTimelineLabel, { color: MUTED, fontFamily: serif }]}>Event ends</Text>
                  <Text style={[sc.revealTimelineVal, { color: TXT, fontFamily: serifBold }]}>
                    {fmtRevealTime(selectedEvent.event_end_time)}
                  </Text>
                </View>
                <Text style={sc.revealArrow}>→</Text>
                <View style={sc.revealTimelineItem}>
                  <Text style={[sc.revealTimelineLabel, { color: MUTED, fontFamily: serif }]}>Gallery opens</Text>
                  <Text style={[sc.revealTimelineVal, { color: GOLD, fontFamily: serifBold }]}>
                    {fmtRevealTime(selectedEvent.reveal_time)}
                  </Text>
                </View>
                <View style={sc.revealCountdownBadge}>
                  <Text style={[sc.revealCountdownText, { fontFamily: serifBold }]}>{revealStr}</Text>
                </View>
              </View>
            )}
          </View>

          {selectedEvent.status === 'active' ? (
            <TouchableOpacity
              style={[sc.revealEarlyBtn, isRevealing && sc.revealEarlyBtnDim]}
              onPress={handleReveal}
              disabled={isRevealing}
              activeOpacity={0.85}
            >
              {isRevealing ? (
                <ActivityIndicator color={BG} size="small" />
              ) : (
                <Text style={[sc.revealEarlyBtnText, { fontFamily: serifBold }]}>Reveal Early</Text>
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

        {/* ── Download — post-reveal ─────────────────────────────────── */}
        {selectedEvent.status === 'revealed' && (
          <View style={[sc.section, { borderColor: `${TXT}14` }]}>
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

        {/* ── Participants list ──────────────────────────────────────── */}
        <View style={[sc.section, { borderColor: `${TXT}14` }]}>
          <Text style={[sc.sectionHeading, { color: TXT, fontFamily: serifBold }]}>WHO'S SHOOTING</Text>

          {participants.length === 0 ? (
            <Text style={[sc.emptySection, { color: MUTED, fontFamily: serif }]}>
              No participants yet. Share your event to get people joining.
            </Text>
          ) : (
            participants.map(p => {
              const tierMeta = TIER_META[p.amount_paid];
              return (
                <View key={p.id} style={[sc.guestRow, { borderBottomColor: `${TXT}0A` }]}>
                  <View style={[sc.guestAvatar, { backgroundColor: tierMeta?.color ?? GOLD }]}>
                    <Text style={sc.guestAvatarText}>{p.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={sc.guestInfo}>
                    <View style={sc.guestNameRow}>
                      <Text style={[sc.guestName, { color: TXT, fontFamily: serifBold }]}>{p.name}</Text>
                      {p.amount_paid > 0 && <TierPill amount={p.amount_paid} />}
                    </View>
                    <Text style={[sc.guestMeta, { color: MUTED, fontFamily: serif }]}>
                      {p.upload_count} photo{p.upload_count !== 1 ? 's' : ''} · {timeAgo(p.joined_at)}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

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
  logoDot:  { width: 8, height: 8, borderRadius: 4 },
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
  backBtn:   { width: 32 },
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
  listHeading:     { fontSize: 24, lineHeight: 30 },
  newEventBtn:     { backgroundColor: GOLD, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  newEventBtnText: { fontSize: 14, color: '#0C0904', letterSpacing: 0.3 },

  // Earnings card
  earningsCard: {
    marginHorizontal: H_PAD,
    marginTop: 20,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  earningsRow:   { flexDirection: 'row', alignItems: 'center' },
  earningsCol:   { flex: 1, alignItems: 'center', gap: 5 },
  earningsLabel: { fontSize: 9, letterSpacing: 1.2, textAlign: 'center' },
  earningsAmount: { fontSize: 18, color: GOLD, lineHeight: 24, textAlign: 'center' },
  earningsDivider: { width: 1, height: 44, marginHorizontal: 4 },

  // Pending payout banner
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: H_PAD,
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
    backgroundColor: GOLD_T,
  },
  pendingIcon: { fontSize: 16 },
  pendingText: { flex: 1, fontSize: 13, lineHeight: 20 },

  // Event list
  eventsList: { paddingHorizontal: H_PAD, paddingTop: 16, gap: 12 },

  eventCard: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  cardThumb: { width: 64, height: 64, borderRadius: 10, overflow: 'hidden' },
  cardThumbPH: { backgroundColor: '#1A1208', justifyContent: 'center', alignItems: 'center' },
  cardBody:      { flex: 1, gap: 4 },
  cardTitleRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  cardTitle:     { flex: 1, fontSize: 15, lineHeight: 22 },
  cardDate:      { fontSize: 12 },
  cardStatsRow:  { flexDirection: 'row', gap: 12, marginTop: 2 },
  cardStat:      { fontSize: 12 },
  cardShare:     { fontSize: 12, color: GOLD, marginTop: 2 },

  // Status pill
  pill:     { borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: 10, letterSpacing: 0.8 },

  // Empty state
  emptyState: { paddingHorizontal: H_PAD, paddingTop: 60, alignItems: 'center', gap: 12 },
  emptyIcon:  { fontSize: 52 },
  emptyTitle: { fontSize: 22, textAlign: 'center' },
  emptyBody:  { fontSize: 14, textAlign: 'center', lineHeight: 22, paddingHorizontal: 16 },
  createBtn:  { marginTop: 8, backgroundColor: GOLD, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28 },
  createBtnText: { fontSize: 15, color: '#0C0904' },

  // VIEW 2 — Event header
  eventHeader: {
    paddingHorizontal: H_PAD,
    paddingTop: 20,
    paddingBottom: 16,
    gap: 8,
  },
  eventTitle: { fontSize: 26, lineHeight: 34, letterSpacing: 0.2 },
  eventMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  eventMeta: { fontSize: 13 },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: H_PAD,
    gap: 8,
    marginBottom: 8,
  },
  statCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 3,
    backgroundColor: GOLD_T,
  },
  statIcon:  { fontSize: 14 },
  statVal:   { fontSize: 13, fontFamily: 'PlayfairDisplay_700Bold', textAlign: 'center' },
  statLabel: { fontSize: 9, letterSpacing: 0.4, textAlign: 'center' },

  // Section
  section: {
    paddingHorizontal: H_PAD,
    paddingTop: 20,
    paddingBottom: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
    marginTop: 8,
  },
  sectionHeading: { fontSize: 11, letterSpacing: 2.5 },
  emptySection:   { fontSize: 13, lineHeight: 20 },

  // Revenue breakdown card
  revenueCard: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  revRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  revDivider: { height: StyleSheet.hairlineWidth },
  revLabel:   { fontSize: 13 },
  revValue:   { fontSize: 14, fontFamily: 'PlayfairDisplay_400Regular' },
  revLabelBig: { fontSize: 14 },
  revValueBig: { fontSize: 22, color: GOLD },

  payoutStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  payoutStatusIcon: { fontSize: 10 },
  payoutStatusText: { fontSize: 13 },
  payoutNote: { fontSize: 12, lineHeight: 18, paddingBottom: 12 },

  // Tier table
  tierTable: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  tierRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  tierHeaderRow: { paddingVertical: 8, backgroundColor: 'rgba(255,255,255,0.04)' },
  tierTotalRow:  { borderTopWidth: 1, borderBottomWidth: 0, backgroundColor: GOLD_T },
  tierColTier:   { flex: 1.2, flexDirection: 'row', alignItems: 'center' },
  tierColCount:  { flex: 1, textAlign: 'right', fontSize: 13 },
  tierColRev:    { flex: 1.5, textAlign: 'right', fontSize: 13 },

  tierPill:     { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  tierPillText: { fontSize: 10, letterSpacing: 0.5, fontWeight: '600' },

  // Poster
  poster: {
    borderWidth: 1.5,
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#0C0904',
  },
  posterEventName:  { fontSize: 22, color: '#F0E8D5', lineHeight: 30, textAlign: 'center' },
  posterDate:       { fontSize: 13, color: 'rgba(240,232,213,0.55)', letterSpacing: 0.5 },
  posterQRWrap: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginVertical: 12,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10 },
      android: { elevation: 6 },
      default: {},
    }),
  },
  posterScanText:  { fontSize: 12, color: 'rgba(240,232,213,0.5)', letterSpacing: 1.2, textTransform: 'uppercase' },
  posterDivider:   { width: '60%', height: 1, marginVertical: 6 },
  posterWatermark: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  posterDot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: GOLD },
  posterWatermarkText: { fontSize: 11, color: 'rgba(240,232,213,0.4)', letterSpacing: 1.5, textTransform: 'uppercase' },

  // Share grid
  shareGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  shareBtn: {
    width: (SW - H_PAD * 2 - 20) / 3,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  shareBtnIcon: { fontSize: 22 },
  shareBtnText: { fontSize: 11, letterSpacing: 0.4, opacity: 0.8 },

  // Reveal section
  revealInfoBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  revealInfoTitle: { fontSize: 13, lineHeight: 20 },
  revealTimeline:  { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  revealTimelineItem: { gap: 2 },
  revealTimelineLabel: { fontSize: 10, letterSpacing: 0.8 },
  revealTimelineVal:   { fontSize: 12 },
  revealArrow: { fontSize: 16, color: GOLD, marginHorizontal: 4 },
  revealCountdownBadge: {
    backgroundColor: GOLD_T, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
    marginLeft: 'auto' as any,
  },
  revealCountdownText: { fontSize: 13, color: GOLD },

  revealEarlyBtn:     { backgroundColor: GOLD, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  revealEarlyBtnDim:  { opacity: 0.7 },
  revealEarlyBtnText: { fontSize: 15, color: '#0C0904', letterSpacing: 0.4 },

  revealedState:      { gap: 12 },
  revealedMsg:        { fontSize: 15, color: GREEN },
  viewGalleryBtn:     { borderWidth: 1.5, borderRadius: 12, paddingVertical: 14, alignItems: 'center', backgroundColor: GOLD_T },
  viewGalleryBtnText: { fontSize: 14, color: GOLD, letterSpacing: 1.4 },

  // Download
  savingWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  savingText: { fontSize: 13 },
  dlBtn:      { borderWidth: 1, borderColor: GOLD_B, borderRadius: 12, paddingVertical: 16, alignItems: 'center', backgroundColor: GOLD_T },
  dlBtnText:  { fontSize: 15, color: GOLD, letterSpacing: 0.3 },

  // Guest list
  guestRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  guestAvatar:    { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
  guestAvatarText: { fontSize: 15, color: '#FFFFFF', fontWeight: '700' },
  guestInfo:      { flex: 1, gap: 3 },
  guestNameRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  guestName:      { fontSize: 14, lineHeight: 20 },
  guestMeta:      { fontSize: 12 },
});
