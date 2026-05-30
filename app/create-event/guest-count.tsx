import React, { useEffect, useState } from 'react';
import {
  Platform,
  ScrollView,
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
import { supabase } from '../../supabase/client';
import { useCreateEvent } from '../../shared/CreateEventContext';
import {
  PRIVATE_HOST_PRICING,
  PUBLIC_PARTICIPANT_PRICING,
  PUBLIC_ORGANISER_PRICING,
  REVENUE_SHARE,
  SHOT_LIMITS,
} from '../../shared/constants';
import type { UserRole } from '../../shared/types';

// ── Theme ──────────────────────────────────────────────────────────────────

const THEME_KEY = '@candid_onboarding_theme';
const THEMES: Record<string, { background: string; text: string }> = {
  midnight:      { background: '#0C0904', text: '#F0E8D5' },
  graphite:      { background: '#1A1A1A', text: '#FFFFFF' },
  navy:          { background: '#0D1B2A', text: '#E8F0FE' },
  forest:        { background: '#0D1F17', text: '#EAF5EE' },
  wine:          { background: '#1A0A0F', text: '#F5E8EC' },
  'deep-pink':   { background: '#3B1321', text: '#F5C8D8' },
  'burnt-orange':{ background: '#3D1C01', text: '#FFE0C0' },
};
const DEFAULT_THEME = THEMES.midnight;
const GOLD   = '#D4A853';
const GOLD_T = 'rgba(212,168,83,0.08)';
const H_PAD  = 24;

// ── Derived tier data ──────────────────────────────────────────────────────

const HOST_TIERS = [
  { maxGuests: 25,       price: 299,  label: 'Up to 25 guests',  popular: false },
  { maxGuests: 75,       price: 599,  label: 'Up to 75 guests',  popular: false },
  { maxGuests: 150,      price: 999,  label: 'Up to 150 guests', popular: true  },
  { maxGuests: 300,      price: 1799, label: 'Up to 300 guests', popular: false },
  { maxGuests: Infinity, price: 2999, label: '300+ guests',      popular: false },
] as const;

const PARTICIPANT_TIERS = PUBLIC_PARTICIPANT_PRICING.map(({ shots, price }) => ({
  name:  shots === 10 ? 'Standard' : shots === 15 ? 'Plus' : shots === 25 ? 'Pro' : 'Elite',
  shots,
  price,
  share: +(price * REVENUE_SHARE.organiserPercent / 100).toFixed(2),
}));

function fmtPrice(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`;
}

// ── Special package type ───────────────────────────────────────────────────

interface SpecialPackage {
  id: string;
  name: string;
  shots: number;
  price_per_person: number;
  description: string | null;
  is_featured: boolean;
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Logo({ color }: { color: string }) {
  return (
    <View style={s.logoRow}>
      <View style={[s.logoDot, { backgroundColor: color }]} />
      <Text style={[s.logoText, { color }]}>CANDID Clicks</Text>
    </View>
  );
}

function SectionLabel({ label, textColor, serif }: { label: string; textColor: string; serif?: string }) {
  return (
    <Text style={[s.sectionLabel, { color: textColor, fontFamily: serif }]}>{label}</Text>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: () => void }) {
  return (
    <TouchableOpacity
      style={[tog.track, { backgroundColor: value ? GOLD : 'rgba(255,255,255,0.15)' }]}
      onPress={onChange}
      activeOpacity={0.8}
    >
      <View style={[tog.thumb, { transform: [{ translateX: value ? 19 : 2 }] }]} />
    </TouchableOpacity>
  );
}
const tog = StyleSheet.create({
  track: { width: 44, height: 26, borderRadius: 13, justifyContent: 'center' },
  thumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', position: 'absolute',
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2 }, android: { elevation: 2 } }) },
});

// ── Host tier card ─────────────────────────────────────────────────────────

function TierCard({
  tier, index, selected, onSelect, textColor, serif, serifBold,
}: {
  tier: typeof HOST_TIERS[number];
  index: number;
  selected: boolean;
  onSelect: () => void;
  textColor: string;
  serif?: string;
  serifBold?: string;
}) {
  return (
    <TouchableOpacity
      style={[
        tc.card,
        { backgroundColor: selected ? GOLD_T : 'rgba(255,255,255,0.04)', borderColor: selected ? GOLD : 'rgba(255,255,255,0.1)', borderWidth: selected ? 1.5 : 1 },
      ]}
      onPress={onSelect}
      activeOpacity={0.8}
    >
      {/* Left: guest count label */}
      <View style={tc.left}>
        <Text style={[tc.guestLabel, { color: selected ? GOLD : textColor, fontFamily: serifBold }]}>
          {tier.label}
        </Text>
        {tier.popular && (
          <View style={tc.popularBadge}>
            <Text style={[tc.popularText, { fontFamily: serif }]}>Most Popular</Text>
          </View>
        )}
      </View>

      {/* Right: price */}
      <View style={tc.right}>
        <Text style={[tc.price, { fontFamily: serifBold }]}>{fmtPrice(tier.price)}</Text>
        {selected && <View style={tc.checkDot}><Text style={tc.check}>✓</Text></View>}
      </View>
    </TouchableOpacity>
  );
}

const tc = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, gap: 12 },
  left: { flex: 1, gap: 4 },
  guestLabel: { fontSize: 15, lineHeight: 20, letterSpacing: 0.1 },
  popularBadge: { alignSelf: 'flex-start', backgroundColor: GOLD, borderRadius: 8, paddingVertical: 2, paddingHorizontal: 8 },
  popularText: { fontSize: 10, color: '#0C0904', fontWeight: '700', letterSpacing: 0.4 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  price: { fontSize: 17, color: GOLD, letterSpacing: 0.2 },
  checkDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: GOLD, justifyContent: 'center', alignItems: 'center' },
  check: { color: '#0C0904', fontSize: 11, fontWeight: '700' },
});

// ── Special package card ───────────────────────────────────────────────────

function SpecialPkgCard({
  pkg, selected, onSelect, textColor, serif, serifBold,
}: {
  pkg: SpecialPackage; selected: boolean; onSelect: () => void;
  textColor: string; serif?: string; serifBold?: string;
}) {
  return (
    <TouchableOpacity
      style={[pkgc.card, {
        backgroundColor: selected ? GOLD_T : 'rgba(255,255,255,0.04)',
        borderColor:     selected ? GOLD : 'rgba(255,255,255,0.1)',
        borderWidth:     selected ? 1.5 : 1,
      }]}
      onPress={onSelect}
      activeOpacity={0.8}
    >
      <View style={pkgc.topRow}>
        <Text style={[pkgc.name, { color: selected ? GOLD : textColor, fontFamily: serifBold }]}>
          {pkg.is_featured ? '⭐ ' : ''}{pkg.name}
        </Text>
        <View style={pkgc.priceRow}>
          <Text style={[pkgc.price, { fontFamily: serifBold }]}>{fmtPrice(pkg.price_per_person)}</Text>
          {selected && (
            <View style={pkgc.checkDot}><Text style={pkgc.checkTxt}>✓</Text></View>
          )}
        </View>
      </View>
      <Text style={[pkgc.shots, { fontFamily: serif }]}>📷 {pkg.shots} shots per guest</Text>
      {pkg.description ? (
        <Text style={[pkgc.desc, { color: textColor, fontFamily: serif }]}>{pkg.description}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

const pkgc = StyleSheet.create({
  card:     { borderRadius: 12, padding: 14, marginBottom: 8, gap: 5 },
  topRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name:     { flex: 1, fontSize: 15, lineHeight: 20, letterSpacing: 0.1 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  price:    { fontSize: 16, color: GOLD, letterSpacing: 0.2 },
  checkDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: GOLD, justifyContent: 'center', alignItems: 'center' },
  checkTxt: { color: '#0C0904', fontSize: 11, fontWeight: '700' },
  shots:    { fontSize: 13, color: GOLD, opacity: 0.85 },
  desc:     { fontSize: 12, lineHeight: 18, opacity: 0.55, fontStyle: 'italic' },
});

// ── Organiser participant table ────────────────────────────────────────────

function ParticipantTable({ textColor, serif, serifBold }: { textColor: string; serif?: string; serifBold?: string }) {
  const cols = [
    { label: 'Tier',       flex: 1.1 },
    { label: 'Shots',      flex: 0.75 },
    { label: 'Price',      flex: 0.85 },
    { label: 'Your 25%',   flex: 1.3 },
  ];
  return (
    <View style={pt.wrap}>
      {/* Header row */}
      <View style={pt.headerRow}>
        {cols.map((c) => (
          <Text key={c.label} style={[pt.headerCell, { flex: c.flex, fontFamily: serif }]}>
            {c.label}
          </Text>
        ))}
      </View>
      {/* Data rows */}
      {PARTICIPANT_TIERS.map((tier, i) => (
        <View key={tier.name} style={[pt.dataRow, i % 2 === 0 && pt.evenRow]}>
          <Text style={[pt.cell, { flex: cols[0].flex, color: textColor, fontFamily: serifBold }]}>{tier.name}</Text>
          <Text style={[pt.cell, { flex: cols[1].flex, color: textColor, fontFamily: serif }]}>{tier.shots}</Text>
          <Text style={[pt.cell, { flex: cols[2].flex, color: textColor, fontFamily: serif }]}>{fmtPrice(tier.price)}</Text>
          <Text style={[pt.cell, { flex: cols[3].flex, color: GOLD, fontFamily: serifBold }]}>
            {fmtPrice(tier.share)}
            <Text style={[pt.perPerson, { fontFamily: serif }]}>/person</Text>
          </Text>
        </View>
      ))}
    </View>
  );
}

const pt = StyleSheet.create({
  wrap: { borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  headerRow: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 14, backgroundColor: 'rgba(212,168,83,0.1)', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  headerCell: { fontSize: 10, color: GOLD, letterSpacing: 1.2, textTransform: 'uppercase', opacity: 0.8 },
  dataRow: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 14 },
  evenRow: { backgroundColor: 'rgba(255,255,255,0.025)' },
  cell: { fontSize: 14, lineHeight: 20 },
  perPerson: { fontSize: 10, opacity: 0.65 },
});

// ── Pricing config fetch (with graceful fallback) ──────────────────────────

async function fetchPricingConfig(_role: UserRole) {
  // pricing_config is not queried at runtime — constants are used instead.
  // This function is kept as a stub for future remote config support.
  return null;
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function GuestCountScreen() {
  const { draft, update } = useCreateEvent();

  const insets = useSafeAreaInsets();
  const [theme, setTheme]         = useState(DEFAULT_THEME);
  const [role, setRole]           = useState<UserRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [publicVisible, setPublicVisible] = useState(true);
  const [packages,        setPackages]        = useState<SpecialPackage[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [selectedPkgId,   setSelectedPkgId]   = useState<string | null>(null);
  const [hostShotLimit,   setHostShotLimit]   = useState(50);

  const [fontsLoaded] = useFonts({ PlayfairDisplay_400Regular, PlayfairDisplay_700Bold });
  const serif     = fontsLoaded ? 'PlayfairDisplay_400Regular' : undefined;
  const serifBold = fontsLoaded ? 'PlayfairDisplay_700Bold'    : undefined;

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((k) => { if (k && THEMES[k]) setTheme(THEMES[k]); });

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setRoleLoading(false); return; }
      const { data } = await supabase.from('users').select('role').eq('id', user.id).single();
      if (data?.role) setRole(data.role as UserRole);
      // Attempt pricing_config fetch (no-op if table absent — we use constants)
      await fetchPricingConfig((data?.role as UserRole) ?? 'host');

      // Fetch host shot limit from admin pricing config
      try {
        const { data: pricingData } = await supabase
          .from('admin_settings')
          .select('value')
          .eq('key', 'pricing_config')
          .single();
        const hostLimit = (pricingData?.value as any)?.extended_limits?.host_shots;
        if (typeof hostLimit === 'number' && hostLimit > 0) setHostShotLimit(hostLimit);
      } catch { /* keep default 50 */ }

      // Fetch special packages for this role
      const userRole = data?.role as UserRole | undefined;
      setPackagesLoading(true);
      const evTypes  = userRole === 'organiser' ? ['public', 'both'] : ['private', 'both'];
      const userType = userRole === 'organiser' ? 'organiser' : 'host';
      const { data: pkgs } = await supabase
        .from('packages')
        .select('id, name, shots, price_per_person, description, is_featured')
        .eq('is_active', true)
        .in('event_type', evTypes)
        .or(`user_type.eq.${userType},user_type.is.null`)
        .eq('country_code', 'IN')
        .order('shots', { ascending: true });
      setPackages((pkgs ?? []) as SpecialPackage[]);
      setPackagesLoading(false);

      setRoleLoading(false);
    })();
  }, []);

  const isOrganiser = role === 'organiser';

  const selectedPkg = packages.find((p) => p.id === selectedPkgId) ?? null;
  const canCreate = isOrganiser || selectedIdx !== null || selectedPkgId !== null;

  const handleCreate = () => {
    if (!canCreate) return;

    if (selectedPkg) {
      // Special package selected — overrides standard tier
      update({
        guestCount:   0,
        pricingTier:  selectedPkg.price_per_person.toString(),
        eventPackage: {
          id:             selectedPkg.id,
          name:           selectedPkg.name,
          shots:          selectedPkg.shots,
          pricePerPerson: selectedPkg.price_per_person,
        },
      });
    } else if (isOrganiser) {
      update({ guestCount: 0, pricingTier: PUBLIC_ORGANISER_PRICING.singleEvent.toString(), eventPackage: null });
    } else {
      const tier = HOST_TIERS[selectedIdx!];
      update({
        guestCount:   tier.maxGuests === Infinity ? 999 : tier.maxGuests,
        pricingTier:  tier.price.toString(),
        eventPackage: null,
      });
    }
    router.push('/create-event/pricing');
  };

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={[s.backArrow, { color: theme.text }]}>←</Text>
        </TouchableOpacity>
        <View style={s.headerCenter}><Logo color={theme.text} /></View>
        <View style={s.backBtn} />
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Heading ── */}
        <Text style={[s.heading, { color: theme.text, fontFamily: serifBold }]}>
          {isOrganiser ? 'Your event is open to all.' : 'How many guests\nfor your film?'}
        </Text>
        <Text style={[s.subtext, { color: theme.text, fontFamily: serif }]}>
          {isOrganiser
            ? 'Participants choose their own tier when they join. Your earnings grow with every signup.'
            : 'Your price is based on how many guests can join your film.'}
        </Text>

        {/* ── HOST VIEW ── */}
        {!isOrganiser && !roleLoading && (
          <>
            <SectionLabel label="PRICING TIER" textColor={theme.text} serif={serif} />
            <View style={s.tiersCol}>
              {HOST_TIERS.map((tier, i) => (
                <TierCard
                  key={i}
                  tier={tier}
                  index={i}
                  selected={selectedIdx === i}
                  onSelect={() => setSelectedIdx(i)}
                  textColor={theme.text}
                  serif={serif}
                  serifBold={serifBold}
                />
              ))}
            </View>

            {/* Shots info */}
            <SectionLabel label="SHOTS PER GUEST" textColor={theme.text} serif={serif} />
            <View style={[s.infoRow, { borderColor: 'rgba(255,255,255,0.1)' }]}>
              <Text style={[s.infoMain, { color: theme.text, fontFamily: serifBold }]}>
                📷 {SHOT_LIMITS.privateGuest} shots per guest — fixed
              </Text>
            </View>
            <Text style={[s.infoNote, { color: theme.text, fontFamily: serif }]}>
              Guests take unlimited photos on their device and choose their best {SHOT_LIMITS.privateGuest} to upload.
            </Text>

            {/* Host upload limit */}
            <View style={[s.infoRow, { borderColor: 'rgba(255,255,255,0.1)', marginTop: 6, marginBottom: 20 }]}>
              <Text style={[s.infoMain, { color: theme.text, fontFamily: serif }]}>
                📷 You can upload up to{' '}
                <Text style={{ fontFamily: serifBold, color: GOLD }}>{hostShotLimit}</Text>
                {' '}photos as the event host
              </Text>
            </View>

            {/* Special packages — host */}
            {!packagesLoading && packages.length > 0 && (
              <>
                <SectionLabel label="SPECIAL PACKAGES" textColor={theme.text} serif={serif} />
                {packages.map((pkg) => (
                  <SpecialPkgCard
                    key={pkg.id}
                    pkg={pkg}
                    selected={selectedPkgId === pkg.id}
                    onSelect={() => {
                      setSelectedPkgId(selectedPkgId === pkg.id ? null : pkg.id);
                      setSelectedIdx(null);
                    }}
                    textColor={theme.text}
                    serif={serif}
                    serifBold={serifBold}
                  />
                ))}
              </>
            )}

            {/* Visibility toggle */}
            <SectionLabel label="VISIBILITY" textColor={theme.text} serif={serif} />
            <View style={s.toggleRow}>
              <Text style={[s.toggleLabel, { color: theme.text, fontFamily: serif }]}>
                Everyone can see all photos
              </Text>
              <Toggle value={publicVisible} onChange={() => setPublicVisible((v) => !v)} />
            </View>
          </>
        )}

        {/* ── ORGANISER VIEW ── */}
        {isOrganiser && !roleLoading && (
          <>
            <SectionLabel label="PARTICIPANT TIERS" textColor={theme.text} serif={serif} />
            <ParticipantTable textColor={theme.text} serif={serif} serifBold={serifBold} />

            {/* Growth note */}
            <Text style={[s.growthNote, { color: theme.text, fontFamily: serif }]}>
              The more guests who join, the more you earn. Share your QR code everywhere.
            </Text>

            {/* Disclaimer */}
            <View style={[s.disclaimerCard, { borderColor: 'rgba(255,255,255,0.1)' }]}>
              <Text style={[s.disclaimerText, { color: theme.text, fontFamily: serif }]}>
                CANDID Clicks is a photo sharing and reveal platform. You are the event organiser.
                Candid provides only the photo service.
              </Text>
            </View>

            {/* Organiser fee */}
            <View style={[s.feeCard, { borderColor: selectedPkgId ? 'rgba(255,255,255,0.12)' : GOLD, opacity: selectedPkgId ? 0.45 : 1 }]}>
              <View style={s.feeLeft}>
                <Text style={[s.feeLabel, { color: theme.text, fontFamily: serif }]}>Event creation fee</Text>
                <Text style={[s.feeNote, { color: theme.text, fontFamily: serif }]}>One-time · single event</Text>
              </View>
              <Text style={[s.feePrice, { fontFamily: serifBold }]}>
                {fmtPrice(PUBLIC_ORGANISER_PRICING.singleEvent)}
              </Text>
            </View>

            {/* Special packages — organiser */}
            {!packagesLoading && packages.length > 0 && (
              <>
                <SectionLabel label="SPECIAL PACKAGES" textColor={theme.text} serif={serif} />
                {packages.map((pkg) => (
                  <SpecialPkgCard
                    key={pkg.id}
                    pkg={pkg}
                    selected={selectedPkgId === pkg.id}
                    onSelect={() => setSelectedPkgId(selectedPkgId === pkg.id ? null : pkg.id)}
                    textColor={theme.text}
                    serif={serif}
                    serifBold={serifBold}
                  />
                ))}
              </>
            )}
          </>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Footer */}
      <View style={[s.footer, { backgroundColor: theme.background, paddingBottom: insets.bottom + 24 }]}>
        {/* Summary line */}
        <View style={s.summaryRow}>
          {selectedPkg ? (
            <>
              <Text style={[s.summaryKey, { color: theme.text, fontFamily: serif }]}>Special package</Text>
              <Text style={[s.summaryVal, { fontFamily: serifBold }]}>
                {selectedPkg.name} · {fmtPrice(selectedPkg.price_per_person)}
              </Text>
            </>
          ) : !isOrganiser && selectedIdx !== null ? (
            <>
              <Text style={[s.summaryKey, { color: theme.text, fontFamily: serif }]}>Selected tier</Text>
              <Text style={[s.summaryVal, { fontFamily: serifBold }]}>
                {HOST_TIERS[selectedIdx].label} · {fmtPrice(HOST_TIERS[selectedIdx].price)}
              </Text>
            </>
          ) : isOrganiser ? (
            <>
              <Text style={[s.summaryKey, { color: theme.text, fontFamily: serif }]}>Creation fee</Text>
              <Text style={[s.summaryVal, { fontFamily: serifBold }]}>
                {fmtPrice(PUBLIC_ORGANISER_PRICING.singleEvent)}
              </Text>
            </>
          ) : null}
        </View>

        <TouchableOpacity
          style={[
            s.createBtn,
            {
              backgroundColor: canCreate ? GOLD : 'rgba(255,255,255,0.07)',
              borderColor: canCreate ? GOLD : 'rgba(255,255,255,0.12)',
            },
          ]}
          onPress={handleCreate}
          disabled={!canCreate}
          activeOpacity={0.82}
        >
          <Text style={[s.createBtnText, { color: canCreate ? '#0C0904' : theme.text, fontFamily: serifBold, opacity: canCreate ? 1 : 0.35 }]}>
            Create Film →
          </Text>
        </TouchableOpacity>
      </View>
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
  scrollContent: { paddingHorizontal: H_PAD, paddingTop: 28 },

  heading: { fontSize: 32, lineHeight: 44, letterSpacing: 0.2, marginBottom: 10 },
  subtext:  { fontSize: 15, lineHeight: 24, opacity: 0.6, marginBottom: 24 },

  sectionLabel: { fontSize: 10, letterSpacing: 2, opacity: 0.4, marginBottom: 10, textTransform: 'uppercase' as const },

  // Host
  tiersCol: { gap: 8, marginBottom: 28 },
  infoRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 8 },
  infoMain: { fontSize: 15, letterSpacing: 0.2 },
  infoNote: { fontSize: 12, lineHeight: 18, opacity: 0.5, marginBottom: 24, fontStyle: 'italic' },

  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4, marginBottom: 8 },
  toggleLabel: { fontSize: 14, lineHeight: 20, flex: 1, opacity: 0.85 },

  // Organiser
  growthNote: { fontSize: 14, lineHeight: 22, opacity: 0.6, marginTop: 18, marginBottom: 16, fontStyle: 'italic' },
  disclaimerCard: { borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 14 },
  disclaimerText: { fontSize: 12, lineHeight: 18, opacity: 0.55 },
  feeCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderRadius: 12, padding: 16,
    backgroundColor: GOLD_T,
  },
  feeLeft: { gap: 2 },
  feeLabel: { fontSize: 15, letterSpacing: 0.1 },
  feeNote: { fontSize: 11, opacity: 0.5, letterSpacing: 0.3 },
  feePrice: { fontSize: 22, color: GOLD, letterSpacing: 0.2 },

  // Footer
  footer: {
    paddingHorizontal: H_PAD, paddingTop: 12,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    gap: 10,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 20 },
  summaryKey: { fontSize: 12, letterSpacing: 0.5, opacity: 0.5 },
  summaryVal: { fontSize: 13, color: GOLD, letterSpacing: 0.2 },
  createBtn: { height: 54, borderRadius: 4, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  createBtnText: { fontSize: 15, letterSpacing: 2, textTransform: 'uppercase' },
});

