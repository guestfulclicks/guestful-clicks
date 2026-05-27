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
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CameraQRCode from '../../shared/components/CameraQRCode';
import { supabase } from '../../supabase/client';
import { useCreateEvent } from '../../shared/CreateEventContext';
import { openRazorpayCheckout } from '../../shared/razorpay';
import { generateShareCode, buildJoinURL, buildWhatsAppMessage } from '../../shared/utils';

// ── Theme ──────────────────────────────────────────────────────────────────

const THEME_KEY = '@guestful_onboarding_theme';
const THEMES: Record<string, { background: string; text: string }> = {
  midnight:      { background: '#0C0904', text: '#F0E8D5' },
  graphite:      { background: '#1A1A1A', text: '#FFFFFF'  },
  navy:          { background: '#0D1B2A', text: '#E8F0FE'  },
  forest:        { background: '#0D1F17', text: '#EAF5EE'  },
  wine:          { background: '#1A0A0F', text: '#F5E8EC'  },
  'deep-pink':   { background: '#3B1321', text: '#F5C8D8'  },
  'burnt-orange':{ background: '#3D1C01', text: '#FFE0C0'  },
};
const DEFAULT_THEME = THEMES.midnight;
const GOLD   = '#D4A853';
const GOLD_T = 'rgba(212,168,83,0.08)';
const H_PAD  = 24;

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtINR(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`;
}

function fmtISODate(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d} ${months[m - 1]} ${y}`;
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

function SummaryRow({
  label, value, textColor, serif, serifBold, gold, onEdit,
}: {
  label: string; value: string; textColor: string;
  serif?: string; serifBold?: string; gold?: boolean;
  onEdit?: () => void;
}) {
  return (
    <View style={sr.row}>
      <View style={sr.left}>
        <Text style={[sr.label, { color: textColor, fontFamily: serif }]}>{label}</Text>
        <Text style={[sr.value, { color: gold ? GOLD : textColor, fontFamily: gold ? serifBold : serif }]} numberOfLines={2}>
          {value}
        </Text>
      </View>
      {onEdit && (
        <TouchableOpacity onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[sr.editBtn, { fontFamily: serifBold }]}>Edit →</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const sr = StyleSheet.create({
  row:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.07)' },
  left:   { flex: 1, gap: 2 },
  label:  { fontSize: 13, opacity: 0.5, letterSpacing: 0.2 },
  value:  { fontSize: 15, letterSpacing: 0.2, lineHeight: 21 },
  editBtn:{ fontSize: 12, color: GOLD, letterSpacing: 0.3, marginLeft: 12 },
});

// ── Action button ──────────────────────────────────────────────────────────

function ActionBtn({ icon, label, onPress, textColor, serif }: {
  icon: string; label: string; onPress: () => void;
  textColor: string; serif?: string;
}) {
  return (
    <TouchableOpacity
      style={[ab.btn, { borderColor: 'rgba(255,255,255,0.12)' }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={ab.icon}>{icon}</Text>
      <Text style={[ab.label, { color: textColor, fontFamily: serif }]}>{label}</Text>
    </TouchableOpacity>
  );
}
const ab = StyleSheet.create({
  btn:   { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.04)' },
  icon:  { fontSize: 22 },
  label: { fontSize: 11, letterSpacing: 0.5, textAlign: 'center', opacity: 0.8 },
});

// ── Main Component ─────────────────────────────────────────────────────────

export default function TravelPaymentScreen() {
  const { draft, reset } = useCreateEvent();
  const insets = useSafeAreaInsets();

  const [theme,     setTheme]     = useState(DEFAULT_THEME);
  const [userId,    setUserId]    = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userName,  setUserName]  = useState('');

  const [payLoading, setPayLoading] = useState(false);
  const [payError,   setPayError]   = useState<string | null>(null);

  const [screenState, setScreenState] = useState<'summary' | 'success'>('summary');
  const [shareCode,   setShareCode]   = useState('');

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
      setUserName(user.user_metadata?.full_name ?? user.user_metadata?.name ?? '');
    })();
  }, []);

  // Derived cost values
  const pkg      = draft.travelPackage;
  const subtotal = pkg ? pkg.pricePerPerson * draft.totalTravellers : 0;
  const gst      = Math.round(subtotal * 0.18);
  const total    = draft.totalTravelCost || subtotal + gst;

  // ── Payment handler ────────────────────────────────────────────────────

  const handlePay = async () => {
    if (payLoading || !pkg) return;
    setPayLoading(true);
    setPayError(null);

    try {
      const result = await openRazorpayCheckout({
        amount:      total,
        description: `Group Trip Film — ${draft.eventName}`,
        userName,
        userEmail,
        eventName:   draft.eventName,
      });

      const code = generateShareCode();

      // Build timestamps
      const tripEndDate         = draft.eventEndTime; // "YYYY-MM-DD"
      const eventEndTimestamp   = tripEndDate
        ? new Date(`${tripEndDate}T23:59:59`).toISOString()
        : null;
      const expiresAt = tripEndDate
        ? new Date(new Date(`${tripEndDate}T00:00:00`).getTime() + 15 * 86400000).toISOString()
        : null;
      const revealTime = draft.revealMode === 'during'
        ? (draft.eventDate ? new Date(`${draft.eventDate}T00:00:00`).toISOString() : null)
        : eventEndTimestamp;

      // Insert event
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .insert({
          title:          draft.eventName,
          type:           'public',
          host_id:        userId,
          event_date:     draft.eventDate || null,
          event_end_time: eventEndTimestamp,
          reveal_time:    revealTime,
          reveal_mode:    draft.revealMode || 'after',
          shot_limit:     pkg.shots,
          aesthetic:      draft.aesthetic || 'original',
          share_code:     code,
          status:         'active',
          city:           draft.departureCity || null,
          country:        'IN',
          expires_at:     expiresAt,
        })
        .select()
        .single();

      if (eventError || !eventData) {
        setPayError(`Could not save event: ${eventError?.message ?? 'Unknown error'}`);
        return;
      }

      // Insert travel_booking (best-effort — table may not exist yet in dev)
      await supabase.from('travel_bookings').insert({
        event_id:         eventData.id,
        agent_id:         userId,
        package_id:       pkg.id,
        total_travellers: draft.totalTravellers,
        price_per_person: pkg.pricePerPerson,
        total_paid:       total,
        payment_id:       result.razorpay_payment_id,
        slots_remaining:  draft.totalTravellers,
      });

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

  // ── Share / QR actions ─────────────────────────────────────────────────

  const shareUrl = buildJoinURL(shareCode);
  const shareMsg = buildWhatsAppMessage(draft.eventName, shareCode);

  const handleShareLink = async () => {
    try { await Share.share({ message: shareMsg, title: draft.eventName }); } catch { /* dismissed */ }
  };

  const handleSaveQR = async () => {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow gallery access to save the QR code.');
      return;
    }
    qrRef.current?.toDataURL(async (base64: string) => {
      try {
        const fileUri = `${FileSystem.documentDirectory}guestful_qr_${shareCode}.png`;
        await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
        await MediaLibrary.saveToLibraryAsync(fileUri);
        Alert.alert('Saved!', 'QR code saved to your gallery.');
      } catch {
        Alert.alert('Error', 'Could not save QR code.');
      }
    });
  };

  const handleWhatsApp = async () => {
    const url = `whatsapp://send?text=${encodeURIComponent(shareMsg)}`;
    if (await Linking.canOpenURL(url)) {
      Linking.openURL(url);
    } else {
      Alert.alert('WhatsApp not installed', 'WhatsApp is not available on this device.');
    }
  };

  const handleDashboard = () => {
    reset();
    router.replace('/dashboard/host-dashboard');
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={s.header}>
        {screenState === 'summary' ? (
          <TouchableOpacity
            style={s.backBtn}
            onPress={() => router.back()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={[s.backArrow, { color: theme.text }]}>←</Text>
          </TouchableOpacity>
        ) : (
          <View style={s.backBtn} />
        )}
        <View style={s.headerCenter}><Logo color={theme.text} /></View>
        <View style={s.backBtn} />
      </View>

      {/* ══ SUMMARY ═══════════════════════════════════════════════════════ */}
      {screenState === 'summary' && (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[s.heading, { color: theme.text, fontFamily: serifBold }]}>
            Confirm your{'\n'}trip film.
          </Text>
          <Text style={[s.subtext, { color: theme.text, fontFamily: serif }]}>
            Review before payment.
          </Text>

          {/* Summary card */}
          <View style={[s.summaryCard, { borderColor: 'rgba(255,255,255,0.1)' }]}>
            <SummaryRow
              label="Trip"
              value={draft.eventName || '—'}
              textColor={theme.text}
              serif={serif}
              serifBold={serifBold}
              onEdit={() => router.back()}
            />
            <SummaryRow
              label="Dates"
              value={`${fmtISODate(draft.eventDate)} → ${fmtISODate(draft.eventEndTime)}`}
              textColor={theme.text}
              serif={serif}
              serifBold={serifBold}
              onEdit={() => router.back()}
            />
            <SummaryRow
              label="Destination"
              value={draft.destination || '—'}
              textColor={theme.text}
              serif={serif}
              serifBold={serifBold}
              onEdit={() => router.back()}
            />
            <SummaryRow
              label="Package"
              value={pkg ? `${pkg.name} — ${pkg.shots} shots per person` : '—'}
              textColor={theme.text}
              serif={serif}
              serifBold={serifBold}
              onEdit={() => router.back()}
            />
            <SummaryRow
              label="Travellers"
              value={`${draft.totalTravellers} travellers`}
              textColor={theme.text}
              serif={serif}
              serifBold={serifBold}
              onEdit={() => router.back()}
            />
            <SummaryRow
              label="Reveal"
              value={draft.revealMode === 'during' ? 'During Trip (Live Feed)' : 'After Trip Ends'}
              textColor={theme.text}
              serif={serif}
              serifBold={serifBold}
            />
          </View>

          {/* Cost breakdown */}
          <View style={[s.costCard, { borderColor: 'rgba(255,255,255,0.1)' }]}>
            <View style={s.costRow}>
              <Text style={[s.costLabel, { color: theme.text, fontFamily: serif }]}>
                {draft.totalTravellers} travellers × {pkg ? fmtINR(pkg.pricePerPerson) : '—'}
              </Text>
              <Text style={[s.costValue, { color: theme.text, fontFamily: serif }]}>
                {fmtINR(subtotal)}
              </Text>
            </View>
            <View style={s.costRow}>
              <Text style={[s.costLabel, { color: theme.text, fontFamily: serif }]}>GST (18%)</Text>
              <Text style={[s.costValue, { color: theme.text, fontFamily: serif }]}>{fmtINR(gst)}</Text>
            </View>
            <View style={s.costDivider} />
            <View style={s.costRow}>
              <Text style={[s.costTotalLabel, { color: theme.text, fontFamily: serifBold }]}>Total</Text>
              <Text style={[s.costTotalValue, { fontFamily: serifBold }]}>{fmtINR(total)}</Text>
            </View>
          </View>

          {/* Error */}
          {payError && (
            <View style={s.errorCard}>
              <Text style={[s.errorText, { fontFamily: serif }]}>⚠ {payError}</Text>
              <TouchableOpacity style={s.retryBtn} onPress={handlePay} activeOpacity={0.82}>
                <Text style={[s.retryBtnText, { fontFamily: serifBold }]}>Try Again →</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => Linking.openURL('mailto:support@guestfulclicks.com')} activeOpacity={0.7}>
                <Text style={[s.supportLink, { fontFamily: serif }]}>Contact support</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Pay button */}
          <TouchableOpacity
            style={[s.payBtn, payLoading && s.payBtnDisabled]}
            onPress={handlePay}
            disabled={payLoading}
            activeOpacity={0.82}
          >
            {payLoading ? (
              <ActivityIndicator color="#0C0904" size="small" />
            ) : (
              <Text style={[s.payBtnText, { fontFamily: serifBold }]}>
                Pay {fmtINR(total)} →
              </Text>
            )}
          </TouchableOpacity>

          <Text style={[s.secureNote, { color: theme.text, fontFamily: serif }]}>
            🔒 Secured by Razorpay
          </Text>
          <View style={{ height: 32 }} />
        </ScrollView>
      )}

      {/* ══ SUCCESS ═══════════════════════════════════════════════════════ */}
      {screenState === 'success' && (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={[s.scrollContent, s.successContent]}
          showsVerticalScrollIndicator={false}
        >
          {/* Gold checkmark */}
          <View style={s.checkCircle}>
            <Text style={s.checkMark}>✓</Text>
          </View>

          <Text style={[s.successHeading, { color: theme.text, fontFamily: serifBold }]}>
            Your trip film is ready!
          </Text>
          <Text style={[s.successSubtext, { color: theme.text, fontFamily: serif }]}>
            Share the QR code with your travellers. They join in seconds — no download needed.
          </Text>

          {/* Trip name in gold italic */}
          <Text style={[s.tripNameGold, { fontFamily: serifBold }]} numberOfLines={2}>
            {draft.eventName}
          </Text>

          {/* QR camera component */}
          <CameraQRCode
            value={shareUrl}
            shareCode={shareCode}
            qrRef={qrRef}
            size={220}
          />

          {/* Slots counter */}
          <View style={s.slotsChip}>
            <Text style={[s.slotsText, { fontFamily: serifBold }]}>
              {draft.totalTravellers} traveller slots ready
            </Text>
          </View>

          {/* Action buttons */}
          <View style={[s.actionsRow, { marginTop: 20 }]}>
            <ActionBtn icon="🔗" label="Share Link" onPress={handleShareLink} textColor={theme.text} serif={serif} />
            <ActionBtn icon="💾" label="Save QR"    onPress={handleSaveQR}   textColor={theme.text} serif={serif} />
            <ActionBtn icon="💬" label="WhatsApp"   onPress={handleWhatsApp} textColor={theme.text} serif={serif} />
          </View>

          {/* Dashboard button */}
          <TouchableOpacity
            style={[s.dashBtn, { borderColor: GOLD }]}
            onPress={handleDashboard}
            activeOpacity={0.82}
          >
            <Text style={[s.dashBtnText, { fontFamily: serifBold }]}>
              Go to Dashboard →
            </Text>
          </TouchableOpacity>

          <View style={{ height: 48 + insets.bottom }} />
        </ScrollView>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: H_PAD, paddingTop: 56, paddingBottom: 8 },
  headerCenter:{ flex: 1, alignItems: 'center' },
  backBtn:     { width: 32, alignItems: 'center' },
  backArrow:   { fontSize: 22, lineHeight: 26 },
  logoRow:     { flexDirection: 'row', alignItems: 'center', gap: 7 },
  logoDot:     { width: 7, height: 7, borderRadius: 4 },
  logoText:    { fontSize: 13, letterSpacing: 1.6, textTransform: 'uppercase' },

  // Scroll
  scroll:       { flex: 1 },
  scrollContent:{ paddingHorizontal: H_PAD, paddingTop: 24 },

  // Summary state
  heading: { fontSize: 32, lineHeight: 44, letterSpacing: 0.2, marginBottom: 10 },
  subtext:  { fontSize: 15, lineHeight: 23, opacity: 0.6, marginBottom: 24 },

  summaryCard: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 18, paddingTop: 4, paddingBottom: 16, marginBottom: 20 },

  costCard:      { borderWidth: 1, borderRadius: 14, padding: 18, marginBottom: 20, gap: 10, backgroundColor: 'rgba(255,255,255,0.03)' },
  costRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  costLabel:     { fontSize: 14, opacity: 0.6, flex: 1 },
  costValue:     { fontSize: 14 },
  costDivider:   { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.12)', marginVertical: 4 },
  costTotalLabel:{ fontSize: 15 },
  costTotalValue:{ fontSize: 28, color: GOLD, letterSpacing: 0.3 },

  errorCard:    { backgroundColor: 'rgba(255,80,80,0.1)', borderWidth: 1, borderColor: 'rgba(255,80,80,0.3)', borderRadius: 10, padding: 14, marginBottom: 16, gap: 10 },
  errorText:    { color: '#FF6B6B', fontSize: 13, lineHeight: 19 },
  retryBtn:     { backgroundColor: GOLD, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  retryBtnText: { fontSize: 14, color: '#0C0904', letterSpacing: 0.5 },
  supportLink:  { fontSize: 12, color: '#FF6B6B', textDecorationLine: 'underline', textAlign: 'center', opacity: 0.7 },

  payBtn:        { backgroundColor: GOLD, height: 56, borderRadius: 4, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  payBtnDisabled:{ opacity: 0.7 },
  payBtnText:    { fontSize: 16, color: '#0C0904', letterSpacing: 1.8, textTransform: 'uppercase' },

  secureNote: { textAlign: 'center', fontSize: 12, opacity: 0.35, letterSpacing: 0.4 },

  // Success state
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

  successHeading:{ fontSize: 30, lineHeight: 40, letterSpacing: 0.2, textAlign: 'center', marginBottom: 10 },
  successSubtext:{ fontSize: 15, lineHeight: 23, opacity: 0.6, textAlign: 'center', marginBottom: 20, paddingHorizontal: 8 },

  tripNameGold: { fontSize: 20, color: GOLD, letterSpacing: 0.3, textAlign: 'center', fontStyle: 'italic', marginBottom: 24, paddingHorizontal: 8 },

  slotsChip: { marginTop: 16, marginBottom: 4, backgroundColor: GOLD_T, borderWidth: 1, borderColor: GOLD, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 18 },
  slotsText: { fontSize: 13, color: GOLD, letterSpacing: 0.5 },

  actionsRow: { flexDirection: 'row', gap: 10, width: '100%', marginBottom: 24 },

  dashBtn:    { width: '100%', height: 52, borderRadius: 4, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center', backgroundColor: GOLD_T },
  dashBtnText:{ fontSize: 14, color: GOLD, letterSpacing: 1.6, textTransform: 'uppercase' },
});
