import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useCreateEvent } from '../../shared/CreateEventContext';
import { openRazorpayCheckout } from '../../shared/razorpay';
import { REVENUE_SHARE, SHOT_LIMITS } from '../../shared/constants';
import type { UserRole } from '../../shared/types';

// ── Theme ──────────────────────────────────────────────────────────────────

const THEME_KEY = '@guestful_onboarding_theme';
const THEMES: Record<string, { background: string; text: string }> = {
  midnight: { background: '#0C0904', text: '#F0E8D5' },
  graphite: { background: '#1A1A1A', text: '#FFFFFF' },
  navy:     { background: '#0D1B2A', text: '#E8F0FE' },
  forest:   { background: '#0D1F17', text: '#EAF5EE' },
  wine:     { background: '#1A0A0F', text: '#F5E8EC' },
};
const DEFAULT_THEME = THEMES.midnight;
const GOLD   = '#D4A853';
const GOLD_T = 'rgba(212,168,83,0.08)';
const H_PAD  = 24;
const JOIN_BASE = 'https://join.guestfulclicks.com';

// ── Helpers ────────────────────────────────────────────────────────────────

function generateShareCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function fmtPrice(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`;
}

function fmtDate(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d} ${months[m - 1]} ${y}`;
}

function fmtReveal(iso: string): string {
  if (!iso) return '—';
  const dt = new Date(iso);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const h = dt.getHours(), min = dt.getMinutes();
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${dt.getDate()} ${months[dt.getMonth()]}, ${h12}:${String(min).padStart(2,'0')} ${period}`;
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';
}

// ── Logo ───────────────────────────────────────────────────────────────────

function Logo({ color }: { color: string }) {
  return (
    <View style={s.logoRow}>
      <View style={[s.logoDot, { backgroundColor: color }]} />
      <Text style={[s.logoText, { color }]}>Guestful Clicks</Text>
    </View>
  );
}

// ── Summary row ────────────────────────────────────────────────────────────

function SummaryRow({ label, value, textColor, serif, serifBold, gold = false }: {
  label: string; value: string; textColor: string;
  serif?: string; serifBold?: string; gold?: boolean;
}) {
  return (
    <View style={sr.row}>
      <Text style={[sr.label, { color: textColor, fontFamily: serif }]}>{label}</Text>
      <Text style={[sr.value, { color: gold ? GOLD : textColor, fontFamily: gold ? serifBold : serif }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}
const sr = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.07)' },
  label: { fontSize: 13, opacity: 0.5, letterSpacing: 0.2, flex: 1 },
  value: { fontSize: 13, flex: 1.4, textAlign: 'right', letterSpacing: 0.2, lineHeight: 18 },
});

// ── Action button ──────────────────────────────────────────────────────────

function ActionBtn({ icon, label, onPress, textColor, serif }: {
  icon: string; label: string; onPress: () => void;
  textColor: string; serif?: string;
}) {
  return (
    <TouchableOpacity style={[ab.btn, { borderColor: 'rgba(255,255,255,0.12)' }]} onPress={onPress} activeOpacity={0.75}>
      <Text style={ab.icon}>{icon}</Text>
      <Text style={[ab.label, { color: textColor, fontFamily: serif }]}>{label}</Text>
    </TouchableOpacity>
  );
}
const ab = StyleSheet.create({
  btn: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.04)' },
  icon: { fontSize: 22 },
  label: { fontSize: 11, letterSpacing: 0.5, textAlign: 'center', opacity: 0.8 },
});

// ── Supabase event insert ──────────────────────────────────────────────────

async function insertEvent(
  draft: ReturnType<typeof useCreateEvent>['draft'],
  role: UserRole,
  userId: string,
  shareCode: string,
  paymentId: string,
): Promise<string | null> {
  const { data, error } = await supabase.from('events').insert({
    title:           draft.eventName,
    type:            role === 'organiser' ? 'public' : 'private',
    host_id:         userId,
    date:            draft.eventDate || null,
    reveal_time:     draft.revealTime || null,
    event_end_time:  draft.eventEndTime || null,
    shot_limit:      role === 'organiser' ? SHOT_LIMITS.public99 : SHOT_LIMITS.privateGuest,
    aesthetic:       draft.aesthetic || 'original',
    status:          'active',
    share_code:      shareCode,
    invitation_card: draft.invitationCard || null,
    guest_count:     draft.guestCount,
    pricing_tier:    draft.pricingTier,
    event_category:  draft.eventCategory,
    payment_id:      paymentId,
  }).select('id').single();
  if (error) { console.warn('Event insert:', error.message); return null; }
  return (data as any).id as string;
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function PricingScreen() {
  const { draft, reset } = useCreateEvent();

  const [theme, setTheme]         = useState(DEFAULT_THEME);
  const [role, setRole]           = useState<UserRole | null>(null);
  const [userId, setUserId]       = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName]   = useState('');

  // Payment state
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError]     = useState<string | null>(null);

  // Success state
  const [screenState, setScreenState] = useState<'summary' | 'success'>('summary');
  const [shareCode, setShareCode]     = useState('');

  // QR ref for saving
  const qrRef = useRef<any>(null);

  const [fontsLoaded] = useFonts({ PlayfairDisplay_400Regular, PlayfairDisplay_700Bold });
  const serif     = fontsLoaded ? 'PlayfairDisplay_400Regular' : undefined;
  const serifBold = fontsLoaded ? 'PlayfairDisplay_700Bold'    : undefined;

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((k) => { if (k && THEMES[k]) setTheme(THEMES[k]); });
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      setUserEmail(user.email ?? '');
      const full: string = user.user_metadata?.full_name ?? user.user_metadata?.name ?? '';
      setUserName(full);
      const { data } = await supabase.from('users').select('role').eq('id', user.id).single();
      if (data?.role) setRole(data.role as UserRole);
    })();
  }, []);

  const amount = parseInt(draft.pricingTier || '0', 10);
  const isOrganiser = role === 'organiser';

  // ── Payment ──────────────────────────────────────────────────────────────

  const handlePayNow = async () => {
    if (payLoading) return;
    setPayLoading(true);
    setPayError(null);

    try {
      const result = await openRazorpayCheckout({
        amount:      amount,
        description: 'Event Film Creation',
        userName,
        userEmail,
        eventName:   draft.eventName,
      });

      // ── Payment succeeded ──────────────────────────────────────────────
      const code    = generateShareCode();
      const eventId = userId && role
        ? await insertEvent(draft, role, userId, code, result.razorpay_payment_id)
        : null;

      // For organiser events: create a pending payout record
      if (isOrganiser && eventId && userId) {
        const payoutDate = new Date();
        payoutDate.setDate(payoutDate.getDate() + REVENUE_SHARE.payoutWindowStartDay);
        await supabase.from('payouts').insert({
          event_id:       eventId,
          organiser_id:   userId,
          amount:         0,          // grows as participants pay
          status:         'pending',
          scheduled_date: payoutDate.toISOString().split('T')[0],
        });
      }

      setShareCode(code);
      setScreenState('success');
    } catch (e: any) {
      if (e?.code !== 'PAYMENT_CANCELLED') {
        setPayError(e?.description ?? e?.message ?? 'Payment failed. Please try again.');
      }
    } finally {
      setPayLoading(false);
    }
  };

  // ── Share / QR actions ────────────────────────────────────────────────────

  const shareUrl  = `${JOIN_BASE}/${shareCode}`;
  const shareMsg  = `Join my Guestful Clicks film: ${shareUrl}`;

  const handleShareLink = async () => {
    try {
      await Share.share({ message: shareMsg, title: draft.eventName });
    } catch {/* dismissed */}
  };

  const handleSaveQR = async () => {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow gallery access to save the QR code.');
      return;
    }
    qrRef.current?.toDataURL(async (base64: string) => {
      try {
        const fileUri = `${FileSystem.cacheDirectory}guestful_qr_${shareCode}.png`;
        await FileSystem.writeAsStringAsync(fileUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await MediaLibrary.saveToLibraryAsync(fileUri);
        Alert.alert('Saved!', 'QR code saved to your gallery.');
      } catch {
        Alert.alert('Error', 'Could not save QR code. Please try again.');
      }
    });
  };

  const handleWhatsApp = async () => {
    const url = `whatsapp://send?text=${encodeURIComponent(shareMsg)}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      Linking.openURL(url);
    } else {
      Alert.alert('WhatsApp not installed', 'WhatsApp is not available on this device.');
    }
  };

  const handleGoToDashboard = () => {
    reset();
    router.replace(isOrganiser ? '/dashboard/organiser-dashboard' : '/dashboard/host-dashboard');
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={s.header}>
        {screenState === 'summary' ? (
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={[s.backArrow, { color: theme.text }]}>←</Text>
          </TouchableOpacity>
        ) : (
          <View style={s.backBtn} />
        )}
        <View style={s.headerCenter}><Logo color={theme.text} /></View>
        <View style={s.backBtn} />
      </View>

      {/* ══ STATE 1 — PAYMENT SUMMARY ══════════════════════════════════════ */}
      {screenState === 'summary' && (
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={[s.heading, { color: theme.text, fontFamily: serifBold }]}>
            Your film is{'\n'}almost ready.
          </Text>
          <Text style={[s.subtext, { color: theme.text, fontFamily: serif }]}>
            Review your order before creating your film.
          </Text>

          {/* Summary card */}
          <View style={[s.summaryCard, { borderColor: 'rgba(255,255,255,0.1)' }]}>
            <SummaryRow label="Event"     value={draft.eventName || '—'}           textColor={theme.text} serif={serif} serifBold={serifBold} />
            <SummaryRow label="Date"      value={fmtDate(draft.eventDate)}          textColor={theme.text} serif={serif} />
            <SummaryRow label="Type"      value={isOrganiser ? 'Public Event' : 'Private Film'} textColor={theme.text} serif={serif} />
            <SummaryRow label="Aesthetic" value={capitalize(draft.aesthetic)}       textColor={theme.text} serif={serif} />
            {!isOrganiser && (
              <SummaryRow label="Guests"  value={draft.guestCount === 999 ? '300+ guests' : `Up to ${draft.guestCount} guests`} textColor={theme.text} serif={serif} />
            )}
            <SummaryRow label="Reveal"    value={fmtReveal(draft.revealTime)}       textColor={theme.text} serif={serif} />

            {/* Divider + total */}
            <View style={s.totalDivider} />
            <View style={s.totalRow}>
              <Text style={[s.totalLabel, { color: theme.text, fontFamily: serif }]}>Total</Text>
              <Text style={[s.totalAmount, { fontFamily: serifBold }]}>{fmtPrice(amount)}</Text>
            </View>
          </View>

          {/* Error card with retry */}
          {payError && (
            <View style={s.errorCard}>
              <Text style={[s.errorText, { fontFamily: serif }]}>⚠ {payError}</Text>
              <TouchableOpacity
                style={s.retryBtn}
                onPress={handlePayNow}
                activeOpacity={0.82}
              >
                <Text style={[s.retryBtnText, { fontFamily: serifBold }]}>Try Again →</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => Linking.openURL('mailto:support@guestfulclicks.com')}
                activeOpacity={0.7}
              >
                <Text style={[s.supportLink, { fontFamily: serif }]}>Contact support</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Pay Now button */}
          <TouchableOpacity
            style={[s.payBtn, payLoading && s.payBtnDisabled]}
            onPress={handlePayNow}
            disabled={payLoading}
            activeOpacity={0.82}
          >
            {payLoading ? (
              <ActivityIndicator color="#0C0904" size="small" />
            ) : (
              <Text style={[s.payBtnText, { fontFamily: serifBold }]}>
                Pay {fmtPrice(amount)} →
              </Text>
            )}
          </TouchableOpacity>

          <Text style={[s.secureNote, { color: theme.text, fontFamily: serif }]}>
            🔒 Secured by Razorpay
          </Text>
          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {/* ══ STATE 2 — FILM CREATED ══════════════════════════════════════════ */}
      {screenState === 'success' && (
        <ScrollView style={s.scroll} contentContainerStyle={[s.scrollContent, s.successContent]} showsVerticalScrollIndicator={false}>

          {/* Gold checkmark */}
          <View style={s.checkCircle}>
            <Text style={s.checkMark}>✓</Text>
          </View>

          <Text style={[s.successHeading, { color: theme.text, fontFamily: serifBold }]}>
            Your film is ready!
          </Text>
          <Text style={[s.successSubtext, { color: theme.text, fontFamily: serif }]}>
            Share the QR code with your guests. They can join in seconds — no download needed.
          </Text>

          {/* Event name in gold */}
          <Text style={[s.eventNameGold, { fontFamily: serifBold }]} numberOfLines={2}>
            {draft.eventName}
          </Text>

          {/* QR card */}
          <View style={s.qrCard}>
            <QRCode
              value={`${JOIN_BASE}/${shareCode}`}
              size={220}
              getRef={(c: any) => { qrRef.current = c; }}
              backgroundColor="white"
              color="#0C0904"
            />
          </View>

          {/* Share code */}
          <View style={s.shareCodeRow}>
            <Text style={[s.shareCodeLabel, { color: theme.text, fontFamily: serif }]}>Share code</Text>
            <Text style={[s.shareCodeValue, { fontFamily: serifBold }]}>{shareCode}</Text>
          </View>

          {/* Action buttons */}
          <View style={s.actionsRow}>
            <ActionBtn icon="🔗" label="Share Link" onPress={handleShareLink} textColor={theme.text} serif={serif} />
            <ActionBtn icon="💾" label="Save QR"    onPress={handleSaveQR}   textColor={theme.text} serif={serif} />
            <ActionBtn icon="💬" label="WhatsApp"   onPress={handleWhatsApp} textColor={theme.text} serif={serif} />
          </View>

          {/* Dashboard button */}
          <TouchableOpacity
            style={[s.dashBtn, { borderColor: GOLD }]}
            onPress={handleGoToDashboard}
            activeOpacity={0.82}
          >
            <Text style={[s.dashBtnText, { fontFamily: serifBold }]}>
              Go to my dashboard →
            </Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: H_PAD, paddingTop: 56, paddingBottom: 8 },
  headerCenter: { flex: 1, alignItems: 'center' },
  backBtn: { width: 32, alignItems: 'center' },
  backArrow: { fontSize: 22, lineHeight: 26 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  logoDot: { width: 7, height: 7, borderRadius: 4 },
  logoText: { fontSize: 13, letterSpacing: 1.6, textTransform: 'uppercase' },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: H_PAD, paddingTop: 24 },

  // State 1
  heading: { fontSize: 30, lineHeight: 42, letterSpacing: 0.2, marginBottom: 10 },
  subtext:  { fontSize: 14, lineHeight: 22, opacity: 0.6, marginBottom: 24 },

  summaryCard: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 18, paddingTop: 4, paddingBottom: 16, marginBottom: 20 },
  totalDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 14 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 14, opacity: 0.6, letterSpacing: 0.3 },
  totalAmount: { fontSize: 28, color: GOLD, letterSpacing: 0.3 },

  errorCard: { backgroundColor: 'rgba(255,80,80,0.1)', borderWidth: 1, borderColor: 'rgba(255,80,80,0.3)', borderRadius: 10, padding: 14, marginBottom: 16, gap: 10 },
  errorText: { color: '#FF6B6B', fontSize: 13, lineHeight: 19 },
  retryBtn: { backgroundColor: GOLD, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  retryBtnText: { fontSize: 14, color: '#0C0904', letterSpacing: 0.5 },
  supportLink: { fontSize: 12, color: '#FF6B6B', textDecorationLine: 'underline', textAlign: 'center', opacity: 0.7 },

  payBtn: { backgroundColor: GOLD, height: 56, borderRadius: 4, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  payBtnDisabled: { opacity: 0.7 },
  payBtnText: { fontSize: 16, color: '#0C0904', letterSpacing: 1.8, textTransform: 'uppercase' },

  secureNote: { textAlign: 'center', fontSize: 12, opacity: 0.35, letterSpacing: 0.4 },

  // State 2
  successContent: { alignItems: 'center' },
  checkCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: GOLD,
    justifyContent: 'center', alignItems: 'center',
    marginTop: 8, marginBottom: 20,
    ...Platform.select({
      ios:     { shadowColor: GOLD, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12 },
      android: { elevation: 8 },
    }),
  },
  checkMark: { fontSize: 36, color: '#0C0904', fontWeight: '700', lineHeight: 44 },

  successHeading: { fontSize: 28, lineHeight: 38, letterSpacing: 0.2, textAlign: 'center', marginBottom: 10 },
  successSubtext:  { fontSize: 14, lineHeight: 22, opacity: 0.6, textAlign: 'center', marginBottom: 20, paddingHorizontal: 8 },

  eventNameGold: { fontSize: 20, color: GOLD, letterSpacing: 0.3, textAlign: 'center', marginBottom: 24, paddingHorizontal: 8 },

  qrCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12 },
      android: { elevation: 6 },
    }),
  },

  shareCodeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24 },
  shareCodeLabel: { fontSize: 12, opacity: 0.5, letterSpacing: 0.5 },
  shareCodeValue: { fontSize: 18, color: GOLD, letterSpacing: 3 },

  actionsRow: { flexDirection: 'row', gap: 10, width: '100%', marginBottom: 24 },

  dashBtn: {
    width: '100%', height: 52, borderRadius: 4, borderWidth: 1.5,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: GOLD_T,
  },
  dashBtnText: { fontSize: 14, color: GOLD, letterSpacing: 1.6, textTransform: 'uppercase' },
});
