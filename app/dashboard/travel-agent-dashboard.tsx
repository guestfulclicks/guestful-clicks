import React, {
  useCallback, useEffect, useRef, useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
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
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import CameraQRCode from '../../shared/components/CameraQRCode';
import { supabase } from '../../supabase/client';
import { buildJoinURL, buildWhatsAppMessage } from '../../shared/utils';

// ── Theme ──────────────────────────────────────────────────────────────────

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
const AMBER      = '#F59E0B';
const H_PAD      = 24;
const TOP_PAD    = Platform.OS === 'ios' ? 52 : 36;
const { width: SW } = Dimensions.get('window');

// ── Types ──────────────────────────────────────────────────────────────────

type TAView = 'list' | 'trip';

interface TripRow {
  id: string;
  title: string;
  event_date: string | null;
  event_end_time: string | null;
  status: 'active' | 'revealed' | 'archived';
  share_code: string;
  reveal_mode: string | null;
  city: string | null;
}

interface BookingRow {
  id: string;
  event_id: string;
  total_travellers: number;
  price_per_person: number;
  total_paid: number;
  payment_id: string | null;
  slots_remaining: number;
  created_at: string;
  package_name: string;
  package_shots: number;
}

interface AgencyInfo {
  agency_name: string | null;
  iata_code: string | null;
  trip_type: string | null;
}

interface TravelerRow {
  id: string;
  name: string;
  upload_count: number;
  shot_limit: number;
  joined_at: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d} ${months[m - 1]} ${y}`;
}

function fmtINR(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`;
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

function deriveTripStatus(trip: TripRow): 'upcoming' | 'active' | 'revealed' | 'archived' {
  if (trip.status === 'revealed') return 'revealed';
  if (trip.status === 'archived') return 'archived';
  const start = trip.event_date
    ? new Date(`${trip.event_date}T00:00:00`).getTime()
    : 0;
  return start > Date.now() ? 'upcoming' : 'active';
}

function daysUntilRevealLabel(trip: TripRow): string {
  if (trip.status === 'revealed') return 'Revealed';
  if (trip.reveal_mode === 'during') return 'Live 📡';
  if (!trip.event_end_time) return '—';
  const diff = new Date(`${trip.event_end_time}T23:59:59`).getTime() - Date.now();
  if (diff <= 0) return 'Today';
  return `${Math.ceil(diff / 86400000)}d`;
}

function tripTypeBadge(t: string | null) {
  const map: Record<string, { label: string; color: string }> = {
    domestic:      { label: 'Domestic',      color: '#5B8AF0' },
    international: { label: 'International', color: GOLD      },
    both:          { label: 'All Routes',    color: GREEN     },
  };
  return map[t ?? ''] ?? { label: 'Travel', color: '#888' };
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Logo({ textColor }: { textColor: string }) {
  return (
    <View style={sc.logoRow}>
      <View style={[sc.logoDot, { backgroundColor: GOLD }]} />
      <Text style={[sc.logoText, { color: textColor }]}>GUESTFUL CLICKS</Text>
    </View>
  );
}

function TripStatusPill({
  status, pulseOpacity,
}: {
  status: ReturnType<typeof deriveTripStatus>;
  pulseOpacity: Animated.Value;
}) {
  const map = {
    upcoming: { label: 'UPCOMING', color: '#5B8AF0' },
    active:   { label: 'ACTIVE',   color: GREEN      },
    revealed: { label: 'REVEALED', color: GOLD       },
    archived: { label: 'ARCHIVED', color: '#888'     },
  };
  const { label, color } = map[status];
  return (
    <View style={[sc.pill, { borderColor: color }]}>
      {status === 'active' && (
        <Animated.View style={[sc.pillDot, { backgroundColor: color, opacity: pulseOpacity }]} />
      )}
      <Text style={[sc.pillText, { color }]}>{label}</Text>
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
      <Text style={[sc.statLbl, { color: textColor }]}>{label}</Text>
    </View>
  );
}

function SectionHead({ title, textColor, serifBold }: {
  title: string; textColor: string; serifBold?: string;
}) {
  return (
    <Text style={[sc.secHead, { color: textColor, fontFamily: serifBold }]}>{title}</Text>
  );
}

function ProgressBar({ filled, total }: { filled: number; total: number }) {
  const safeFilled = Math.max(0, Math.min(filled, total));
  const safeEmpty  = Math.max(0, total - safeFilled);
  if (total <= 0) return null;
  return (
    <View style={sc.progressTrack}>
      <View style={[sc.progressFill, { flex: safeFilled || 0.001 }]} />
      {safeEmpty > 0 && <View style={{ flex: safeEmpty }} />}
    </View>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function TravelAgentDashboard({ userId }: { userId: string }) {
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts({ PlayfairDisplay_400Regular, PlayfairDisplay_700Bold });
  const serif     = fontsLoaded ? 'PlayfairDisplay_400Regular' : undefined;
  const serifBold = fontsLoaded ? 'PlayfairDisplay_700Bold'    : undefined;

  const [theme, setTheme]   = useState(DEFAULT_TH);
  const [isLoading, setIsLoading] = useState(true);

  // Profile
  const [userEmail,   setUserEmail]   = useState('');
  const [showProfile, setShowProfile] = useState(false);
  const [agencyInfo,  setAgencyInfo]  = useState<AgencyInfo | null>(null);

  // VIEW 1
  const [view,         setView]         = useState<TAView>('list');
  const [trips,        setTrips]        = useState<TripRow[]>([]);
  const [bookings,     setBookings]     = useState<Record<string, BookingRow>>({});
  const [totalServed,  setTotalServed]  = useState(0);

  // VIEW 2
  const [selectedTrip,   setSelectedTrip]   = useState<TripRow | null>(null);
  const [tripBooking,    setTripBooking]     = useState<BookingRow | null>(null);
  const [travellers,     setTravellers]      = useState<TravelerRow[]>([]);
  const [joinedCount,    setJoinedCount]     = useState(0);
  const [photoCount,     setPhotoCount]      = useState(0);
  const [shotsUsed,      setShotsUsed]       = useState(0);
  const [isRevealing,    setIsRevealing]     = useState(false);
  const [savingProgress, setSavingProgress]  = useState<{ c: number; t: number } | null>(null);

  // Pulse animation for ACTIVE status
  const pulseOpacity = useRef(new Animated.Value(1)).current;
  const pulseAnim    = useRef<Animated.CompositeAnimation | null>(null);

  const qrRef          = useRef<any>(null);
  const pollTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef     = useRef<any>(null);

  // ── Init ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const key = await AsyncStorage.getItem(THEME_KEY);
      if (key && THEMES[key]) setTheme(THEMES[key]);

      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserEmail(user.email ?? '');

      await Promise.all([loadAgency(), loadTrips()]);
      setIsLoading(false);
    })();

    // Pulse animation loop
    pulseAnim.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseOpacity, { toValue: 0.25, duration: 850, useNativeDriver: true }),
        Animated.timing(pulseOpacity, { toValue: 1,    duration: 850, useNativeDriver: true }),
      ])
    );
    pulseAnim.current.start();

    return () => {
      pulseAnim.current?.stop();
      pollTimerRef.current && clearInterval(pollTimerRef.current);
      channelRef.current   && supabase.removeChannel(channelRef.current);
    };
  }, []);

  // ── Data loaders ──────────────────────────────────────────────────────────

  const loadAgency = useCallback(async () => {
    const { data } = await supabase
      .from('organiser_kyc')
      .select('agency_name, iata_code, trip_type')
      .eq('user_id', userId)
      .maybeSingle();
    setAgencyInfo(data as AgencyInfo | null);
  }, [userId]);

  const loadTrips = useCallback(async () => {
    const { data: evs } = await supabase
      .from('events')
      .select('id, title, event_date, event_end_time, status, share_code, reveal_mode, city')
      .eq('host_id', userId)
      .eq('type', 'public')
      .order('event_date', { ascending: false });

    const rows = (evs ?? []) as TripRow[];
    setTrips(rows);
    if (!rows.length) return;

    const ids = rows.map((r) => r.id);
    const { data: bks } = await supabase
      .from('travel_bookings')
      .select('id, event_id, total_travellers, price_per_person, total_paid, payment_id, slots_remaining, created_at, packages(name, shots)')
      .in('event_id', ids);

    const bkMap: Record<string, BookingRow> = {};
    let served = 0;
    (bks ?? []).forEach((b: any) => {
      const pkg = Array.isArray(b.packages) ? b.packages[0] : b.packages;
      bkMap[b.event_id] = {
        id:               b.id,
        event_id:         b.event_id,
        total_travellers: b.total_travellers,
        price_per_person: b.price_per_person,
        total_paid:       b.total_paid,
        payment_id:       b.payment_id,
        slots_remaining:  b.slots_remaining,
        created_at:       b.created_at,
        package_name:     pkg?.name ?? '—',
        package_shots:    pkg?.shots ?? 0,
      };
      served += (b.total_travellers ?? 0) - (b.slots_remaining ?? 0);
    });
    setBookings(bkMap);
    setTotalServed(served);
  }, [userId]);

  // ── Trip detail ───────────────────────────────────────────────────────────

  const openTrip = useCallback(async (trip: TripRow) => {
    setSelectedTrip(trip);
    setView('trip');
    await fetchTripDetail(trip);
    startPollingAndRealtime(trip);
  }, []);

  const fetchTripDetail = useCallback(async (trip: TripRow) => {
    const [
      { data: bkData },
      { count: pc },
      { data: ps },
    ] = await Promise.all([
      supabase
        .from('travel_bookings')
        .select('id, event_id, total_travellers, price_per_person, total_paid, payment_id, slots_remaining, created_at, packages(name, shots)')
        .eq('event_id', trip.id)
        .maybeSingle(),
      supabase.from('photos').select('*', { count: 'exact', head: true }).eq('event_id', trip.id),
      supabase
        .from('participants')
        .select('id, name, upload_count, shot_limit, joined_at')
        .eq('event_id', trip.id)
        .order('joined_at', { ascending: false }),
    ]);

    const pkg = Array.isArray((bkData as any)?.packages)
      ? (bkData as any).packages[0]
      : (bkData as any)?.packages;

    if (bkData) {
      setTripBooking({
        id:               (bkData as any).id,
        event_id:         (bkData as any).event_id,
        total_travellers: (bkData as any).total_travellers,
        price_per_person: (bkData as any).price_per_person,
        total_paid:       (bkData as any).total_paid,
        payment_id:       (bkData as any).payment_id,
        slots_remaining:  (bkData as any).slots_remaining,
        created_at:       (bkData as any).created_at,
        package_name:     pkg?.name ?? '—',
        package_shots:    pkg?.shots ?? 0,
      });
    }

    const rows = (ps ?? []) as TravelerRow[];
    setTravellers(rows);
    setJoinedCount(rows.length);
    setPhotoCount(pc ?? 0);
    setShotsUsed(rows.reduce((s, r) => s + (r.upload_count ?? 0), 0));
  }, []);

  function startPollingAndRealtime(trip: TripRow) {
    pollTimerRef.current && clearInterval(pollTimerRef.current);
    channelRef.current   && supabase.removeChannel(channelRef.current);

    pollTimerRef.current = setInterval(() => fetchTripDetail(trip), 30000);

    const ch = supabase
      .channel(`ta-trip-${trip.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'participants', filter: `event_id=eq.${trip.id}` },
        (payload: any) => {
          const np = payload.new as TravelerRow;
          setTravellers((prev) => [np, ...prev]);
          setJoinedCount((c) => c + 1);
          // Update slots_remaining in bookings
          setTripBooking((prev) => prev ? { ...prev, slots_remaining: Math.max(0, prev.slots_remaining - 1) } : prev);
        })
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'photos', filter: `event_id=eq.${trip.id}` },
        () => setPhotoCount((c) => c + 1))
      .subscribe();
    channelRef.current = ch;
  }

  function goBack() {
    pollTimerRef.current && clearInterval(pollTimerRef.current);
    channelRef.current   && supabase.removeChannel(channelRef.current);
    setView('list');
    setSelectedTrip(null);
    setTripBooking(null);
    loadTrips();
  }

  // ── Reveal ────────────────────────────────────────────────────────────────

  const handleReveal = () => {
    if (!selectedTrip) return;
    Alert.alert(
      'Reveal gallery now?',
      'All travellers will see the full gallery immediately. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reveal Now',
          style: 'destructive',
          onPress: async () => {
            setIsRevealing(true);
            try {
              await supabase.from('events').update({ status: 'revealed' }).eq('id', selectedTrip.id);
              await supabase.from('photos').update({ is_revealed: true }).eq('event_id', selectedTrip.id).eq('is_revealed', false);
              const updated = { ...selectedTrip, status: 'revealed' as const };
              setSelectedTrip(updated);
              setTrips((prev) => prev.map((t) => (t.id === selectedTrip.id ? updated : t)));
            } finally {
              setIsRevealing(false);
            }
          },
        },
      ]
    );
  };

  // ── Share / QR actions ────────────────────────────────────────────────────

  const shareUrl  = selectedTrip ? buildJoinURL(selectedTrip.share_code) : '';
  const shareMsg  = selectedTrip ? buildWhatsAppMessage(selectedTrip.title, selectedTrip.share_code) : '';

  const handleWhatsApp = async () => {
    const wa = `whatsapp://send?text=${encodeURIComponent(shareMsg)}`;
    (await Linking.canOpenURL(wa)) ? Linking.openURL(wa) : Alert.alert('WhatsApp not installed');
  };

  const handleCopyLink = async () => {
    await Share.share({ message: shareUrl }).catch(() => {});
  };

  const handleSaveQR = async () => {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow gallery access to save the QR code.'); return; }
    qrRef.current?.toDataURL(async (base64: string) => {
      try {
        const uri = `${FileSystem.documentDirectory}guestful_qr_${selectedTrip?.share_code}.png`;
        await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
        await MediaLibrary.saveToLibraryAsync(uri);
        Alert.alert('Saved!', 'QR code saved to your gallery.');
      } catch { Alert.alert('Error', 'Could not save QR code.'); }
    });
  };

  const handleDownloadAll = async () => {
    if (!selectedTrip) return;
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed'); return; }
    const { data: photos } = await supabase
      .from('photos').select('url').eq('event_id', selectedTrip.id).eq('is_revealed', true);
    if (!photos?.length) { Alert.alert('No photos', 'No revealed photos yet.'); return; }
    setSavingProgress({ c: 0, t: photos.length });
    let saved = 0;
    for (const photo of photos) {
      try {
        const loc = `${FileSystem.documentDirectory}gc_${Date.now()}.jpg`;
        await FileSystem.downloadAsync(photo.url, loc);
        await MediaLibrary.saveToLibraryAsync(loc);
        saved++;
        setSavingProgress({ c: saved, t: photos.length });
      } catch { /* continue */ }
    }
    setSavingProgress(null);
    Alert.alert('Done!', `Saved ${saved} of ${photos.length} photos.`);
  };

  // ── Sign out ──────────────────────────────────────────────────────────────

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/auth/sign-in' as any);
  };

  // ── Guards ────────────────────────────────────────────────────────────────

  if (!fontsLoaded || isLoading) {
    return (
      <View style={[sc.root, { backgroundColor: DEFAULT_TH.background }, sc.center]}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator color={GOLD} size="large" />
      </View>
    );
  }

  const BG   = theme.background;
  const TXT  = theme.text;
  const MUTED = `${TXT}80`;

  // ─── VIEW 1 — TRIP LIST ─────────────────────────────────────────────────

  if (view === 'list') {
    const badge = tripTypeBadge(agencyInfo?.trip_type ?? null);
    return (
      <View style={[sc.root, { backgroundColor: BG }]}>
        <StatusBar barStyle="light-content" />

        {/* Top bar */}
        <View style={[sc.topBar, { borderBottomColor: `${TXT}14` }]}>
          <View style={sc.topBarLeft} />
          <View style={sc.topBarCenter}><Logo textColor={TXT} /></View>
          <TouchableOpacity
            style={[sc.profileCircle, { backgroundColor: GOLD }]}
            onPress={() => setShowProfile((p) => !p)}
          >
            <Text style={[sc.profileInitial, { fontFamily: serifBold }]}>
              {agencyInfo?.agency_name?.charAt(0)?.toUpperCase() || userEmail.charAt(0)?.toUpperCase() || '?'}
            </Text>
          </TouchableOpacity>

          {/* Profile dropdown */}
          {showProfile && (
            <View style={[sc.profileDropdown, { backgroundColor: BG, borderColor: GOLD_B }]}>
              <Text style={[sc.pdAgency, { color: TXT, fontFamily: serifBold }]} numberOfLines={1}>
                {agencyInfo?.agency_name || '—'}
              </Text>
              <Text style={[sc.pdEmail, { color: MUTED, fontFamily: serif }]} numberOfLines={1}>
                {userEmail}
              </Text>
              <View style={[sc.pdDivider, { backgroundColor: `${TXT}18` }]} />
              <TouchableOpacity style={sc.pdSignOut} onPress={handleSignOut}>
                <Text style={[sc.pdSignOutText, { fontFamily: serifBold }]}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* List header */}
        <View style={[sc.listHeader, { borderBottomColor: `${TXT}14` }]}>
          <Text style={[sc.listHeading, { color: TXT, fontFamily: serifBold }]}>My Trips</Text>
          <TouchableOpacity
            style={sc.newTripBtn}
            onPress={() => router.push('/create-event/travel-event' as any)}
          >
            <Text style={[sc.newTripBtnText, { fontFamily: serifBold }]}>＋ New Trip</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>

          {/* Agency info card */}
          <View style={[sc.agencyCard, { borderColor: GOLD_B, backgroundColor: GOLD_T }]}>
            <Text style={[sc.agencyName, { color: TXT, fontFamily: serifBold }]}>
              {agencyInfo?.agency_name || 'Your Agency'}
            </Text>

            <View style={sc.agencyBadgeRow}>
              {agencyInfo?.iata_code ? (
                <View style={[sc.agencyBadge, { borderColor: `${TXT}30` }]}>
                  <Text style={[sc.agencyBadgeText, { color: MUTED, fontFamily: serif }]}>
                    IATA {agencyInfo.iata_code}
                  </Text>
                </View>
              ) : null}
              <View style={[sc.agencyBadge, { borderColor: badge.color + '60', backgroundColor: badge.color + '18' }]}>
                <Text style={[sc.agencyBadgeText, { color: badge.color, fontFamily: serif }]}>
                  {badge.label}
                </Text>
              </View>
            </View>

            <View style={[sc.agencyStatsRow, { borderTopColor: GOLD_B }]}>
              <View style={sc.agencyStat}>
                <Text style={[sc.agencyStatVal, { fontFamily: serifBold }]}>{trips.length}</Text>
                <Text style={[sc.agencyStatLbl, { color: MUTED, fontFamily: serif }]}>Trips</Text>
              </View>
              <View style={[sc.agencyStatDivider, { backgroundColor: GOLD_B }]} />
              <View style={sc.agencyStat}>
                <Text style={[sc.agencyStatVal, { fontFamily: serifBold }]}>{totalServed}</Text>
                <Text style={[sc.agencyStatLbl, { color: MUTED, fontFamily: serif }]}>Travellers Served</Text>
              </View>
            </View>
          </View>

          {/* Trip list */}
          {trips.length === 0 ? (
            <View style={sc.emptyState}>
              <Text style={sc.emptyIcon}>✈️</Text>
              <Text style={[sc.emptyTitle, { color: TXT, fontFamily: serifBold }]}>No trips yet.</Text>
              <Text style={[sc.emptyBody, { color: MUTED, fontFamily: serif }]}>
                Create your first group trip film.
              </Text>
              <TouchableOpacity
                style={sc.createBtn}
                onPress={() => router.push('/create-event/travel-event' as any)}
              >
                <Text style={[sc.createBtnText, { fontFamily: serifBold }]}>Create a Trip →</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={sc.tripList}>
              {trips.map((trip) => {
                const bk      = bookings[trip.id];
                const derived = deriveTripStatus(trip);
                const joined  = bk ? (bk.total_travellers - bk.slots_remaining) : 0;
                const total   = bk?.total_travellers ?? 0;
                return (
                  <TouchableOpacity
                    key={trip.id}
                    style={[sc.tripCard, { borderColor: `${TXT}18` }]}
                    onPress={() => openTrip(trip)}
                    activeOpacity={0.82}
                  >
                    {/* Title + status */}
                    <View style={sc.tripCardTitleRow}>
                      <Text style={[sc.tripCardTitle, { color: TXT, fontFamily: serifBold }]} numberOfLines={1}>
                        {trip.title}
                      </Text>
                      <TripStatusPill status={derived} pulseOpacity={pulseOpacity} />
                    </View>

                    {/* Dates + city */}
                    <Text style={[sc.tripCardMeta, { color: MUTED, fontFamily: serif }]}>
                      {fmtDate(trip.event_date)} → {trip.event_end_time ? fmtDate(trip.event_end_time) : '—'}
                      {trip.city ? `  ·  ${trip.city}` : ''}
                    </Text>

                    {/* Package pill */}
                    {bk && (
                      <View style={sc.pkgPillRow}>
                        <View style={[sc.pkgPill, { borderColor: GOLD_B }]}>
                          <Text style={[sc.pkgPillText, { color: GOLD, fontFamily: serifBold }]}>
                            {bk.package_name}  ·  📷 {bk.package_shots} shots
                          </Text>
                        </View>
                      </View>
                    )}

                    {/* Slot progress */}
                    {bk && total > 0 && (
                      <View style={sc.slotWrap}>
                        <ProgressBar filled={joined} total={total} />
                        <Text style={[sc.slotText, { color: MUTED, fontFamily: serif }]}>
                          {joined} / {total} travellers joined
                        </Text>
                      </View>
                    )}
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

  // ─── VIEW 2 — TRIP DETAIL ───────────────────────────────────────────────

  if (!selectedTrip) return null;

  const derived     = deriveTripStatus(selectedTrip);
  const totalSlots  = tripBooking?.total_travellers ?? 0;
  const unusedSlots = tripBooking ? Math.max(0, tripBooking.slots_remaining) : 0;
  const gst         = tripBooking ? Math.round(tripBooking.total_paid * 18 / 118) : 0;

  return (
    <View style={[sc.root, { backgroundColor: BG }]}>
      <StatusBar barStyle="light-content" />

      {/* Top bar */}
      <View style={[sc.topBar, { borderBottomColor: `${TXT}14` }]}>
        <TouchableOpacity style={sc.backBtn} onPress={goBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={[sc.backArrow, { color: TXT }]}>←</Text>
        </TouchableOpacity>
        <View style={sc.topBarCenter}><Logo textColor={TXT} /></View>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      >

        {/* Trip header */}
        <View style={sc.tripHeader}>
          <Text style={[sc.tripTitle, { color: TXT, fontFamily: serifBold }]} numberOfLines={2}>
            {selectedTrip.title}
          </Text>
          <View style={sc.tripMetaRow}>
            <Text style={[sc.tripMeta, { color: MUTED, fontFamily: serif }]}>
              {fmtDate(selectedTrip.event_date)} → {selectedTrip.event_end_time ? fmtDate(selectedTrip.event_end_time) : '—'}
              {selectedTrip.city ? `  ·  ${selectedTrip.city}` : ''}
            </Text>
          </View>
          <TripStatusPill status={derived} pulseOpacity={pulseOpacity} />
        </View>

        {/* Stats row */}
        <View style={sc.statsRow}>
          <StatCard
            icon="👥"
            label={`/ ${totalSlots} slots`}
            value={String(joinedCount)}
            textColor={TXT}
          />
          <StatCard
            icon="📷"
            label="Photos"
            value={String(photoCount)}
            textColor={TXT}
          />
          <StatCard
            icon="🎞"
            label={`/ ${totalSlots * (tripBooking?.package_shots ?? 0)} total`}
            value={String(shotsUsed)}
            textColor={TXT}
          />
          <StatCard
            icon="⏱"
            label="Until reveal"
            value={daysUntilRevealLabel(selectedTrip)}
            textColor={TXT}
          />
        </View>

        {/* ── Slot utilisation card ─────────────────────────────────── */}
        <View style={[sc.section, { borderColor: `${TXT}14` }]}>
          <SectionHead title="SLOT UTILISATION" textColor={TXT} serifBold={serifBold} />

          <View style={[sc.slotCard, { borderColor: GOLD_B, backgroundColor: GOLD_T }]}>
            <Text style={[sc.slotBigText, { color: TXT, fontFamily: serifBold }]}>
              {joinedCount} of {totalSlots} travellers have joined
            </Text>
            <ProgressBar filled={joinedCount} total={totalSlots} />
            <Text style={[sc.slotUnused, { color: MUTED, fontFamily: serif }]}>
              {unusedSlots} slot{unusedSlots !== 1 ? 's' : ''} unused
            </Text>
            {unusedSlots > 0 && (
              <View style={[sc.amberBanner, { borderColor: AMBER + '60', backgroundColor: AMBER + '18' }]}>
                <Text style={[sc.amberText, { fontFamily: serif }]}>
                  ⚠ Unused slots are non-refundable.{'\n'}Share the QR with remaining travellers.
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Package details card ──────────────────────────────────── */}
        {tripBooking && (
          <View style={[sc.section, { borderColor: `${TXT}14` }]}>
            <SectionHead title="PACKAGE DETAILS" textColor={TXT} serifBold={serifBold} />

            <View style={[sc.detailCard, { borderColor: `${TXT}18` }]}>
              {[
                { label: 'Package',           value: tripBooking.package_name },
                { label: 'Shots per traveller', value: String(tripBooking.package_shots) },
                { label: 'Price per person',  value: fmtINR(tripBooking.price_per_person) },
                { label: 'Total paid',        value: fmtINR(tripBooking.total_paid) },
                { label: 'GST included',      value: fmtINR(gst) },
                { label: 'Payment ID',        value: tripBooking.payment_id ?? '—' },
                { label: 'Booked on',         value: fmtDate(tripBooking.created_at.split('T')[0]) },
              ].map((row, i) => (
                <View key={i} style={[sc.detailRow, { borderBottomColor: `${TXT}0A` }]}>
                  <Text style={[sc.detailLabel, { color: MUTED, fontFamily: serif }]}>{row.label}</Text>
                  <Text style={[sc.detailValue, { color: TXT, fontFamily: serif }]} numberOfLines={1}>
                    {row.value}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── QR Share section ──────────────────────────────────────── */}
        <View style={[sc.section, { borderColor: `${TXT}14` }]}>
          <SectionHead title="SHARE WITH YOUR TRAVELLERS" textColor={TXT} serifBold={serifBold} />

          <View style={sc.qrCenter}>
            <CameraQRCode
              value={shareUrl}
              shareCode={selectedTrip.share_code}
              qrRef={qrRef}
              size={210}
            />
          </View>

          <Text style={[sc.joinUrl, { color: MUTED, fontFamily: serif }]} numberOfLines={1}>
            {shareUrl}
          </Text>

          <View style={sc.shareRow}>
            <TouchableOpacity style={[sc.shareBtn, { borderColor: `${TXT}20` }]} onPress={handleWhatsApp}>
              <Text style={sc.shareBtnIcon}>💬</Text>
              <Text style={[sc.shareBtnText, { color: TXT, fontFamily: serif }]}>WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[sc.shareBtn, { borderColor: `${TXT}20` }]} onPress={handleCopyLink}>
              <Text style={sc.shareBtnIcon}>🔗</Text>
              <Text style={[sc.shareBtnText, { color: TXT, fontFamily: serif }]}>Copy Link</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[sc.shareBtn, { borderColor: `${TXT}20` }]} onPress={handleSaveQR}>
              <Text style={sc.shareBtnIcon}>⬇️</Text>
              <Text style={[sc.shareBtnText, { color: TXT, fontFamily: serif }]}>Save QR</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Travellers list ───────────────────────────────────────── */}
        <View style={[sc.section, { borderColor: `${TXT}14` }]}>
          <SectionHead title="WHO HAS JOINED" textColor={TXT} serifBold={serifBold} />

          {travellers.length === 0 ? (
            <Text style={[sc.emptySection, { color: MUTED, fontFamily: serif }]}>
              No travellers have joined yet. Share the QR code to get them started.
            </Text>
          ) : (
            travellers.map((t) => (
              <View key={t.id} style={[sc.travRow, { borderBottomColor: `${TXT}0A` }]}>
                <View style={[sc.travAvatar, { backgroundColor: GOLD }]}>
                  <Text style={sc.travAvatarText}>{t.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={sc.travInfo}>
                  <Text style={[sc.travName, { color: TXT, fontFamily: serifBold }]}>{t.name}</Text>
                  <Text style={[sc.travMeta, { color: MUTED, fontFamily: serif }]}>
                    📷 {t.upload_count} photo{t.upload_count !== 1 ? 's' : ''}
                    {'  ·  '}
                    🎞 {t.upload_count}/{t.shot_limit} shots
                    {'  ·  '}
                    {timeAgo(t.joined_at)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* ── Reveal section ────────────────────────────────────────── */}
        <View style={[sc.section, { borderColor: `${TXT}14` }]}>
          <SectionHead title="REVEAL" textColor={TXT} serifBold={serifBold} />

          <View style={[sc.revealBox, { borderColor: `${TXT}18` }]}>
            {selectedTrip.reveal_mode === 'during' ? (
              <View style={sc.revealLiveRow}>
                <Animated.View style={[sc.liveDot, { backgroundColor: GREEN, opacity: pulseOpacity }]} />
                <Text style={[sc.revealLiveText, { color: GREEN, fontFamily: serifBold }]}>
                  Live gallery — photos visible now
                </Text>
              </View>
            ) : (
              <Text style={[sc.revealInfoText, { color: MUTED, fontFamily: serif }]}>
                Gallery reveals automatically when your trip ends
                {selectedTrip.event_end_time ? ` on ${fmtDate(selectedTrip.event_end_time)}` : ''}.
              </Text>
            )}
          </View>

          {selectedTrip.status === 'active' && selectedTrip.reveal_mode !== 'during' && (
            <TouchableOpacity
              style={[sc.revealNowBtn, isRevealing && { opacity: 0.7 }]}
              onPress={handleReveal}
              disabled={isRevealing}
              activeOpacity={0.85}
            >
              {isRevealing
                ? <ActivityIndicator color={BG} size="small" />
                : <Text style={[sc.revealNowText, { fontFamily: serifBold }]}>Reveal Now</Text>
              }
            </TouchableOpacity>
          )}

          {selectedTrip.status === 'revealed' && (
            <TouchableOpacity
              style={[sc.galleryBtn, { borderColor: GOLD }]}
              onPress={() => router.push('/gallery/reveal-screen' as any)}
              activeOpacity={0.85}
            >
              <Text style={[sc.galleryBtnText, { fontFamily: serifBold }]}>View Full Gallery →</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Download — post-reveal ────────────────────────────────── */}
        {selectedTrip.status === 'revealed' && (
          <View style={[sc.section, { borderColor: `${TXT}14` }]}>
            <SectionHead title="DOWNLOAD" textColor={TXT} serifBold={serifBold} />
            {savingProgress ? (
              <View style={sc.savingRow}>
                <ActivityIndicator color={GOLD} size="small" />
                <Text style={[sc.savingText, { color: GOLD, fontFamily: serif }]}>
                  Saving {savingProgress.c} of {savingProgress.t}…
                </Text>
              </View>
            ) : (
              <TouchableOpacity style={sc.dlBtn} onPress={handleDownloadAll} activeOpacity={0.85}>
                <Text style={[sc.dlBtnText, { fontFamily: serifBold }]}>⬇️ Download All Photos</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

      </ScrollView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

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
    zIndex: 10,
  },
  topBarLeft:   { width: 36 },
  topBarCenter: { flex: 1, alignItems: 'center' },
  backBtn:      { width: 32 },
  backArrow:    { fontSize: 22 },

  // Profile circle
  profileCircle: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
  },
  profileInitial: { fontSize: 15, color: '#0C0904', letterSpacing: 0.2 },

  // Profile dropdown
  profileDropdown: {
    position: 'absolute',
    top: '100%',
    right: 0,
    width: 220,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 8,
    zIndex: 100,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12 },
      android: { elevation: 12 },
    }),
  },
  pdAgency:    { fontSize: 14, lineHeight: 20 },
  pdEmail:     { fontSize: 12, lineHeight: 18 },
  pdDivider:   { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  pdSignOut:   { paddingVertical: 8, alignItems: 'center', backgroundColor: 'rgba(255,82,82,0.15)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,82,82,0.3)' },
  pdSignOutText: { fontSize: 13, color: '#FF5252', letterSpacing: 0.3 },

  // List header
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: H_PAD,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listHeading:    { fontSize: 24, lineHeight: 30 },
  newTripBtn:     { backgroundColor: GOLD, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  newTripBtnText: { fontSize: 14, color: '#0C0904', letterSpacing: 0.3 },

  // Agency card
  agencyCard: {
    marginHorizontal: H_PAD,
    marginTop: 20,
    borderWidth: 1.5,
    borderRadius: 18,
    padding: 20,
    gap: 12,
  },
  agencyName:      { fontSize: 22, lineHeight: 28, letterSpacing: 0.2 },
  agencyBadgeRow:  { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  agencyBadge:     { borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  agencyBadgeText: { fontSize: 11, letterSpacing: 0.8 },
  agencyStatsRow:  { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14, gap: 0 },
  agencyStat:      { flex: 1, alignItems: 'center', gap: 4 },
  agencyStatVal:   { fontSize: 22, color: GOLD, lineHeight: 28, textAlign: 'center' },
  agencyStatLbl:   { fontSize: 11, letterSpacing: 0.5, textAlign: 'center' },
  agencyStatDivider: { width: 1, marginHorizontal: 8 },

  // Trip list
  tripList: { paddingHorizontal: H_PAD, paddingTop: 16, gap: 12 },
  tripCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  tripCardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  tripCardTitle:    { flex: 1, fontSize: 16, lineHeight: 22, letterSpacing: 0.1 },
  tripCardMeta:     { fontSize: 12, lineHeight: 18 },
  pkgPillRow:       { flexDirection: 'row' },
  pkgPill:          { borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  pkgPillText:      { fontSize: 12, letterSpacing: 0.4 },
  slotWrap:         { gap: 6 },
  slotText:         { fontSize: 11, letterSpacing: 0.3 },

  // Progress bar
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.1)', flexDirection: 'row', overflow: 'hidden' },
  progressFill:  { backgroundColor: GOLD, height: '100%' },

  // Status pill
  pill:    { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText:{ fontSize: 10, letterSpacing: 0.8 },

  // Empty state
  emptyState:   { paddingHorizontal: H_PAD, paddingTop: 60, alignItems: 'center', gap: 12 },
  emptyIcon:    { fontSize: 52 },
  emptyTitle:   { fontSize: 22, textAlign: 'center' },
  emptyBody:    { fontSize: 14, textAlign: 'center', lineHeight: 22, paddingHorizontal: 16 },
  createBtn:    { marginTop: 8, backgroundColor: GOLD, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28 },
  createBtnText:{ fontSize: 15, color: '#0C0904', letterSpacing: 0.3 },

  // VIEW 2
  tripHeader:  { paddingHorizontal: H_PAD, paddingTop: 20, paddingBottom: 16, gap: 8 },
  tripTitle:   { fontSize: 28, lineHeight: 36, letterSpacing: 0.2 },
  tripMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tripMeta:    { fontSize: 13, lineHeight: 19 },

  // Stats row
  statsRow: { flexDirection: 'row', paddingHorizontal: H_PAD, gap: 7, marginBottom: 4 },
  statCard: {
    flex: 1, borderWidth: 1, borderRadius: 12,
    paddingVertical: 12, alignItems: 'center', gap: 3,
    backgroundColor: GOLD_T,
  },
  statIcon:  { fontSize: 13 },
  statVal:   { fontSize: 13, fontFamily: 'PlayfairDisplay_700Bold', textAlign: 'center' },
  statLbl:   { fontSize: 9, letterSpacing: 0.3, textAlign: 'center', opacity: 0.5 },

  // Section
  section: {
    paddingHorizontal: H_PAD,
    paddingTop: 20,
    paddingBottom: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
    marginTop: 8,
  },
  secHead:     { fontSize: 11, letterSpacing: 2.5, opacity: 0.5 },
  emptySection:{ fontSize: 13, lineHeight: 20 },

  // Slot utilisation card
  slotCard: {
    borderWidth: 1.5, borderRadius: 16, padding: 20, gap: 10,
  },
  slotBigText: { fontSize: 17, lineHeight: 24, letterSpacing: 0.2 },
  slotUnused:  { fontSize: 13 },
  amberBanner: { borderWidth: 1, borderRadius: 10, padding: 12 },
  amberText:   { fontSize: 12, lineHeight: 18, color: AMBER },

  // Package details
  detailCard: {
    borderWidth: 1, borderRadius: 14, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  detailRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  detailLabel: { fontSize: 13, flex: 1 },
  detailValue: { fontSize: 13, flex: 1.5, textAlign: 'right' },

  // QR section
  qrCenter: { alignItems: 'center', marginVertical: 4 },
  joinUrl:   { textAlign: 'center', fontSize: 11, letterSpacing: 0.3, marginTop: 8 },
  shareRow:  { flexDirection: 'row', gap: 10 },
  shareBtn: {
    flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.03)',
  },
  shareBtnIcon: { fontSize: 20 },
  shareBtnText: { fontSize: 11, letterSpacing: 0.4, opacity: 0.8 },

  // Travellers
  travRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  travAvatar:    { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
  travAvatarText:{ fontSize: 15, color: '#0C0904', fontWeight: '700' },
  travInfo:      { flex: 1, gap: 3 },
  travName:      { fontSize: 14, lineHeight: 20 },
  travMeta:      { fontSize: 12, lineHeight: 18 },

  // Reveal
  revealBox:    { borderWidth: 1, borderRadius: 12, padding: 14 },
  revealLiveRow:{ flexDirection: 'row', alignItems: 'center', gap: 10 },
  liveDot:      { width: 10, height: 10, borderRadius: 5 },
  revealLiveText:{ fontSize: 15 },
  revealInfoText:{ fontSize: 13, lineHeight: 20 },
  revealNowBtn: { backgroundColor: GOLD, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  revealNowText: { fontSize: 15, color: '#0C0904', letterSpacing: 0.4 },
  galleryBtn:   { borderWidth: 1.5, borderRadius: 12, paddingVertical: 14, alignItems: 'center', backgroundColor: GOLD_T },
  galleryBtnText:{ fontSize: 14, color: GOLD, letterSpacing: 1.4 },

  // Download
  savingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  savingText: { fontSize: 13 },
  dlBtn:     { borderWidth: 1, borderColor: GOLD_B, borderRadius: 12, paddingVertical: 16, alignItems: 'center', backgroundColor: GOLD_T },
  dlBtnText: { fontSize: 15, color: GOLD, letterSpacing: 0.3 },
});
