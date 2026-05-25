import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  useFonts,
  PlayfairDisplay_400Regular,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import { supabase } from '../../supabase/client';
import { useCreateEvent } from '../../shared/CreateEventContext';
import type { UserRole } from '../../shared/types';

// ── Theme ──────────────────────────────────────────────────────────────────

const THEME_STORAGE_KEY = '@guestful_onboarding_theme';
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

const GOLD = '#D4A853';
const GOLD_TINT = 'rgba(212,168,83,0.08)';
const H_PAD = 24;
const { width: SCREEN_W } = Dimensions.get('window');
const CAL_WIDTH = SCREEN_W - H_PAD * 2;
const CELL = Math.floor(CAL_WIDTH / 7);

// ── Calendar helpers ───────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function buildGrid(year: number, month: number): Date[] {
  const firstDow = new Date(year, month, 1).getDay();
  const days: Date[] = [];
  // Leading days from previous month
  for (let i = firstDow - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i));
  }
  // Current month days
  const lastDate = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= lastDate; d++) days.push(new Date(year, month, d));
  // Trailing days to fill 42 cells (6 rows)
  for (let d = 1; days.length < 42; d++) days.push(new Date(year, month + 1, d));
  return days;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const todayMidnight = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
})();

function isPastDate(d: Date) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy < todayMidnight;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── Time picker data & helpers ─────────────────────────────────────────────

const HOURS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];
const ITEM_H = 46;

function to24h(hour1to12: number, period: 'AM' | 'PM'): number {
  if (period === 'AM') return hour1to12 === 12 ? 0 : hour1to12;
  return hour1to12 === 12 ? 12 : hour1to12 + 12;
}

function formatHHMM(hourIdx: number, minuteIdx: number, period: 'AM' | 'PM'): string {
  const h = to24h(Number(HOURS[hourIdx]), period);
  const m = minuteIdx * 5;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ── ScrollPicker ───────────────────────────────────────────────────────────

interface PickerProps {
  items: string[];
  selectedIndex: number;
  onChange: (idx: number) => void;
  textColor: string;
  serif: string | undefined;
  serifBold: string | undefined;
}

const ScrollPicker = React.memo(function ScrollPicker({
  items,
  selectedIndex,
  onChange,
  textColor,
  serif,
  serifBold,
}: PickerProps) {
  const ref = useRef<ScrollView>(null);
  const busy = useRef(false); // debounce double-fire from drag + momentum

  useEffect(() => {
    const t = setTimeout(() => {
      ref.current?.scrollTo({ y: selectedIndex * ITEM_H, animated: false });
    }, 80);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEnd = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      if (busy.current) return;
      busy.current = true;
      setTimeout(() => { busy.current = false; }, 120);
      const idx = Math.max(
        0,
        Math.min(Math.round(e.nativeEvent.contentOffset.y / ITEM_H), items.length - 1),
      );
      onChange(idx);
    },
    [items.length, onChange],
  );

  return (
    <View style={pickerStyles.wrap}>
      {/* Selection bracket */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[pickerStyles.bracketTop, { borderColor: GOLD }]} />
        <View style={[pickerStyles.bracketBottom, { borderColor: GOLD }]} />
      </View>

      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        onMomentumScrollEnd={handleEnd}
        onScrollEndDrag={handleEnd}
        contentContainerStyle={{ paddingVertical: ITEM_H }}
        bounces={false}
        overScrollMode="never"
        nestedScrollEnabled
      >
        {items.map((label, i) => {
          const active = i === selectedIndex;
          return (
            <TouchableOpacity
              key={label}
              style={pickerStyles.item}
              onPress={() => {
                onChange(i);
                ref.current?.scrollTo({ y: i * ITEM_H, animated: true });
              }}
            >
              <Text
                style={{
                  fontSize: active ? 22 : 16,
                  color: active ? GOLD : textColor,
                  opacity: active ? 1 : 0.28,
                  fontFamily: active ? serifBold : serif,
                }}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
});

const pickerStyles = StyleSheet.create({
  wrap: {
    height: ITEM_H * 3,
    overflow: 'hidden',
    flex: 1,
  },
  item: {
    height: ITEM_H,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bracketTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: ITEM_H,
    height: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    opacity: 0.55,
  },
  bracketBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: ITEM_H * 2,
    height: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    opacity: 0.55,
  },
});

// ── PeriodToggle ───────────────────────────────────────────────────────────

function PeriodToggle({
  value,
  onChange,
  textColor,
  serif,
}: {
  value: 'AM' | 'PM';
  onChange: (v: 'AM' | 'PM') => void;
  textColor: string;
  serif: string | undefined;
}) {
  return (
    <View style={pt.wrap}>
      {(['AM', 'PM'] as const).map((p) => {
        const active = value === p;
        return (
          <TouchableOpacity
            key={p}
            style={[
              pt.btn,
              { borderColor: active ? GOLD : 'rgba(255,255,255,0.12)' },
              active && { backgroundColor: GOLD_TINT },
            ]}
            onPress={() => onChange(p)}
            activeOpacity={0.7}
          >
            <Text
              style={{
                fontSize: 12,
                color: active ? GOLD : textColor,
                opacity: active ? 1 : 0.4,
                fontFamily: serif,
                letterSpacing: 1,
              }}
            >
              {p}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const pt = StyleSheet.create({
  wrap: { gap: 6, justifyContent: 'center' },
  btn: {
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
});

// ── Logo ───────────────────────────────────────────────────────────────────

function Logo({ color }: { color: string }) {
  return (
    <View style={styles.logoRow}>
      <View style={[styles.logoDot, { backgroundColor: color }]} />
      <Text style={[styles.logoText, { color }]}>Guestful Clicks</Text>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────

export default function EventDateScreen() {
  const { update } = useCreateEvent();

  const insets = useSafeAreaInsets();
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [role, setRole] = useState<UserRole | null>(null);

  // Calendar state
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Time state — defaults: Start 6:00 PM, End 10:00 PM
  const [startHour, setStartHour] = useState(5);   // index of '6'
  const [startMin, setStartMin] = useState(0);
  const [startPeriod, setStartPeriod] = useState<'AM' | 'PM'>('PM');
  const [endHour, setEndHour] = useState(9);        // index of '10'
  const [endMin, setEndMin] = useState(0);
  const [endPeriod, setEndPeriod] = useState<'AM' | 'PM'>('PM');

  const [fontsLoaded] = useFonts({
    PlayfairDisplay_400Regular,
    PlayfairDisplay_700Bold,
  });
  const serif = fontsLoaded ? 'PlayfairDisplay_400Regular' : undefined;
  const serifBold = fontsLoaded ? 'PlayfairDisplay_700Bold' : undefined;

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((key) => {
      if (key && THEMES[key]) setTheme(THEMES[key]);
    });
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data?.role) setRole(data.role as UserRole);
        });
    });
  }, []);

  const grid = buildGrid(viewYear, viewMonth);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  const handleContinue = () => {
    if (!selectedDate) return;
    update({
      eventDate: toISODate(selectedDate),
      eventEndTime: formatHHMM(endHour, endMin, endPeriod),
    });
    router.push('/create-event/reveal-time');
  };

  const handleSkip = () => {
    router.push('/create-event/reveal-time');
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle="light-content" />

      {/* Fixed header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={[styles.backArrow, { color: theme.text }]}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Logo color={theme.text} />
        </View>
        <View style={styles.backBtn} />
      </View>

      {/* Scrollable body */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.heading, { color: theme.text, fontFamily: serifBold }]}>
          When's the event?
        </Text>
        <Text style={[styles.subtext, { color: theme.text, fontFamily: serif }]}>
          Let us know the date and we'll create the perfect film for you.
        </Text>

        {/* ── Calendar ── */}
        <View style={styles.calBox}>
          {/* Month nav */}
          <View style={styles.monthNav}>
            <TouchableOpacity onPress={prevMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[styles.navArrow, { color: theme.text }]}>‹</Text>
            </TouchableOpacity>
            <Text style={[styles.monthLabel, { color: theme.text, fontFamily: serifBold }]}>
              {MONTH_NAMES[viewMonth]} {viewYear}
            </Text>
            <TouchableOpacity onPress={nextMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[styles.navArrow, { color: theme.text }]}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Weekday headers */}
          <View style={styles.weekRow}>
            {WEEKDAYS.map((wd) => (
              <View key={wd} style={[styles.cell, styles.wdCell]}>
                <Text style={[styles.wdText, { color: theme.text, fontFamily: serif }]}>{wd}</Text>
              </View>
            ))}
          </View>

          {/* Day grid — 6 rows of 7 */}
          {Array.from({ length: 6 }).map((_, row) => (
            <View key={row} style={styles.weekRow}>
              {grid.slice(row * 7, row * 7 + 7).map((date, col) => {
                const otherMonth = date.getMonth() !== viewMonth;
                const past = isPastDate(date);
                const disabled = otherMonth || past;
                const isToday = sameDay(date, todayMidnight);
                const isSelected = selectedDate ? sameDay(date, selectedDate) : false;

                return (
                  <TouchableOpacity
                    key={col}
                    style={[
                      styles.cell,
                      styles.dayCell,
                      isSelected && { backgroundColor: GOLD, borderRadius: CELL / 2 },
                      isToday && !isSelected && styles.todayRing,
                    ]}
                    onPress={() => !disabled && setSelectedDate(date)}
                    disabled={disabled}
                    activeOpacity={disabled ? 1 : 0.7}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        { fontFamily: serif },
                        { color: isSelected ? '#0C0904' : theme.text },
                        disabled && styles.dayDisabled,
                        isToday && !isSelected && { color: GOLD },
                      ]}
                    >
                      {date.getDate()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        {/* ── Time pickers ── */}
        <Text style={[styles.sectionLabel, { color: theme.text, fontFamily: serif }]}>
          EVENT TIME
        </Text>

        <View style={styles.timesRow}>
          {/* Start Time */}
          <View style={[styles.timeBlock, { borderColor: 'rgba(255,255,255,0.1)' }]}>
            <Text style={[styles.timeLabel, { color: theme.text, fontFamily: serif }]}>
              Start Time
            </Text>
            <View style={styles.pickerRow}>
              <ScrollPicker
                items={HOURS}
                selectedIndex={startHour}
                onChange={setStartHour}
                textColor={theme.text}
                serif={serif}
                serifBold={serifBold}
              />
              <Text style={[styles.colon, { color: theme.text, fontFamily: serifBold }]}>:</Text>
              <ScrollPicker
                items={MINUTES}
                selectedIndex={startMin}
                onChange={setStartMin}
                textColor={theme.text}
                serif={serif}
                serifBold={serifBold}
              />
              <PeriodToggle
                value={startPeriod}
                onChange={setStartPeriod}
                textColor={theme.text}
                serif={serif}
              />
            </View>
          </View>

          <View style={styles.timeDivider} />

          {/* End Time */}
          <View style={[styles.timeBlock, { borderColor: 'rgba(255,255,255,0.1)' }]}>
            <Text style={[styles.timeLabel, { color: theme.text, fontFamily: serif }]}>
              End Time
            </Text>
            <View style={styles.pickerRow}>
              <ScrollPicker
                items={HOURS}
                selectedIndex={endHour}
                onChange={setEndHour}
                textColor={theme.text}
                serif={serif}
                serifBold={serifBold}
              />
              <Text style={[styles.colon, { color: theme.text, fontFamily: serifBold }]}>:</Text>
              <ScrollPicker
                items={MINUTES}
                selectedIndex={endMin}
                onChange={setEndMin}
                textColor={theme.text}
                serif={serif}
                serifBold={serifBold}
              />
              <PeriodToggle
                value={endPeriod}
                onChange={setEndPeriod}
                textColor={theme.text}
                serif={serif}
              />
            </View>
          </View>
        </View>

        {/* Role note */}
        <Text style={[styles.roleNote, { color: theme.text, fontFamily: serif }]}>
          {role === 'organiser'
            ? 'Gallery reveals 2 hours after your event ends.'
            : 'You will choose your reveal time in the next step.'}
        </Text>

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Footer — Skip + Continue */}
      <View style={[styles.footer, { backgroundColor: theme.background, paddingBottom: insets.bottom + 24 }]}>
        <TouchableOpacity
          style={styles.skipBtn}
          onPress={handleSkip}
          activeOpacity={0.6}
        >
          <Text style={[styles.skipText, { color: theme.text, fontFamily: serif }]}>
            Skip
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.continueBtn,
            {
              backgroundColor: selectedDate ? GOLD : 'rgba(255,255,255,0.07)',
              borderColor: selectedDate ? GOLD : 'rgba(255,255,255,0.14)',
            },
          ]}
          onPress={handleContinue}
          disabled={!selectedDate}
          activeOpacity={0.82}
        >
          <Text
            style={[
              styles.continueBtnText,
              {
                color: selectedDate ? '#0C0904' : theme.text,
                fontFamily: serifBold,
                opacity: selectedDate ? 1 : 0.35,
              },
            ]}
          >
            Continue
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: H_PAD,
    paddingTop: 56,
    paddingBottom: 8,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  backBtn: { width: 32, alignItems: 'center' },
  backArrow: { fontSize: 22, lineHeight: 26 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  logoDot: { width: 7, height: 7, borderRadius: 4 },
  logoText: { fontSize: 13, letterSpacing: 1.6, textTransform: 'uppercase' },

  // Body
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: H_PAD, paddingTop: 28 },

  heading: { fontSize: 32, lineHeight: 44, letterSpacing: 0.2, marginBottom: 10 },
  subtext: { fontSize: 15, lineHeight: 24, opacity: 0.6, marginBottom: 28 },

  // Calendar
  calBox: { marginBottom: 28 },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  navArrow: { fontSize: 26, lineHeight: 28, paddingHorizontal: 4 },
  monthLabel: { fontSize: 16, letterSpacing: 0.3 },
  weekRow: { flexDirection: 'row' },
  cell: { width: CELL, alignItems: 'center', justifyContent: 'center' },
  wdCell: { height: 32 },
  wdText: { fontSize: 11, letterSpacing: 0.5, opacity: 0.4, textTransform: 'uppercase' },
  dayCell: { height: CELL },
  dayText: { fontSize: 14 },
  dayDisabled: { opacity: 0.2 },
  todayRing: {
    borderWidth: 1,
    borderColor: GOLD,
    borderRadius: CELL / 2,
  },

  // Time pickers
  sectionLabel: { fontSize: 10, letterSpacing: 2, opacity: 0.4, marginBottom: 14 },
  timesRow: {
    flexDirection: 'row',
    gap: 0,
    marginBottom: 16,
  },
  timeBlock: { flex: 1 },
  timeDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginHorizontal: 12 },
  timeLabel: { fontSize: 11, letterSpacing: 1, opacity: 0.5, marginBottom: 8, textAlign: 'center' },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  colon: { fontSize: 20, lineHeight: ITEM_H, opacity: 0.6, marginHorizontal: 2 },

  // Role note
  roleNote: {
    fontSize: 12,
    lineHeight: 18,
    opacity: 0.45,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 4,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: H_PAD,
    paddingTop: 12,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    gap: 16,
  },
  skipBtn: { paddingVertical: 10, paddingHorizontal: 4 },
  skipText: { fontSize: 14, letterSpacing: 0.5, opacity: 0.45 },
  continueBtn: {
    flex: 1,
    height: 52,
    borderRadius: 4,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  continueBtnText: { fontSize: 14, letterSpacing: 2, textTransform: 'uppercase' },
});
