import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, router } from 'expo-router';
import {
  useFonts,
  PlayfairDisplay_400Regular,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import { supabase } from '../../supabase/client';
import { openRazorpayCheckout } from '../../shared/razorpay';
import { PUBLIC_PARTICIPANT_PRICING, SHOT_LIMITS } from '../../shared/constants';

// ── Constants ─────────────────────────────────────────────────────────────────

const BG      = '#0C0904';
const WW      = '#F0E8D5';
const GOLD    = '#D4A853';
const GOLD_T  = 'rgba(212,168,83,0.08)';
const GOLD_B  = 'rgba(212,168,83,0.30)';
const MUTED   = 'rgba(240,232,213,0.50)';
const BORDER  = 'rgba(255,255,255,0.15)';
const RED     = '#FF5252';
const H_PAD   = 24;
const PART_KEY = '@guestful_participant';

// Tier descriptions shown under each card
const TIER_DESCRIPTIONS: Record<number, string> = {
  99:  'Share your 10 best moments',
  199: 'More shots, more memories',
  299: 'For the serious photographer',
  499: 'The complete experience',
};

// Map shot count → tier slug saved in DB
const SHOT_KEY_MAP: Record<number, string> = {
  [SHOT_LIMITS.public99]:  'public99',
  [SHOT_LIMITS.public199]: 'public199',
  [SHOT_LIMITS.public299]: 'public299',
  [SHOT_LIMITS.public499]: 'public499',
};

// ── Types ─────────────────────────────────────────────────────────────────────

type ScreenState = 'loading' | 'select' | 'paying' | 'success';

interface TierConfig {
  shots:       number;
  price:       number;
  description: string;
  is_popular:  boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtINR(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`;
}

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Logo() {
  return (
    <View style={sc.logoRow}>
      <View style={sc.logoDot} />
      <Text style={sc.logoText}>GUESTFUL CLICKS</Text>
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PaywallScreen() {
  const { event_id: paramEventId } = useLocalSearchParams<{ event_id?: string }>();

  const [fontsLoaded] = useFonts({ PlayfairDisplay_400Regular, PlayfairDisplay_700Bold });
  const serif     = fontsLoaded ? 'PlayfairDisplay_400Regular' : undefined;
  const serifBold = fontsLoaded ? 'PlayfairDisplay_700Bold'    : undefined;

  const [screenState, setScreenState] = useState<ScreenState>('loading');
  const [eventId, setEventId]         = useState('');
  const [eventName, setEventName]     = useState('');
  const [tiers, setTiers]             = useState<TierConfig[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(1);   // default to 2nd tier
  const [userName, setUserName]       = useState('');
  const [userPhone, setUserPhone]     = useState('');
  const [payError, setPayError]       = useState<string | null>(null);
  const [nameFocused, setNameFocused] = useState(false);
  const [phoneFocused, setPhoneFocused] = useState(false);

  // Success animation
  const checkScale = useRef(new Animated.Value(0)).current;
  const textOp     = useRef(new Animated.Value(0)).current;
  const btnOp      = useRef(new Animated.Value(0)).current;

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      // Resolve event ID: prefer route param, fall back to AsyncStorage
      let eid = paramEventId ?? '';
      if (!eid) {
        const raw = await AsyncStorage.getItem(PART_KEY);
        if (raw) {
          try { eid = JSON.parse(raw)?.event_id ?? ''; } catch { /* ignore */ }
        }
      }
      if (!eid) {
        Alert.alert('No event found', 'Please scan the event QR code to join.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
        return;
      }
      setEventId(eid);

      // Fetch event name
      const { data: ev } = await supabase
        .from('events').select('title').eq('id', eid).single();
      if (ev) setEventName((ev as any).title ?? '');

      // Fetch pricing config from Supabase; fall back to static constants
      const { data: config } = await supabase
        .from('pricing_config')
        .select('shots, price, description, is_popular')
        .eq('country', 'IN')
        .order('price', { ascending: true });

      if (config?.length) {
        setTiers(config as TierConfig[]);
      } else {
        // Static fallback — mirrors PUBLIC_PARTICIPANT_PRICING
        setTiers(
          (PUBLIC_PARTICIPANT_PRICING as unknown as { shots: number; price: number }[]).map(t => ({
            shots:       t.shots,
            price:       t.price,
            description: TIER_DESCRIPTIONS[t.price] ?? '',
            is_popular:  t.price === 299,
          }))
        );
      }

      setScreenState('select');
    })();
  }, [paramEventId]);

  // ── Validation ────────────────────────────────────────────────────────────

  const phoneDigits = userPhone.replace(/\D/g, '');
  const canPay      = userName.trim().length >= 2 && phoneDigits.length >= 10 && tiers.length > 0;
  const activeTier  = tiers[selectedIdx] ?? tiers[0];

  // ── Success animation ────────────────────────────────────────────────────

  function playSuccess() {
    Animated.sequence([
      Animated.spring(checkScale, { toValue: 1, tension: 80, friction: 6, useNativeDriver: true }),
      Animated.timing(textOp,     { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(btnOp,      { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();
  }

  // ── Payment ───────────────────────────────────────────────────────────────

  const handlePay = async () => {
    if (!canPay || !activeTier || !eventId) return;
    setPayError(null);
    setScreenState('paying');

    try {
      const result = await openRazorpayCheckout({
        amount:       activeTier.price,
        description:  `${activeTier.shots} shots · ${eventName || 'Event'}`,
        userName:     userName.trim(),
        userEmail:    '',
        eventName:    eventName,
        prefillPhone: phoneDigits,
      });

      // ── Payment succeeded — create participant record ──────────────────
      const token = uuidv4();

      const { data: newPart, error: insertErr } = await supabase
        .from('participants')
        .insert({
          event_id:     eventId,
          name:         userName.trim(),
          qr_token:     token,
          amount_paid:  activeTier.price,
          tier:         SHOT_KEY_MAP[activeTier.shots] ?? 'free',
          shot_limit:   activeTier.shots,
          upload_count: 0,
          shots_used:   0,
          joined_at:    new Date().toISOString(),
          payment_id:   result.razorpay_payment_id,
        })
        .select('id')
        .single();

      if (insertErr || !newPart) throw new Error(insertErr?.message ?? 'Could not create participant.');

      // Persist to AsyncStorage so camera-screen can read it
      await AsyncStorage.setItem(PART_KEY, JSON.stringify({
        id:         (newPart as any).id,
        event_id:   eventId,
        name:       userName.trim(),
        shot_limit: activeTier.shots,
        qr_token:   token,
      }));

      setScreenState('success');
      playSuccess();
    } catch (e: any) {
      setScreenState('select');
      if (e?.code !== 'PAYMENT_CANCELLED') {
        setPayError(e?.description ?? e?.message ?? 'Payment failed. Please try again.');
      }
    }
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

  // ── STATE: PAYING ─────────────────────────────────────────────────────────

  if (screenState === 'paying') {
    return (
      <View style={[sc.root, sc.center]}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator color={GOLD} size="large" />
        <Text style={[sc.payingText, { fontFamily: serif }]}>Opening secure payment…</Text>
      </View>
    );
  }

  // ── STATE: SUCCESS ────────────────────────────────────────────────────────

  if (screenState === 'success') {
    return (
      <View style={[sc.root, sc.center, { paddingHorizontal: H_PAD }]}>
        <StatusBar barStyle="light-content" />

        <Animated.View style={{ transform: [{ scale: checkScale }] }}>
          <View style={sc.bigCheck}>
            <Text style={sc.bigCheckMark}>✓</Text>
          </View>
        </Animated.View>

        <Animated.View style={{ opacity: textOp, alignItems: 'center', marginTop: 28, gap: 10 }}>
          <Text style={[sc.successTitle, { fontFamily: serifBold }]}>You're all set!</Text>
          <Text style={[sc.successBody, { fontFamily: serif }]}>
            {activeTier?.shots ?? 0} shots unlocked.{'\n'}
            Start capturing your memories now.
          </Text>
        </Animated.View>

        <Animated.View style={{ opacity: btnOp, width: '100%', marginTop: 40 }}>
          <TouchableOpacity
            style={sc.cameraBtn}
            onPress={() => router.replace('/camera/camera-screen' as any)}
            activeOpacity={0.85}
          >
            <Text style={[sc.cameraBtnText, { fontFamily: serifBold }]}>Open Camera →</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  }

  // ── STATE: SELECT TIER ────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={sc.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={sc.header}>
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

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: H_PAD, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Heading */}
        <View style={sc.headingWrap}>
          <Text style={[sc.heading, { fontFamily: serifBold }]}>Publish your shots.</Text>
          <Text style={[sc.subheading, { fontFamily: serif }]}>
            Choose how many of your best shots to share with the world.
          </Text>
          {eventName ? (
            <Text style={[sc.eventTag, { fontFamily: serif }]}>{eventName}</Text>
          ) : null}
        </View>

        {/* Tier cards */}
        <View style={sc.tiersWrap}>
          {tiers.map((tier, idx) => {
            const isSelected = idx === selectedIdx;
            return (
              <TouchableOpacity
                key={tier.price}
                style={[
                  sc.tierCard,
                  { borderColor: isSelected ? GOLD : BORDER },
                  isSelected && { backgroundColor: GOLD_T },
                ]}
                onPress={() => setSelectedIdx(idx)}
                activeOpacity={0.82}
              >
                {tier.is_popular && (
                  <View style={sc.popularBadge}>
                    <Text style={[sc.popularBadgeText, { fontFamily: serifBold }]}>POPULAR</Text>
                  </View>
                )}

                <View style={sc.tierRow}>
                  {/* Shots */}
                  <View style={sc.tierLeft}>
                    <Text style={[sc.tierShots, { color: isSelected ? GOLD : WW, fontFamily: serifBold }]}>
                      {tier.shots}
                    </Text>
                    <Text style={[sc.tierShotsLabel, { fontFamily: serif }]}>shots</Text>
                  </View>

                  {/* Description */}
                  <Text style={[sc.tierDesc, { fontFamily: serif, color: isSelected ? WW : MUTED }]}>
                    {tier.description || TIER_DESCRIPTIONS[tier.price] || ''}
                  </Text>

                  {/* Price + radio */}
                  <View style={sc.tierRight}>
                    <Text style={[sc.tierPrice, { color: isSelected ? GOLD : WW, fontFamily: serifBold }]}>
                      {fmtINR(tier.price)}
                    </Text>
                    <View style={[sc.radio, { borderColor: isSelected ? GOLD : BORDER }]}>
                      {isSelected && <View style={sc.radioFill} />}
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Name + phone inputs */}
        <View style={sc.inputsWrap}>
          <View style={[sc.inputRow, { borderColor: nameFocused ? GOLD : BORDER }]}>
            <Text style={sc.inputIcon}>👤</Text>
            <TextInput
              style={[sc.input, { fontFamily: serif }]}
              placeholder="Your name"
              placeholderTextColor={MUTED}
              value={userName}
              onChangeText={setUserName}
              autoCapitalize="words"
              returnKeyType="next"
              onFocus={() => setNameFocused(true)}
              onBlur={() => setNameFocused(false)}
            />
          </View>

          <View style={[sc.inputRow, { borderColor: phoneFocused ? GOLD : BORDER }]}>
            <Text style={sc.inputIcon}>📱</Text>
            <TextInput
              style={[sc.input, { fontFamily: serif }]}
              placeholder="Mobile number"
              placeholderTextColor={MUTED}
              value={userPhone}
              onChangeText={setUserPhone}
              keyboardType="phone-pad"
              returnKeyType="done"
              maxLength={15}
              onFocus={() => setPhoneFocused(true)}
              onBlur={() => setPhoneFocused(false)}
            />
          </View>

          <Text style={[sc.inputNote, { fontFamily: serif }]}>
            Used to identify your uploads in the gallery only.
          </Text>
        </View>

        {/* Error card */}
        {payError && (
          <View style={sc.errorCard}>
            <Text style={[sc.errorText, { fontFamily: serif }]}>⚠ {payError}</Text>
            <TouchableOpacity style={sc.retryBtn} onPress={handlePay} activeOpacity={0.82}>
              <Text style={[sc.retryBtnText, { fontFamily: serifBold }]}>Try Again →</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => Linking.openURL('mailto:support@guestfulclicks.com')}
              activeOpacity={0.7}
            >
              <Text style={[sc.supportLink, { fontFamily: serif }]}>Contact support</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Pay button */}
        <TouchableOpacity
          style={[sc.payBtn, !canPay && sc.payBtnDisabled]}
          onPress={handlePay}
          disabled={!canPay}
          activeOpacity={0.85}
        >
          <Text style={[sc.payBtnText, { fontFamily: serifBold }]}>
            {activeTier ? `Pay ${fmtINR(activeTier.price)} & Upload →` : 'Select a plan'}
          </Text>
        </TouchableOpacity>

        {/* Validation hint when button disabled */}
        {!canPay && (userName.trim().length > 0 || userPhone.length > 0) && (
          <Text style={[sc.validationHint, { fontFamily: serif }]}>
            {userName.trim().length < 2
              ? 'Enter your name (min 2 characters).'
              : phoneDigits.length < 10
              ? 'Enter a valid 10-digit mobile number.'
              : ''}
          </Text>
        )}

        <Text style={[sc.secureNote, { fontFamily: serif }]}>
          🔒 Secured by Razorpay · One-time payment
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const TOP_PAD = Platform.OS === 'ios' ? 52 : 36;

const sc = StyleSheet.create({
  root:   { flex: 1, backgroundColor: BG },
  center: { justifyContent: 'center', alignItems: 'center' },

  logoRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoDot:  { width: 7, height: 7, borderRadius: 4, backgroundColor: GOLD },
  logoText: { fontSize: 11, letterSpacing: 3, color: WW, fontFamily: 'PlayfairDisplay_400Regular' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: TOP_PAD,
    paddingBottom: 12,
    paddingHorizontal: H_PAD,
  },
  backBtn:   { width: 32 },
  backArrow: { fontSize: 22, color: WW },

  // Heading
  headingWrap: { paddingTop: 8, paddingBottom: 24, gap: 8 },
  heading:     { fontSize: 30, lineHeight: 40, color: WW, letterSpacing: 0.2 },
  subheading:  { fontSize: 15, lineHeight: 22, color: MUTED },
  eventTag:    { fontSize: 12, color: GOLD, letterSpacing: 0.5, marginTop: 2 },

  // Tier cards
  tiersWrap: { gap: 10, marginBottom: 24 },
  tierCard: {
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    overflow: 'hidden',
  },
  popularBadge: {
    position: 'absolute', top: 0, right: 0,
    backgroundColor: GOLD,
    paddingHorizontal: 12, paddingVertical: 4,
    borderBottomLeftRadius: 10,
  },
  popularBadgeText: { fontSize: 9, color: '#0C0904', letterSpacing: 1.2 },

  tierRow:       { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tierLeft:      { alignItems: 'center', minWidth: 44 },
  tierShots:     { fontSize: 30, lineHeight: 36 },
  tierShotsLabel: { fontSize: 10, color: MUTED, letterSpacing: 0.5, marginTop: -2 },
  tierDesc:      { flex: 1, fontSize: 13, lineHeight: 18 },
  tierRight:     { alignItems: 'center', gap: 6 },
  tierPrice:     { fontSize: 17 },
  radio: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2,
    justifyContent: 'center', alignItems: 'center',
  },
  radioFill: { width: 10, height: 10, borderRadius: 5, backgroundColor: GOLD },

  // Inputs
  inputsWrap: { gap: 10, marginBottom: 24 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
    backgroundColor: 'rgba(255,255,255,0.08)',
    gap: 10,
  },
  inputIcon: { fontSize: 16 },
  input:     { flex: 1, color: WW, fontSize: 15, height: 52 },
  inputNote: { fontSize: 11, color: MUTED, lineHeight: 16, paddingHorizontal: 4 },

  // Error card
  errorCard: {
    borderWidth: 1,
    borderColor: 'rgba(255,82,82,0.35)',
    borderRadius: 12,
    backgroundColor: 'rgba(255,82,82,0.08)',
    padding: 14,
    gap: 10,
    marginBottom: 16,
  },
  errorText:     { color: RED, fontSize: 13, lineHeight: 19 },
  retryBtn:      { backgroundColor: GOLD, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  retryBtnText:  { fontSize: 14, color: '#0C0904', letterSpacing: 0.5 },
  supportLink:   { fontSize: 12, color: RED, textDecorationLine: 'underline', textAlign: 'center', opacity: 0.75 },

  // Pay button
  payBtn: {
    backgroundColor: GOLD,
    height: 56,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    ...Platform.select({
      ios:     { shadowColor: GOLD, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10 },
      android: { elevation: 6 },
      default: {},
    }),
  },
  payBtnDisabled: { opacity: 0.38 },
  payBtnText:     { fontSize: 15, color: '#0C0904', letterSpacing: 1.4, textTransform: 'uppercase' },

  validationHint: { fontSize: 12, color: 'rgba(255,82,82,0.7)', textAlign: 'center', marginBottom: 8 },
  secureNote:     { fontSize: 12, color: MUTED, textAlign: 'center', opacity: 0.55, letterSpacing: 0.3, marginTop: 4 },

  // Paying state
  payingText: { fontSize: 14, color: MUTED, marginTop: 16, letterSpacing: 0.3 },

  // Success state
  bigCheck: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: GOLD,
    justifyContent: 'center', alignItems: 'center',
    ...Platform.select({
      ios:     { shadowColor: GOLD, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 14 },
      android: { elevation: 10 },
      default: {},
    }),
  },
  bigCheckMark:  { fontSize: 38, color: '#0C0904', fontWeight: '700', lineHeight: 46 },
  successTitle:  { fontSize: 26, color: WW, lineHeight: 34, textAlign: 'center' },
  successBody:   { fontSize: 15, color: MUTED, lineHeight: 24, textAlign: 'center' },
  cameraBtn: {
    backgroundColor: GOLD,
    height: 56, borderRadius: 4,
    justifyContent: 'center', alignItems: 'center',
  },
  cameraBtnText: { fontSize: 15, color: '#0C0904', letterSpacing: 1.4, textTransform: 'uppercase' },
});
