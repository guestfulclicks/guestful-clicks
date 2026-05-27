import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  useFonts,
  PlayfairDisplay_400Regular,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import { supabase } from '../../supabase/client';
import { useCreateEvent } from '../../shared/CreateEventContext';

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

const GOLD      = '#D4A853';
const GOLD_TINT = 'rgba(212,168,83,0.08)';
const H_PAD     = 24;
const { width: SCREEN_W } = Dimensions.get('window');
const CAL_WIDTH = SCREEN_W - H_PAD * 2;
const CELL      = Math.floor(CAL_WIDTH / 7);

// ── Calendar helpers ───────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function buildGrid(year: number, month: number): Date[] {
  const firstDow = new Date(year, month, 1).getDay();
  const days: Date[] = [];
  for (let i = firstDow - 1; i >= 0; i--) days.push(new Date(year, month, -i));
  const lastDate = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= lastDate; d++) days.push(new Date(year, month, d));
  for (let d = 1; days.length < 42; d++) days.push(new Date(year, month + 1, d));
  return days;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const TODAY_MIDNIGHT = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();

function fmtDate(d: Date | null): string {
  if (!d) return 'Select date';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function fmtINR(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`;
}

// ── Types ──────────────────────────────────────────────────────────────────

interface TravelPackage {
  id: string;
  name: string;
  shots: number;
  price_per_person: number;
  description: string | null;
  is_featured: boolean;
}

// ── Aesthetic data ─────────────────────────────────────────────────────────

const AESTHETICS = [
  { key: 'original' as const, icon: '📱', title: 'Original', desc: 'True-to-life colour', bandColor: '#5B9BD5' },
  { key: 'film'     as const, icon: '🎞', title: 'Film',     desc: 'Warm grain & tones',  bandColor: '#A87E52' },
  { key: 'noir'     as const, icon: '◑',  title: 'Noir',     desc: 'Black & white',       bandColor: '#4A4A4A' },
];

// ── Logo ───────────────────────────────────────────────────────────────────

function Logo({ color }: { color: string }) {
  return (
    <View style={s.logoRow}>
      <View style={[s.logoDot, { backgroundColor: color }]} />
      <Text style={[s.logoText, { color }]}>Guestful Clicks</Text>
    </View>
  );
}

// ── MiniCalendar ───────────────────────────────────────────────────────────

function MiniCalendar({
  selected,
  onSelect,
  minDate,
  textColor,
  serif,
  serifBold,
}: {
  selected: Date | null;
  onSelect: (d: Date) => void;
  minDate?: Date | null;
  textColor: string;
  serif: string | undefined;
  serifBold: string | undefined;
}) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(selected?.getFullYear() ?? now.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected?.getMonth() ?? now.getMonth());
  const grid = buildGrid(viewYear, viewMonth);

  const prevM = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const nextM = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  return (
    <View style={mc.wrap}>
      <View style={mc.monthNav}>
        <TouchableOpacity onPress={prevM} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[mc.navArrow, { color: textColor }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[mc.monthLabel, { color: textColor, fontFamily: serifBold }]}>
          {MONTH_NAMES[viewMonth]} {viewYear}
        </Text>
        <TouchableOpacity onPress={nextM} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[mc.navArrow, { color: textColor }]}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={mc.weekRow}>
        {WEEKDAYS.map((wd) => (
          <View key={wd} style={[mc.cell, mc.wdCell]}>
            <Text style={[mc.wdText, { color: textColor, fontFamily: serif }]}>{wd}</Text>
          </View>
        ))}
      </View>

      {Array.from({ length: 6 }).map((_, row) => (
        <View key={row} style={mc.weekRow}>
          {grid.slice(row * 7, row * 7 + 7).map((date, col) => {
            const otherMonth = date.getMonth() !== viewMonth;
            const d = new Date(date); d.setHours(0, 0, 0, 0);
            const past       = d < TODAY_MIDNIGHT;
            const beforeMin  = minDate ? d < minDate : false;
            const disabled   = otherMonth || past || beforeMin;
            const isSelected = selected ? sameDay(date, selected) : false;
            const isToday    = sameDay(date, TODAY_MIDNIGHT);
            return (
              <TouchableOpacity
                key={col}
                style={[
                  mc.cell, mc.dayCell,
                  isSelected && { backgroundColor: GOLD, borderRadius: CELL / 2 },
                  isToday && !isSelected && mc.todayRing,
                ]}
                onPress={() => { if (!disabled) onSelect(date); }}
                disabled={disabled}
                activeOpacity={disabled ? 1 : 0.7}
              >
                <Text style={[
                  mc.dayText, { fontFamily: serif, color: isSelected ? '#0C0904' : textColor },
                  disabled && { opacity: 0.2 },
                  isToday && !isSelected && { color: GOLD },
                ]}>
                  {date.getDate()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const mc = StyleSheet.create({
  wrap:      { marginTop: 6, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 12, backgroundColor: 'rgba(255,255,255,0.03)' },
  monthNav:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  navArrow:  { fontSize: 22, paddingHorizontal: 4 },
  monthLabel:{ fontSize: 14, letterSpacing: 0.3 },
  weekRow:   { flexDirection: 'row' },
  cell:      { width: CELL, alignItems: 'center', justifyContent: 'center' },
  wdCell:    { height: 26 },
  wdText:    { fontSize: 9, letterSpacing: 0.5, opacity: 0.4, textTransform: 'uppercase' },
  dayCell:   { height: CELL },
  dayText:   { fontSize: 13 },
  todayRing: { borderWidth: 1, borderColor: GOLD, borderRadius: CELL / 2 },
});

// ── Main Component ─────────────────────────────────────────────────────────

export default function TravelEventScreen() {
  const { update } = useCreateEvent();
  const insets = useSafeAreaInsets();

  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [fontsLoaded] = useFonts({ PlayfairDisplay_400Regular, PlayfairDisplay_700Bold });
  const serif     = fontsLoaded ? 'PlayfairDisplay_400Regular' : undefined;
  const serifBold = fontsLoaded ? 'PlayfairDisplay_700Bold'    : undefined;

  // Trip details
  const [tripName,      setTripName]      = useState('');
  const [tripStartDate, setTripStartDate] = useState<Date | null>(null);
  const [tripEndDate,   setTripEndDate]   = useState<Date | null>(null);
  const [departureCity, setDepartureCity] = useState('');
  const [destination,   setDestination]   = useState('');
  const [calMode,       setCalMode]       = useState<'start' | 'end' | null>(null);

  // Packages
  const [packages,         setPackages]         = useState<TravelPackage[]>([]);
  const [packagesLoading,  setPackagesLoading]  = useState(true);
  const [selectedPackage,  setSelectedPackage]  = useState<TravelPackage | null>(null);

  // Travellers
  const [travellers, setTravellers] = useState(2);

  // Reveal & aesthetic
  const [revealOption, setRevealOption] = useState<'after' | 'during' | null>(null);
  const [aesthetic,    setAesthetic]    = useState<'original' | 'film' | 'noir'>('original');

  // Agency info
  const [agencyName, setAgencyName] = useState('');

  // Derived cost
  const subtotal = selectedPackage ? selectedPackage.price_per_person * travellers : 0;
  const gst      = Math.round(subtotal * 0.18);
  const total    = subtotal + gst;

  const canContinue =
    tripName.trim().length > 0 &&
    tripStartDate !== null &&
    tripEndDate !== null &&
    selectedPackage !== null &&
    travellers >= 2 &&
    revealOption !== null;

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((k) => { if (k && THEMES[k]) setTheme(THEMES[k]); });

    supabase
      .from('packages')
      .select('*')
      .eq('is_active', true)
      .eq('event_type', 'travel')
      .eq('country_code', 'IN')
      .order('shots', { ascending: true })
      .then(({ data }) => {
        setPackages((data ?? []) as TravelPackage[]);
        setPackagesLoading(false);
      });

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from('organiser_kyc')
        .select('agency_name')
        .eq('user_id', user.id)
        .maybeSingle()
        .then(({ data }) => { if (data?.agency_name) setAgencyName(data.agency_name); });
    });
  }, []);

  const handleContinue = () => {
    if (!canContinue || !selectedPackage || !tripStartDate || !tripEndDate) return;
    update({
      eventName:       tripName.trim(),
      eventDate:       toISODate(tripStartDate),
      eventEndTime:    toISODate(tripEndDate),
      departureCity:   departureCity.trim(),
      destination:     destination.trim(),
      aesthetic,
      revealMode:      revealOption!,
      travelPackage: {
        id:             selectedPackage.id,
        name:           selectedPackage.name,
        shots:          selectedPackage.shots,
        pricePerPerson: selectedPackage.price_per_person,
      },
      totalTravellers: travellers,
      totalTravelCost: total,
      isTravelAgent:   true,
    });
    router.push('/create-event/travel-payment');
  };

  const toggleCal = (mode: 'start' | 'end') =>
    setCalMode((prev) => (prev === mode ? null : mode));

  return (
    <KeyboardAvoidingView
      style={[s.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={[s.backArrow, { color: theme.text }]}>←</Text>
        </TouchableOpacity>
        <View style={s.headerCenter}><Logo color={theme.text} /></View>
        <View style={s.backBtn} />
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Heading */}
        <Text style={[s.heading, { color: theme.text, fontFamily: serifBold }]}>
          Create a Group{'\n'}Trip Film
        </Text>
        <Text style={[s.subtext, { color: theme.text, fontFamily: serif }]}>
          Your travellers shoot freely.{'\n'}You pay once. Memories last forever.
        </Text>

        {/* ── SECTION 1: Trip Details ───────────────────────────────────── */}
        <Text style={[s.sectionHead, { color: theme.text, fontFamily: serifBold }]}>
          TRIP DETAILS
        </Text>

        {/* Trip name */}
        <TextInput
          style={[s.input, { color: theme.text }]}
          placeholder="Rajasthan Heritage Tour 2026"
          placeholderTextColor="rgba(240,232,213,0.3)"
          value={tripName}
          onChangeText={setTripName}
          maxLength={60}
          selectionColor={GOLD}
        />
        {tripName.length > 0 && (
          <Text style={[s.charCount, { color: theme.text }]}>{tripName.length}/60</Text>
        )}

        {/* Start date */}
        <TouchableOpacity
          style={[s.dateRow, { borderColor: calMode === 'start' ? GOLD : 'rgba(255,255,255,0.12)' }]}
          onPress={() => toggleCal('start')}
          activeOpacity={0.75}
        >
          <Text style={[s.dateLabel, { color: theme.text, fontFamily: serif }]}>Start Date</Text>
          <Text style={[s.dateValue, { color: tripStartDate ? GOLD : 'rgba(240,232,213,0.35)', fontFamily: tripStartDate ? serifBold : serif }]}>
            {fmtDate(tripStartDate)}
          </Text>
          <Text style={[s.dateChev, { color: theme.text }]}>{calMode === 'start' ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {calMode === 'start' && (
          <MiniCalendar
            selected={tripStartDate}
            onSelect={(d) => { setTripStartDate(d); if (tripEndDate && d > tripEndDate) setTripEndDate(null); setCalMode(null); }}
            textColor={theme.text}
            serif={serif}
            serifBold={serifBold}
          />
        )}

        {/* End date */}
        <TouchableOpacity
          style={[s.dateRow, { borderColor: calMode === 'end' ? GOLD : 'rgba(255,255,255,0.12)', marginTop: 8 }]}
          onPress={() => toggleCal('end')}
          activeOpacity={0.75}
        >
          <Text style={[s.dateLabel, { color: theme.text, fontFamily: serif }]}>End Date</Text>
          <Text style={[s.dateValue, { color: tripEndDate ? GOLD : 'rgba(240,232,213,0.35)', fontFamily: tripEndDate ? serifBold : serif }]}>
            {fmtDate(tripEndDate)}
          </Text>
          <Text style={[s.dateChev, { color: theme.text }]}>{calMode === 'end' ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {calMode === 'end' && (
          <MiniCalendar
            selected={tripEndDate}
            onSelect={(d) => { setTripEndDate(d); setCalMode(null); }}
            minDate={tripStartDate}
            textColor={theme.text}
            serif={serif}
            serifBold={serifBold}
          />
        )}

        {/* Departure city */}
        <TextInput
          style={[s.input, { color: theme.text, marginTop: 16 }]}
          placeholder="Departure city"
          placeholderTextColor="rgba(240,232,213,0.3)"
          value={departureCity}
          onChangeText={setDepartureCity}
          selectionColor={GOLD}
        />

        {/* Destination */}
        <TextInput
          style={[s.input, { color: theme.text }]}
          placeholder="Destination"
          placeholderTextColor="rgba(240,232,213,0.3)"
          value={destination}
          onChangeText={setDestination}
          selectionColor={GOLD}
        />

        {/* ── SECTION 2: Packages ──────────────────────────────────────── */}
        <Text style={[s.sectionHead, { color: theme.text, fontFamily: serifBold }]}>
          CHOOSE YOUR PACKAGE
        </Text>

        {packagesLoading ? (
          <ActivityIndicator color={GOLD} size="large" style={{ marginVertical: 24 }} />
        ) : packages.length === 0 ? (
          <Text style={[s.emptyNote, { color: theme.text, fontFamily: serif }]}>
            No travel packages available. Contact support@guestfulclicks.com to get started.
          </Text>
        ) : (
          packages.map((pkg) => {
            const isSelected = selectedPackage?.id === pkg.id;
            return (
              <TouchableOpacity
                key={pkg.id}
                style={[
                  s.pkgCard,
                  {
                    backgroundColor: isSelected ? GOLD_TINT : 'rgba(255,255,255,0.04)',
                    borderColor:     isSelected ? GOLD : 'rgba(255,255,255,0.1)',
                  },
                ]}
                onPress={() => setSelectedPackage(pkg)}
                activeOpacity={0.82}
              >
                {pkg.is_featured && (
                  <View style={s.featuredBadge}>
                    <Text style={[s.featuredBadgeText, { fontFamily: serifBold }]}>⭐ POPULAR</Text>
                  </View>
                )}
                <Text style={[s.pkgName, { color: isSelected ? GOLD : theme.text, fontFamily: serifBold }]}>
                  {pkg.name}
                </Text>
                <Text style={[s.pkgShots, { color: theme.text, fontFamily: serif }]}>
                  📷 {pkg.shots} shots per traveller
                </Text>
                <Text style={[s.pkgPrice, { fontFamily: serifBold }]}>
                  {fmtINR(pkg.price_per_person)} per person
                </Text>
                {pkg.description ? (
                  <Text style={[s.pkgDesc, { color: theme.text, fontFamily: serif }]}>
                    {pkg.description}
                  </Text>
                ) : null}
              </TouchableOpacity>
            );
          })
        )}

        {/* ── SECTION 3: Travellers ────────────────────────────────────── */}
        <Text style={[s.sectionHead, { color: theme.text, fontFamily: serifBold }]}>
          HOW MANY TRAVELLERS?
        </Text>

        <View style={s.stepperRow}>
          <TouchableOpacity
            style={[s.stepBtn, { opacity: travellers <= 2 ? 0.3 : 1 }]}
            onPress={() => setTravellers((t) => Math.max(2, t - 1))}
            disabled={travellers <= 2}
            activeOpacity={0.7}
          >
            <Text style={[s.stepBtnText, { color: theme.text, fontFamily: serifBold }]}>−</Text>
          </TouchableOpacity>

          <Text style={[s.stepCount, { fontFamily: serifBold }]}>{travellers}</Text>

          <TouchableOpacity
            style={[s.stepBtn, { opacity: travellers >= 500 ? 0.3 : 1 }]}
            onPress={() => setTravellers((t) => Math.min(500, t + 1))}
            disabled={travellers >= 500}
            activeOpacity={0.7}
          >
            <Text style={[s.stepBtnText, { color: theme.text, fontFamily: serifBold }]}>+</Text>
          </TouchableOpacity>
        </View>

        {selectedPackage && (
          <Text style={[s.costLine, { color: theme.text, fontFamily: serif }]}>
            {travellers} travellers × {fmtINR(selectedPackage.price_per_person)}{' '}
            {'= '}
            <Text style={{ color: GOLD, fontFamily: serifBold }}>{fmtINR(total)}</Text>
          </Text>
        )}

        {selectedPackage && (
          <View style={[s.breakdownCard, { borderColor: 'rgba(255,255,255,0.1)' }]}>
            <View style={s.bdRow}>
              <Text style={[s.bdLabel, { color: theme.text, fontFamily: serif }]}>Package cost</Text>
              <Text style={[s.bdValue, { color: theme.text, fontFamily: serif }]}>{fmtINR(subtotal)}</Text>
            </View>
            <View style={s.bdRow}>
              <Text style={[s.bdLabel, { color: theme.text, fontFamily: serif }]}>GST (18%)</Text>
              <Text style={[s.bdValue, { color: theme.text, fontFamily: serif }]}>{fmtINR(gst)}</Text>
            </View>
            <View style={s.bdDivider} />
            <View style={s.bdRow}>
              <Text style={[s.bdTotalLabel, { color: theme.text, fontFamily: serifBold }]}>Total payable</Text>
              <Text style={[s.bdTotal, { fontFamily: serifBold }]}>{fmtINR(total)}</Text>
            </View>
            <Text style={[s.bdNote, { color: theme.text, fontFamily: serif }]}>
              Includes {selectedPackage.shots} shots per traveller
            </Text>
            <Text style={[s.bdNote, { color: theme.text, fontFamily: serif }]}>
              Gallery active for 15 days after trip
            </Text>
          </View>
        )}

        {/* ── SECTION 4: Reveal ────────────────────────────────────────── */}
        <Text style={[s.sectionHead, { color: theme.text, fontFamily: serifBold }]}>
          WHEN TO REVEAL?
        </Text>

        {([
          {
            key:  'after'  as const,
            icon: '🌅',
            title:'After Trip Ends',
            desc: 'Gallery unlocks automatically when your trip end date passes',
          },
          {
            key:  'during' as const,
            icon: '📡',
            title:'During Trip (Live Feed)',
            desc: 'Travellers see photos as they are uploaded. Perfect for day tours and excursions.',
          },
        ] as const).map((opt) => {
          const isSelected = revealOption === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              style={[
                s.revealCard,
                {
                  backgroundColor: isSelected ? GOLD_TINT : 'rgba(255,255,255,0.04)',
                  borderColor:     isSelected ? GOLD : 'rgba(255,255,255,0.1)',
                },
              ]}
              onPress={() => setRevealOption(opt.key)}
              activeOpacity={0.82}
            >
              <Text style={s.revealIcon}>{opt.icon}</Text>
              <View style={s.revealTextBlock}>
                <Text style={[s.revealTitle, { color: isSelected ? GOLD : theme.text, fontFamily: serifBold }]}>
                  {opt.title}
                </Text>
                <Text style={[s.revealDesc, { color: theme.text, fontFamily: serif }]}>
                  {opt.desc}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}

        {/* ── SECTION 5: Film Aesthetic ────────────────────────────────── */}
        <Text style={[s.sectionHead, { color: theme.text, fontFamily: serifBold }]}>
          FILM AESTHETIC
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.aestheticScroll}
          style={s.aestheticCarousel}
        >
          {AESTHETICS.map((item) => {
            const isSelected = aesthetic === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[
                  s.aestheticCard,
                  {
                    backgroundColor: isSelected ? GOLD_TINT : 'rgba(255,255,255,0.04)',
                    borderColor:     isSelected ? GOLD : 'rgba(255,255,255,0.1)',
                  },
                ]}
                onPress={() => setAesthetic(item.key)}
                activeOpacity={0.82}
              >
                <View style={[s.aestheticBand, { backgroundColor: item.bandColor }]} />
                <View style={s.aestheticBody}>
                  <Text style={s.aestheticIcon}>{item.icon}</Text>
                  <Text style={[s.aestheticTitle, { color: isSelected ? GOLD : theme.text, fontFamily: serifBold }]}>
                    {item.title}
                  </Text>
                  <Text style={[s.aestheticDesc, { color: theme.text, fontFamily: serif }]}>
                    {item.desc}
                  </Text>
                </View>
                {isSelected && (
                  <View style={s.aestheticCheckBadge}>
                    <Text style={[s.aestheticCheckText, { fontFamily: serifBold }]}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── SECTION 6: Invitation Preview ───────────────────────────── */}
        <Text style={[s.sectionHead, { color: theme.text, fontFamily: serifBold }]}>
          INVITATION PREVIEW
        </Text>

        <View style={s.phoneFrame}>
          <View style={[s.phoneBody, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
            {/* Status bar mock */}
            <View style={s.phoneSB}>
              <View style={s.phoneSBDot} />
              <View style={[s.phoneSBLine, { flex: 1 }]} />
              <View style={[s.phoneSBLine, { width: 16 }]} />
            </View>

            {/* Content */}
            <View style={s.phoneContent}>
              <Text style={[s.phoneBrand, { fontFamily: serif }]}>GUESTFUL CLICKS</Text>

              <Text style={[s.phoneEventName, { fontFamily: serifBold }]} numberOfLines={2}>
                {tripName || 'Your Trip Name'}
              </Text>

              {selectedPackage ? (
                <Text style={[s.phonePackage, { color: theme.text, fontFamily: serif }]}>
                  {selectedPackage.name}
                </Text>
              ) : null}

              <Text style={[s.phoneShots, { fontFamily: serif }]}>
                📷 {selectedPackage ? `${selectedPackage.shots} shots` : '— shots'} available
              </Text>

              <Text style={[s.phoneInvited, { color: theme.text, fontFamily: serif }]}>
                Invited by
              </Text>
              <Text style={[s.phoneAgency, { fontFamily: serifBold }]}>
                {agencyName || 'Your Agency'}
              </Text>

              <View style={s.phoneScanBtn}>
                <Text style={[s.phoneScanText, { fontFamily: serifBold }]}>📷 Scan to join</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Footer: Continue button ───────────────────────────────────────── */}
      <View style={[s.footer, { backgroundColor: theme.background, paddingBottom: insets.bottom + 24 }]}>
        <TouchableOpacity
          style={[
            s.continueBtn,
            {
              backgroundColor: canContinue ? GOLD : 'rgba(255,255,255,0.08)',
              borderColor:     canContinue ? GOLD : 'rgba(255,255,255,0.15)',
            },
          ]}
          onPress={handleContinue}
          disabled={!canContinue}
          activeOpacity={0.82}
        >
          <Text style={[
            s.continueBtnText,
            {
              color:      canContinue ? '#0C0904' : theme.text,
              fontFamily: serifBold,
              opacity:    canContinue ? 1 : 0.4,
            },
          ]}>
            Continue to Payment
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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

  // Body
  scroll:       { flex: 1 },
  scrollContent:{ paddingHorizontal: H_PAD, paddingTop: 24 },
  heading:      { fontSize: 32, lineHeight: 44, letterSpacing: 0.2, marginBottom: 10 },
  subtext:      { fontSize: 15, lineHeight: 24, opacity: 0.6, marginBottom: 28 },
  sectionHead:  { fontSize: 11, letterSpacing: 2.5, opacity: 0.5, marginTop: 28, marginBottom: 14 },

  // Inputs
  input: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  charCount: { fontSize: 11, opacity: 0.35, textAlign: 'right', marginTop: -6, marginBottom: 6 },

  // Date rows
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  dateLabel: { fontSize: 13, opacity: 0.5, flex: 1 },
  dateValue: { fontSize: 15, letterSpacing: 0.2 },
  dateChev:  { fontSize: 12, marginLeft: 10, opacity: 0.5 },

  // Package cards
  pkgCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
    gap: 6,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 5 },
      android: { elevation: 3 },
    }),
  },
  pkgName:   { fontSize: 17, letterSpacing: 0.2 },
  pkgShots:  { fontSize: 13, opacity: 0.7 },
  pkgPrice:  { fontSize: 16, color: GOLD, letterSpacing: 0.3 },
  pkgDesc:   { fontSize: 12, lineHeight: 18, opacity: 0.55, marginTop: 2 },
  featuredBadge:    { alignSelf: 'flex-start', backgroundColor: GOLD, borderRadius: 8, paddingVertical: 2, paddingHorizontal: 8, marginBottom: 4 },
  featuredBadgeText:{ fontSize: 10, color: '#0C0904', letterSpacing: 0.8 },
  emptyNote: { fontSize: 14, lineHeight: 22, opacity: 0.55, textAlign: 'center', paddingVertical: 24 },

  // Traveller stepper
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 32, marginBottom: 16 },
  stepBtn:    { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },
  stepBtnText:{ fontSize: 24, lineHeight: 28 },
  stepCount:  { fontSize: 52, color: GOLD, letterSpacing: 0.5, minWidth: 80, textAlign: 'center' },
  costLine:   { fontSize: 15, lineHeight: 24, textAlign: 'center', marginBottom: 16 },

  // Cost breakdown
  breakdownCard: { borderWidth: 1, borderRadius: 14, padding: 18, marginBottom: 8, gap: 10, backgroundColor: 'rgba(255,255,255,0.03)' },
  bdRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bdLabel:      { fontSize: 14, opacity: 0.6 },
  bdValue:      { fontSize: 14 },
  bdDivider:    { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.12)', marginVertical: 4 },
  bdTotalLabel: { fontSize: 15 },
  bdTotal:      { fontSize: 26, color: GOLD, letterSpacing: 0.3 },
  bdNote:       { fontSize: 12, opacity: 0.5, lineHeight: 18 },

  // Reveal options
  revealCard: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
    alignItems: 'flex-start',
    gap: 16,
  },
  revealIcon:      { fontSize: 28, marginTop: 2 },
  revealTextBlock: { flex: 1, gap: 6 },
  revealTitle:     { fontSize: 16, letterSpacing: 0.2 },
  revealDesc:      { fontSize: 13, lineHeight: 20, opacity: 0.65 },

  // Aesthetic carousel
  aestheticCarousel: { overflow: 'visible' },
  aestheticScroll:   { gap: 12, paddingRight: H_PAD / 2 },
  aestheticCard: {
    width: 152,
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6 },
      android: { elevation: 4 },
    }),
  },
  aestheticBand:       { height: 28, width: '100%' },
  aestheticBody:       { padding: 12, gap: 4 },
  aestheticIcon:       { fontSize: 16 },
  aestheticTitle:      { fontSize: 14, letterSpacing: 0.2 },
  aestheticDesc:       { fontSize: 11, lineHeight: 16, opacity: 0.6 },
  aestheticCheckBadge: { position: 'absolute', top: 6, right: 8, backgroundColor: GOLD, borderRadius: 8, paddingVertical: 1, paddingHorizontal: 6 },
  aestheticCheckText:  { fontSize: 10, color: '#0C0904' },

  // Phone preview
  phoneFrame: { alignItems: 'center', marginVertical: 8 },
  phoneBody: {
    width: 190,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: GOLD,
    overflow: 'hidden',
    ...Platform.select({
      ios:     { shadowColor: GOLD, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12 },
      android: { elevation: 6 },
    }),
  },
  phoneSB:     { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8, paddingBottom: 4 },
  phoneSBDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: GOLD, opacity: 0.6 },
  phoneSBLine: { height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.2)' },
  phoneContent:{ padding: 16, gap: 6 },
  phoneBrand:  { fontSize: 8, letterSpacing: 1.5, color: GOLD, opacity: 0.7 },
  phoneEventName: { fontSize: 14, color: GOLD, letterSpacing: 0.2, lineHeight: 20 },
  phonePackage:{ fontSize: 11, opacity: 0.65 },
  phoneShots:  { fontSize: 11, opacity: 0.65 },
  phoneInvited:{ fontSize: 10, opacity: 0.45, marginTop: 4 },
  phoneAgency: { fontSize: 12, color: GOLD, letterSpacing: 0.2 },
  phoneScanBtn:{ marginTop: 12, backgroundColor: GOLD, borderRadius: 6, paddingVertical: 8, alignItems: 'center' },
  phoneScanText:{ fontSize: 11, color: '#0C0904', letterSpacing: 0.5 },

  // Footer
  footer: {
    paddingHorizontal: H_PAD,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  continueBtn:     { height: 56, borderRadius: 4, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  continueBtnText: { fontSize: 14, letterSpacing: 2, textTransform: 'uppercase' },
});
