import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Platform,
  ScrollView,
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
import RazorpayCheckout from 'react-native-razorpay';
import { supabase } from '../../supabase/client';
import { PUBLIC_PARTICIPANT_PRICING, SHOT_LIMITS } from '../../shared/constants';

// ── Theme ─────────────────────────────────────────────────────────────────────

const THEMES: Record<string, { background: string; text: string }> = {
  midnight: { background: '#0C0904', text: '#F0E8D5' },
  graphite: { background: '#1A1A1A', text: '#FFFFFF'  },
  navy:     { background: '#0D1B2A', text: '#E8F0FE'  },
  forest:   { background: '#0D1F17', text: '#EAF5EE'  },
  wine:     { background: '#1A0A0F', text: '#F5E8EC'  },
};
const THEME_KEY  = '@guestful_onboarding_theme';
const PART_KEY   = '@guestful_participant';
const DEFAULT_TH = THEMES.midnight;
const GOLD       = '#D4A853';
const GOLD_T     = 'rgba(212,168,83,0.08)';
const GOLD_B     = 'rgba(212,168,83,0.3)';
const H_PAD      = 24;
const { width: SW } = Dimensions.get('window');

// ── Shot tiers (public participant pricing) ───────────────────────────────────
// Shape: { shots: number, price: number }[]
const TIERS = PUBLIC_PARTICIPANT_PRICING as unknown as { shots: number; price: number }[];

// Map shot count → SHOT_LIMITS key for storage
const SHOT_KEY_MAP: Record<number, string> = {
  [SHOT_LIMITS.public99]:  'public99',
  [SHOT_LIMITS.public199]: 'public199',
  [SHOT_LIMITS.public299]: 'public299',
  [SHOT_LIMITS.public499]: 'public499',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtINR(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`;
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

function CheckIcon({ size = 18 }: { size?: number }) {
  return (
    <View style={[sc.checkCircle, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[sc.checkMark, { fontSize: size * 0.6, lineHeight: size }]}>✓</Text>
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PaywallScreen() {
  const [fontsLoaded] = useFonts({ PlayfairDisplay_400Regular, PlayfairDisplay_700Bold });
  const serif     = fontsLoaded ? 'PlayfairDisplay_400Regular' : undefined;
  const serifBold = fontsLoaded ? 'PlayfairDisplay_700Bold'    : undefined;

  const [theme, setTheme]           = useState(DEFAULT_TH);
  const [selectedTier, setSelectedTier] = useState<number>(1); // index into TIERS
  const [screenState, setScreenState]   = useState<'select' | 'paying' | 'success'>('select');
  const [payError, setPayError]         = useState<string | null>(null);

  // Participant data from AsyncStorage
  const [participant, setParticipant] = useState<{
    id: string; name: string; event_id: string; shot_limit: number;
  } | null>(null);

  // Success animation
  const checkScale = useRef(new Animated.Value(0)).current;
  const textOp     = useRef(new Animated.Value(0)).current;
  const btnOp      = useRef(new Animated.Value(0)).current;

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const themeKey = await AsyncStorage.getItem(THEME_KEY);
      if (themeKey && THEMES[themeKey]) setTheme(THEMES[themeKey]);

      const raw = await AsyncStorage.getItem(PART_KEY);
      if (raw) {
        try { setParticipant(JSON.parse(raw)); } catch { /* ignore */ }
      }
    })();
  }, []);

  // ── Success animation ────────────────────────────────────────────────────

  function playSuccessAnimation() {
    Animated.sequence([
      Animated.spring(checkScale, {
        toValue: 1,
        tension: 80,
        friction: 6,
        useNativeDriver: true,
      }),
      Animated.timing(textOp, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(btnOp, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }

  // ── Payment ───────────────────────────────────────────────────────────────

  const handlePurchase = async () => {
    if (!participant) {
      Alert.alert('Not joined', 'Please join an event first before purchasing shots.');
      return;
    }

    const tier   = TIERS[selectedTier];
    const amount = tier.price;

    setPayError(null);
    setScreenState('paying');

    const options = {
      description:  'Extra Shots — Guestful Clicks',
      currency:     'INR',
      key:          'rzp_test_placeholder',
      amount:       amount * 100,
      name:         'Guestful Clicks',
      prefill: {
        name: participant.name,
      },
      theme: { color: GOLD },
    };

    try {
      await (RazorpayCheckout as any).open(options);

      // Payment succeeded — update participant record
      await supabase
        .from('participants')
        .update({
          shot_limit:   tier.shots,
          amount_paid:  amount,
          tier:         SHOT_KEY_MAP[tier.shots] ?? 'free',
        })
        .eq('id', participant.id);

      // Update AsyncStorage
      const updated = { ...participant, shot_limit: tier.shots };
      await AsyncStorage.setItem(PART_KEY, JSON.stringify(updated));
      setParticipant(updated);

      setScreenState('success');
      playSuccessAnimation();
    } catch (e: any) {
      setScreenState('select');
      if (e?.code !== 'PAYMENT_CANCELLED') {
        setPayError(e?.description ?? e?.message ?? 'Payment failed. Please try again.');
      }
    }
  };

  // ── Guards ────────────────────────────────────────────────────────────────

  if (!fontsLoaded) {
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

  const activeTier = TIERS[selectedTier];

  // ── STATE: PAYING ─────────────────────────────────────────────────────────

  if (screenState === 'paying') {
    return (
      <View style={[sc.root, sc.center, { backgroundColor: BG }]}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator color={GOLD} size="large" />
        <Text style={[sc.loadingText, { color: MUTED, fontFamily: serif, marginTop: 16 }]}>
          Opening payment...
        </Text>
      </View>
    );
  }

  // ── STATE: SUCCESS ────────────────────────────────────────────────────────

  if (screenState === 'success') {
    return (
      <View style={[sc.root, sc.center, { backgroundColor: BG, paddingHorizontal: H_PAD }]}>
        <StatusBar barStyle="light-content" />

        <Animated.View style={{ transform: [{ scale: checkScale }] }}>
          <View style={sc.bigCheckCircle}>
            <Text style={sc.bigCheckMark}>✓</Text>
          </View>
        </Animated.View>

        <Animated.View style={{ opacity: textOp, alignItems: 'center', marginTop: 28, gap: 10 }}>
          <Text style={[sc.successTitle, { color: TXT, fontFamily: serifBold }]}>
            Shots unlocked!
          </Text>
          <Text style={[sc.successBody, { color: MUTED, fontFamily: serif }]}>
            You now have {participant?.shot_limit ?? activeTier.shots} shots to use.{'\n'}
            Head back to the camera and keep shooting.
          </Text>
        </Animated.View>

        <Animated.View style={{ opacity: btnOp, width: '100%', marginTop: 40 }}>
          <TouchableOpacity
            style={sc.cameraBtn}
            onPress={() => router.replace('/camera/camera-screen' as any)}
            activeOpacity={0.85}
          >
            <Text style={[sc.cameraBtnText, { fontFamily: serifBold }]}>Back to Camera →</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  }

  // ── STATE: SELECT TIER ────────────────────────────────────────────────────

  return (
    <View style={[sc.root, { backgroundColor: BG }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={sc.header}>
        <TouchableOpacity
          style={sc.closeBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={[sc.closeText, { color: TXT }]}>✕</Text>
        </TouchableOpacity>
        <View style={sc.headerCenter}><Logo textColor={TXT} /></View>
        <View style={sc.closeBtn} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[sc.scroll, { paddingHorizontal: H_PAD }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Heading */}
        <View style={sc.headingWrap}>
          <Text style={[sc.heading, { color: TXT, fontFamily: serifBold }]}>
            Get more{'\n'}shots.
          </Text>
          <Text style={[sc.subheading, { color: MUTED, fontFamily: serif }]}>
            Choose a pack below and keep shooting.
          </Text>
        </View>

        {/* Current shots banner */}
        {participant && (
          <View style={[sc.currentBanner, { borderColor: 'rgba(255,255,255,0.1)' }]}>
            <Text style={[sc.currentBannerText, { color: MUTED, fontFamily: serif }]}>
              You currently have{' '}
              <Text style={{ color: GOLD, fontFamily: serifBold }}>
                {participant.shot_limit} shot{participant.shot_limit !== 1 ? 's' : ''}
              </Text>
              {' '}remaining.
            </Text>
          </View>
        )}

        {/* Tier cards */}
        <View style={sc.tiersWrap}>
          {TIERS.map((tier, idx) => {
            const isSelected = idx === selectedTier;
            const isPopular  = idx === 2; // 25-shot ₹299 tier
            return (
              <TouchableOpacity
                key={tier.price}
                style={[
                  sc.tierCard,
                  { borderColor: isSelected ? GOLD : 'rgba(255,255,255,0.1)' },
                  isSelected && sc.tierCardSelected,
                ]}
                onPress={() => setSelectedTier(idx)}
                activeOpacity={0.82}
              >
                {/* Popular badge */}
                {isPopular && (
                  <View style={sc.popularBadge}>
                    <Text style={[sc.popularBadgeText, { fontFamily: serifBold }]}>POPULAR</Text>
                  </View>
                )}

                <View style={sc.tierCardRow}>
                  {/* Left: shot count + features */}
                  <View style={sc.tierLeft}>
                    <Text style={[sc.tierShots, { color: isSelected ? GOLD : TXT, fontFamily: serifBold }]}>
                      {tier.shots}
                    </Text>
                    <Text style={[sc.tierShotsLabel, { color: MUTED, fontFamily: serif }]}>shots</Text>
                  </View>

                  {/* Middle: perks */}
                  <View style={sc.tierMiddle}>
                    <View style={sc.perkRow}>
                      <CheckIcon size={16} />
                      <Text style={[sc.perkText, { color: MUTED, fontFamily: serif }]}>
                        {tier.shots} high-res captures
                      </Text>
                    </View>
                    <View style={sc.perkRow}>
                      <CheckIcon size={16} />
                      <Text style={[sc.perkText, { color: MUTED, fontFamily: serif }]}>
                        Film aesthetic overlays
                      </Text>
                    </View>
                    {tier.shots >= SHOT_LIMITS.public299 && (
                      <View style={sc.perkRow}>
                        <CheckIcon size={16} />
                        <Text style={[sc.perkText, { color: MUTED, fontFamily: serif }]}>
                          Priority in gallery
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Right: price + select indicator */}
                  <View style={sc.tierRight}>
                    <Text style={[sc.tierPrice, { color: isSelected ? GOLD : TXT, fontFamily: serifBold }]}>
                      {fmtINR(tier.price)}
                    </Text>
                    <View
                      style={[
                        sc.radioOuter,
                        { borderColor: isSelected ? GOLD : 'rgba(255,255,255,0.3)' },
                      ]}
                    >
                      {isSelected && <View style={sc.radioInner} />}
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Error */}
        {payError && (
          <View style={sc.errorCard}>
            <Text style={[sc.errorText, { fontFamily: serif }]}>⚠ {payError}</Text>
          </View>
        )}

        {/* Value summary */}
        <View style={[sc.summaryRow, { borderColor: 'rgba(255,255,255,0.08)' }]}>
          <Text style={[sc.summaryLabel, { color: MUTED, fontFamily: serif }]}>Selected</Text>
          <Text style={[sc.summaryValue, { color: TXT, fontFamily: serifBold }]}>
            {activeTier.shots} shots for {fmtINR(activeTier.price)}
          </Text>
        </View>

        {/* Purchase button */}
        <TouchableOpacity
          style={sc.purchaseBtn}
          onPress={handlePurchase}
          activeOpacity={0.85}
        >
          <Text style={[sc.purchaseBtnText, { fontFamily: serifBold }]}>
            Unlock {activeTier.shots} Shots · {fmtINR(activeTier.price)}
          </Text>
        </TouchableOpacity>

        <Text style={[sc.secureNote, { color: MUTED, fontFamily: serif }]}>
          🔒 Secured by Razorpay · One-time payment
        </Text>

        <View style={{ height: 40 }} />
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

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: TOP_PAD,
    paddingBottom: 12,
    paddingHorizontal: H_PAD,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  closeBtn:  { width: 32, alignItems: 'center' },
  closeText: { fontSize: 18, lineHeight: 24 },

  scroll: { paddingTop: 8 },

  // Heading
  headingWrap: { paddingVertical: 20, gap: 8 },
  heading:     { fontSize: 32, lineHeight: 44, letterSpacing: 0.2 },
  subheading:  { fontSize: 15, lineHeight: 22 },

  // Current banner
  currentBanner: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  currentBannerText: { fontSize: 14, lineHeight: 20 },

  // Tiers
  tiersWrap: { gap: 12, marginBottom: 24 },
  tierCard: {
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 18,
    backgroundColor: 'rgba(255,255,255,0.03)',
    overflow: 'hidden',
  },
  tierCardSelected: { backgroundColor: GOLD_T },

  popularBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: GOLD,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomLeftRadius: 12,
  },
  popularBadgeText: { fontSize: 9, color: '#0C0904', letterSpacing: 1.2 },

  tierCardRow:  { flexDirection: 'row', alignItems: 'center', gap: 14 },
  tierLeft:     { alignItems: 'center', minWidth: 50 },
  tierShots:    { fontSize: 36, lineHeight: 42 },
  tierShotsLabel: { fontSize: 11, letterSpacing: 0.5, marginTop: -2 },

  tierMiddle: { flex: 1, gap: 6 },
  perkRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  perkText:   { fontSize: 12, lineHeight: 17 },

  tierRight:  { alignItems: 'center', gap: 8 },
  tierPrice:  { fontSize: 18 },
  radioOuter: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2,
    justifyContent: 'center', alignItems: 'center',
  },
  radioInner: { width: 11, height: 11, borderRadius: 6, backgroundColor: GOLD },

  // Check icon (inline perk ✓)
  checkCircle: { backgroundColor: GOLD, justifyContent: 'center', alignItems: 'center' },
  checkMark:   { color: '#0C0904', fontWeight: '700', textAlign: 'center' },

  // Error card
  errorCard: {
    backgroundColor: 'rgba(255,80,80,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,80,80,0.3)',
    borderRadius: 10, padding: 12, marginBottom: 16,
  },
  errorText: { color: '#FF6B6B', fontSize: 13, lineHeight: 19 },

  // Summary row
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 16,
    marginBottom: 16,
  },
  summaryLabel: { fontSize: 13 },
  summaryValue: { fontSize: 15 },

  // Purchase button
  purchaseBtn: {
    backgroundColor: GOLD,
    height: 56,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    ...Platform.select({
      ios:     { shadowColor: GOLD, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10 },
      android: { elevation: 6 },
      default: {},
    }),
  },
  purchaseBtnText: { fontSize: 15, color: '#0C0904', letterSpacing: 1.4, textTransform: 'uppercase' },

  secureNote: { textAlign: 'center', fontSize: 12, opacity: 0.4, letterSpacing: 0.3 },

  // Loading state
  loadingText: { fontSize: 14, letterSpacing: 0.3 },

  // Success state
  bigCheckCircle: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: GOLD,
    justifyContent: 'center', alignItems: 'center',
    ...Platform.select({
      ios:     { shadowColor: GOLD, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 14 },
      android: { elevation: 10 },
      default: {},
    }),
  },
  bigCheckMark: { fontSize: 40, color: '#0C0904', fontWeight: '700', lineHeight: 48 },

  successTitle: { fontSize: 28, lineHeight: 36, textAlign: 'center' },
  successBody:  { fontSize: 15, lineHeight: 24, textAlign: 'center', opacity: 0.7 },

  cameraBtn: {
    backgroundColor: GOLD,
    height: 56,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraBtnText: { fontSize: 15, color: '#0C0904', letterSpacing: 1.4, textTransform: 'uppercase' },
});
