import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Modal,
  Platform,
  Pressable,
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
import { supabase } from '../../supabase/client';
import { useCreateEvent } from '../../shared/CreateEventContext';
import type { UserRole } from '../../shared/types';

// ── Theme ──────────────────────────────────────────────────────────────────

const THEME_KEY = '@guestful_onboarding_theme';
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
const SURFACE = 'rgba(255,255,255,0.05)';
const H_PAD = 24;
const { width: SCREEN_W } = Dimensions.get('window');
const CAL_W = SCREEN_W - H_PAD * 2;
const CELL = Math.floor(CAL_W / 7);

// ── Calendar helpers ───────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function buildGrid(year: number, month: number): Date[] {
  const firstDow = new Date(year, month, 1).getDay();
  const days: Date[] = [];
  for (let i = firstDow - 1; i >= 0; i--) days.push(new Date(year, month, -i));
  const last = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= last; d++) days.push(new Date(year, month, d));
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

const todayMid = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
const isPast = (d: Date) => { const c = new Date(d); c.setHours(0, 0, 0, 0); return c < todayMid; };

// ── Time picker data ───────────────────────────────────────────────────────

const HOURS = ['1','2','3','4','5','6','7','8','9','10','11','12'];
const MINUTES = ['00','05','10','15','20','25','30','35','40','45','50','55'];
const ITEM_H = 46;

function to24h(h: number, p: 'AM' | 'PM') {
  if (p === 'AM') return h === 12 ? 0 : h;
  return h === 12 ? 12 : h + 12;
}

// ── Date formatting helpers ────────────────────────────────────────────────

function parseContextDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function parseContextTime(timeStr: string): { h: number; m: number } {
  if (!timeStr) return { h: 22, m: 0 };
  const [h, m] = timeStr.split(':').map(Number);
  return { h, m };
}

function formatRevealDate(dt: Date): string {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const h = dt.getHours();
  const m = dt.getMinutes();
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mStr = String(m).padStart(2, '0');
  return `${dt.getDate()} ${months[dt.getMonth()]} at ${h12}:${mStr} ${period}`;
}

// ── ScrollPicker ───────────────────────────────────────────────────────────

interface PickerProps {
  items: string[];
  selectedIndex: number;
  onChange: (i: number) => void;
  textColor: string;
  serif?: string;
  serifBold?: string;
}

const ScrollPicker = React.memo(function ScrollPicker({
  items, selectedIndex, onChange, textColor, serif, serifBold,
}: PickerProps) {
  const ref = useRef<ScrollView>(null);
  const busy = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => {
      ref.current?.scrollTo({ y: selectedIndex * ITEM_H, animated: false });
    }, 80);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onEnd = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      if (busy.current) return;
      busy.current = true;
      setTimeout(() => { busy.current = false; }, 120);
      const idx = Math.max(0, Math.min(Math.round(e.nativeEvent.contentOffset.y / ITEM_H), items.length - 1));
      onChange(idx);
    },
    [items.length, onChange],
  );

  return (
    <View style={ps.wrap}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[ps.lineTop, { borderColor: GOLD }]} />
        <View style={[ps.lineBot, { borderColor: GOLD }]} />
      </View>
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        onMomentumScrollEnd={onEnd}
        onScrollEndDrag={onEnd}
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
              style={ps.item}
              onPress={() => {
                onChange(i);
                ref.current?.scrollTo({ y: i * ITEM_H, animated: true });
              }}
            >
              <Text style={{
                fontSize: active ? 22 : 16,
                color: active ? GOLD : textColor,
                opacity: active ? 1 : 0.28,
                fontFamily: active ? serifBold : serif,
              }}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
});

const ps = StyleSheet.create({
  wrap: { height: ITEM_H * 3, overflow: 'hidden', flex: 1 },
  item: { height: ITEM_H, justifyContent: 'center', alignItems: 'center' },
  lineTop: { position: 'absolute', left: 0, right: 0, top: ITEM_H, borderTopWidth: StyleSheet.hairlineWidth, opacity: 0.55 },
  lineBot: { position: 'absolute', left: 0, right: 0, top: ITEM_H * 2, borderTopWidth: StyleSheet.hairlineWidth, opacity: 0.55 },
});

// ── PeriodToggle ───────────────────────────────────────────────────────────

function PeriodToggle({ value, onChange, textColor, serif }: {
  value: 'AM' | 'PM'; onChange: (v: 'AM' | 'PM') => void;
  textColor: string; serif?: string;
}) {
  return (
    <View style={{ gap: 6, justifyContent: 'center' }}>
      {(['AM', 'PM'] as const).map((p) => {
        const active = value === p;
        return (
          <TouchableOpacity
            key={p}
            style={[pt.btn, { borderColor: active ? GOLD : 'rgba(255,255,255,0.12)' }, active && { backgroundColor: GOLD_TINT }]}
            onPress={() => onChange(p)}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 12, color: active ? GOLD : textColor, opacity: active ? 1 : 0.4, fontFamily: serif, letterSpacing: 1 }}>
              {p}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
const pt = StyleSheet.create({
  btn: { borderWidth: 1, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10, alignItems: 'center' },
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

// ── Blurred photo mockup ───────────────────────────────────────────────────

function MockPhoto({ label, textColor }: { label: string; textColor: string }) {
  return (
    <View style={mp.card}>
      {/* Abstract blurred shapes */}
      <View style={[mp.blob, { top: 10, left: 8, width: '70%', height: 36, backgroundColor: 'rgba(180,170,160,0.2)' }]} />
      <View style={[mp.blob, { top: 52, left: 20, width: '50%', height: 24, backgroundColor: 'rgba(160,150,140,0.15)' }]} />
      <View style={[mp.blob, { top: 80, left: 8, width: '80%', height: 20, backgroundColor: 'rgba(140,130,120,0.12)' }]} />
      <View style={[mp.blob, { bottom: 32, left: 12, width: '40%', height: 18, backgroundColor: 'rgba(200,190,180,0.1)' }]} />
      {/* Frosted overlay */}
      <View style={mp.frost} />
      {/* Label */}
      <View style={mp.labelRow}>
        <View style={mp.avatar} />
        <Text style={[mp.labelText, { color: textColor }]}>{label}</Text>
      </View>
    </View>
  );
}

const mp = StyleSheet.create({
  card: { flex: 1, height: 150, borderRadius: 12, backgroundColor: 'rgba(100,90,80,0.22)', overflow: 'hidden', justifyContent: 'flex-end', padding: 10 },
  blob: { position: 'absolute', borderRadius: 6 },
  frost: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  avatar: { width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.25)' },
  labelText: { fontSize: 11, letterSpacing: 0.4, opacity: 0.8 },
});

// ── Inline mini-calendar for custom reveal date ────────────────────────────

function MiniCalendar({
  viewYear, viewMonth, selectedDate, textColor, serif, serifBold,
  onPrevMonth, onNextMonth, onSelectDate,
}: {
  viewYear: number; viewMonth: number; selectedDate: Date | null;
  textColor: string; serif?: string; serifBold?: string;
  onPrevMonth: () => void; onNextMonth: () => void;
  onSelectDate: (d: Date) => void;
}) {
  const grid = buildGrid(viewYear, viewMonth);
  return (
    <View>
      {/* Month nav */}
      <View style={mc.nav}>
        <TouchableOpacity onPress={onPrevMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[mc.arrow, { color: textColor }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[mc.monthLabel, { color: textColor, fontFamily: serifBold }]}>
          {MONTH_NAMES[viewMonth]} {viewYear}
        </Text>
        <TouchableOpacity onPress={onNextMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[mc.arrow, { color: textColor }]}>›</Text>
        </TouchableOpacity>
      </View>
      {/* Weekday headers */}
      <View style={mc.row}>
        {WEEKDAYS.map((d) => (
          <View key={d} style={[mc.cell, { height: 28 }]}>
            <Text style={[mc.wd, { color: textColor, fontFamily: serif }]}>{d}</Text>
          </View>
        ))}
      </View>
      {/* Day grid */}
      {Array.from({ length: 6 }).map((_, row) => (
        <View key={row} style={mc.row}>
          {grid.slice(row * 7, row * 7 + 7).map((date, col) => {
            const otherMonth = date.getMonth() !== viewMonth;
            const pastDate = isPast(date);
            const disabled = otherMonth || pastDate;
            const isToday = sameDay(date, todayMid);
            const isSel = selectedDate ? sameDay(date, selectedDate) : false;
            return (
              <TouchableOpacity
                key={col}
                style={[mc.cell, mc.dayCell, isSel && { backgroundColor: GOLD, borderRadius: CELL / 2 }, isToday && !isSel && mc.todayRing]}
                onPress={() => !disabled && onSelectDate(date)}
                disabled={disabled}
                activeOpacity={disabled ? 1 : 0.7}
              >
                <Text style={[mc.dayNum, { fontFamily: serif }, { color: isSel ? '#0C0904' : isToday ? GOLD : textColor }, disabled && mc.dimmed]}>
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
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  arrow: { fontSize: 24, lineHeight: 28, paddingHorizontal: 4 },
  monthLabel: { fontSize: 15, letterSpacing: 0.3 },
  row: { flexDirection: 'row' },
  cell: { width: CELL, alignItems: 'center', justifyContent: 'center' },
  dayCell: { height: CELL },
  wd: { fontSize: 10, opacity: 0.38, textTransform: 'uppercase', letterSpacing: 0.4 },
  dayNum: { fontSize: 13 },
  dimmed: { opacity: 0.2 },
  todayRing: { borderWidth: 1, borderColor: GOLD, borderRadius: CELL / 2 },
});

// ── REVEAL OPTION card data ────────────────────────────────────────────────

type RevealOption = 'during' | 'after' | 'custom';

const HOST_OPTIONS: { key: RevealOption; icon: string; label: string; sub: string }[] = [
  { key: 'during', icon: '⏳', label: 'During Event',     sub: 'Guests see photos as they are uploaded.' },
  { key: 'after',  icon: '⌛', label: 'After Event',      sub: 'Gallery unlocks automatically when your event ends.' },
  { key: 'custom', icon: '🕐', label: 'Custom Time',      sub: 'You pick the exact date and time.' },
];

// ── Main Screen ────────────────────────────────────────────────────────────

export default function RevealTimeScreen() {
  const { draft, update } = useCreateEvent();

  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [role, setRole] = useState<UserRole | null>(null);

  // Host option state
  const [option, setOption] = useState<RevealOption | null>(null);

  // Custom date picker state
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [customDate, setCustomDate] = useState<Date | null>(null);
  const [customHourIdx, setCustomHourIdx] = useState(5);   // '6'
  const [customMinIdx, setCustomMinIdx] = useState(0);     // '00'
  const [customPeriod, setCustomPeriod] = useState<'AM' | 'PM'>('PM');

  const [fontsLoaded] = useFonts({ PlayfairDisplay_400Regular, PlayfairDisplay_700Bold });
  const serif = fontsLoaded ? 'PlayfairDisplay_400Regular' : undefined;
  const serifBold = fontsLoaded ? 'PlayfairDisplay_700Bold' : undefined;

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((k) => { if (k && THEMES[k]) setTheme(THEMES[k]); });
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('users').select('role').eq('id', user.id).single()
        .then(({ data }) => { if (data?.role) setRole(data.role as UserRole); });
    });
  }, []);

  // ── Compute the ISO reveal timestamp from current selections ─────────────

  const computeRevealDt = useMemo((): Date | null => {
    const eventDate = parseContextDate(draft.eventDate);
    const { h: endH, m: endM } = parseContextTime(draft.eventEndTime);

    if (role === 'organiser') {
      if (!eventDate) return null;
      const dt = new Date(eventDate);
      dt.setHours(endH + 2, endM, 0, 0);
      return dt;
    }

    if (!option) return null;

    if (option === 'during') {
      // Photos visible from event start — store as event date at 00:00
      const dt = eventDate ? new Date(eventDate) : new Date();
      dt.setHours(0, 0, 0, 0);
      return dt;
    }

    if (option === 'after') {
      if (!eventDate) return null;
      const dt = new Date(eventDate);
      dt.setHours(endH, endM, 0, 0);
      return dt;
    }

    if (option === 'custom') {
      if (!customDate) return null;
      const h24 = to24h(Number(HOURS[customHourIdx]), customPeriod);
      const dt = new Date(customDate);
      dt.setHours(h24, customMinIdx * 5, 0, 0);
      return dt;
    }

    return null;
  }, [role, option, draft.eventDate, draft.eventEndTime, customDate, customHourIdx, customMinIdx, customPeriod]);

  // ── Reveal pill text ──────────────────────────────────────────────────────

  const pillText = useMemo(() => {
    if (option === 'during') return '🕐 Visible during the event';
    if (!computeRevealDt) return '🕐 Set your reveal time';
    return `🕐 Reveals on ${formatRevealDate(computeRevealDt)}`;
  }, [option, computeRevealDt]);

  // ── Calendar nav ──────────────────────────────────────────────────────────

  const prevCalMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear((y) => y - 1); }
    else setCalMonth((m) => m - 1);
  };
  const nextCalMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear((y) => y + 1); }
    else setCalMonth((m) => m + 1);
  };

  // ── Continue ──────────────────────────────────────────────────────────────

  const canContinue =
    role === 'organiser' ||
    (option === 'during') ||
    (option === 'after') ||
    (option === 'custom' && customDate !== null);

  const handleNext = () => {
    if (!canContinue || !computeRevealDt) return;
    update({ revealTime: computeRevealDt.toISOString() });
    router.push('/create-event/film-aesthetic');
  };

  // ── Render ────────────────────────────────────────────────────────────────

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
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        <Text style={[styles.heading, { color: theme.text, fontFamily: serifBold }]}>
          When should we reveal{'\n'}your photos?
        </Text>
        <Text style={[styles.subtext, { color: theme.text, fontFamily: serif }]}>
          Photos are hidden from everyone during the event. You choose when the gallery unlocks.
        </Text>

        {/* ── Blurred preview ── */}
        <View style={styles.previewWrap}>
          <View style={styles.photoRow}>
            <MockPhoto label="Guest 1" textColor={theme.text} />
            <MockPhoto label="Guest 2" textColor={theme.text} />
          </View>
          {/* Live reveal pill */}
          <View style={styles.pillWrap} pointerEvents="none">
            <View style={styles.pill}>
              <Text style={[styles.pillText, { fontFamily: serif }]}>{pillText}</Text>
            </View>
          </View>
        </View>

        {/* ── Host: option cards ── */}
        {role !== 'organiser' && (
          <>
            <Text style={[styles.sectionLabel, { color: theme.text, fontFamily: serif }]}>REVEAL TIMING</Text>
            <View style={styles.optionsCol}>
              {HOST_OPTIONS.map((opt) => {
                const active = option === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[
                      styles.optCard,
                      { backgroundColor: active ? GOLD_TINT : SURFACE, borderColor: active ? GOLD : 'rgba(255,255,255,0.1)', borderWidth: active ? 1.5 : 1 },
                    ]}
                    onPress={() => setOption(opt.key)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.optIcon}>{opt.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.optLabel, { color: active ? GOLD : theme.text, fontFamily: serifBold }]}>
                        {opt.label}
                      </Text>
                      <Text style={[styles.optSub, { color: theme.text, fontFamily: serif }]}>
                        {opt.sub}
                      </Text>
                    </View>
                    {active && (
                      <View style={styles.checkCircle}>
                        <Text style={styles.checkMark}>✓</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ── Custom date/time picker (shown only when custom selected) ── */}
            {option === 'custom' && (
              <View style={styles.customBlock}>
                <Text style={[styles.sectionLabel, { color: theme.text, fontFamily: serif }]}>PICK DATE</Text>
                <MiniCalendar
                  viewYear={calYear}
                  viewMonth={calMonth}
                  selectedDate={customDate}
                  textColor={theme.text}
                  serif={serif}
                  serifBold={serifBold}
                  onPrevMonth={prevCalMonth}
                  onNextMonth={nextCalMonth}
                  onSelectDate={setCustomDate}
                />
                <Text style={[styles.sectionLabel, { color: theme.text, fontFamily: serif, marginTop: 20 }]}>
                  PICK TIME
                </Text>
                <View style={styles.timeRow}>
                  <ScrollPicker items={HOURS} selectedIndex={customHourIdx} onChange={setCustomHourIdx} textColor={theme.text} serif={serif} serifBold={serifBold} />
                  <Text style={[styles.colon, { color: theme.text, fontFamily: serifBold }]}>:</Text>
                  <ScrollPicker items={MINUTES} selectedIndex={customMinIdx} onChange={setCustomMinIdx} textColor={theme.text} serif={serif} serifBold={serifBold} />
                  <PeriodToggle value={customPeriod} onChange={setCustomPeriod} textColor={theme.text} serif={serif} />
                </View>
              </View>
            )}
          </>
        )}

        {/* ── Organiser: auto-reveal info card ── */}
        {role === 'organiser' && (
          <View style={[styles.infoCard, { borderColor: GOLD }]}>
            <Text style={styles.infoIcon}>⚡</Text>
            <Text style={[styles.infoText, { color: theme.text, fontFamily: serif }]}>
              Your gallery will unlock automatically{' '}
              <Text style={{ color: GOLD }}>2 hours after your event ends</Text>
              {draft.eventDate ? ` on ${formatRevealDate(computeRevealDt ?? new Date())}.` : '.'}
            </Text>
          </View>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { backgroundColor: theme.background }]}>
        <TouchableOpacity
          style={[
            styles.nextBtn,
            {
              backgroundColor: canContinue ? GOLD : 'rgba(255,255,255,0.07)',
              borderColor: canContinue ? GOLD : 'rgba(255,255,255,0.14)',
            },
          ]}
          onPress={handleNext}
          disabled={!canContinue}
          activeOpacity={0.82}
        >
          <Text style={[styles.nextText, { color: canContinue ? '#0C0904' : theme.text, fontFamily: serifBold, opacity: canContinue ? 1 : 0.35 }]}>
            Next →
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
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
  subtext: { fontSize: 15, lineHeight: 24, opacity: 0.6, marginBottom: 24 },

  // Preview
  previewWrap: { marginBottom: 28, position: 'relative' },
  photoRow: { flexDirection: 'row', gap: 10 },
  pillWrap: {
    position: 'absolute',
    left: 0, right: 0, top: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pill: {
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderWidth: 1,
    borderColor: GOLD,
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 16,
  },
  pillText: { fontSize: 12, color: GOLD, letterSpacing: 0.3 },

  // Option cards
  sectionLabel: { fontSize: 10, letterSpacing: 2, opacity: 0.4, marginBottom: 12 },
  optionsCol: { gap: 10, marginBottom: 4 },
  optCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 14,
    padding: 16,
  },
  optIcon: { fontSize: 22 },
  optLabel: { fontSize: 15, lineHeight: 22, letterSpacing: 0.1, marginBottom: 2 },
  optSub: { fontSize: 12, lineHeight: 18, opacity: 0.55 },
  checkCircle: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: GOLD,
    justifyContent: 'center', alignItems: 'center',
  },
  checkMark: { color: '#0C0904', fontSize: 12, fontWeight: '700' },

  // Custom block
  customBlock: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },

  // Time pickers
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  colon: { fontSize: 20, lineHeight: ITEM_H, opacity: 0.6, marginHorizontal: 2 },

  // Organiser info card
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    backgroundColor: GOLD_TINT,
    padding: 18,
  },
  infoIcon: { fontSize: 20, marginTop: 1 },
  infoText: { flex: 1, fontSize: 14, lineHeight: 22, opacity: 0.85 },

  // Footer
  footer: {
    paddingHorizontal: H_PAD,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  nextBtn: { height: 52, borderRadius: 4, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  nextText: { fontSize: 14, letterSpacing: 2, textTransform: 'uppercase' },
});
