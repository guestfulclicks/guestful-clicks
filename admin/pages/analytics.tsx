import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../../supabase/client';
import { REVENUE_SHARE } from '../../shared/constants';

// ── Constants ─────────────────────────────────────────────────────────────────

const BG     = '#0F0E0C';
const CARD   = '#1A1714';
const TXT    = '#F0E8D5';
const MUTED  = 'rgba(240,232,213,0.5)';
const BORDER = 'rgba(240,232,213,0.1)';
const GOLD   = '#D4A853';
const GOLD_T = 'rgba(212,168,83,0.08)';
const GREEN  = '#4CAF50';
const BLUE   = '#5B8AF0';
const H_PAD  = 24;

// Max bar height for charts
const MAX_BAR_H = 120;

// ── Types ─────────────────────────────────────────────────────────────────────

interface MonthlyData {
  month: string;   // "Jan 2026"
  revenue: number;
  events: number;
  guests: number;
}

interface PlatformStats {
  totalEvents:     number;
  activeEvents:    number;
  totalUsers:      number;
  totalGuests:     number;
  totalPhotos:     number;
  totalRevenue:    number;
  platformRevenue: number; // 75% retained
  pendingPayouts:  number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtINR(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`;
}

function getMonthLabel(iso: string): string {
  if (!iso) return '';
  const dt = new Date(iso);
  const M  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${M[dt.getMonth()]} ${dt.getFullYear()}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, sub, color = TXT }: {
  icon: string; label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <View style={[k.card, { borderColor: BORDER }]}>
      <Text style={k.icon}>{icon}</Text>
      <Text style={[k.value, { color }]}>{value}</Text>
      <Text style={k.label}>{label}</Text>
      {sub ? <Text style={k.sub}>{sub}</Text> : null}
    </View>
  );
}
const k = StyleSheet.create({
  card: {
    flex: 1, minWidth: 140,
    borderWidth: 1, borderRadius: 14,
    padding: 16, backgroundColor: CARD,
    gap: 4,
  },
  icon:  { fontSize: 22, marginBottom: 4 },
  value: { fontSize: 22, fontWeight: '700', color: TXT },
  label: { fontSize: 11, color: MUTED, letterSpacing: 0.5 },
  sub:   { fontSize: 11, color: MUTED, marginTop: 2 },
});

function BarChart({ data, valueKey, color, label }: {
  data: MonthlyData[];
  valueKey: keyof MonthlyData;
  color: string;
  label: string;
}) {
  const max = Math.max(...data.map(d => d[valueKey] as number), 1);
  return (
    <View style={bc.wrap}>
      <Text style={bc.chartLabel}>{label}</Text>
      <View style={bc.bars}>
        {data.map(d => {
          const val = d[valueKey] as number;
          const h   = Math.max(4, (val / max) * MAX_BAR_H);
          return (
            <View key={d.month} style={bc.barCol}>
              <Text style={bc.barVal}>{valueKey === 'revenue' ? fmtINR(val) : String(val)}</Text>
              <View style={[bc.bar, { height: h, backgroundColor: color }]} />
              <Text style={bc.barMonth}>{d.month.split(' ')[0]}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
const bc = StyleSheet.create({
  wrap:      { gap: 12 },
  chartLabel: { fontSize: 11, color: MUTED, letterSpacing: 1.2, textTransform: 'uppercase' },
  bars:      { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: MAX_BAR_H + 40 },
  barCol:    { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  bar:       { width: '80%', borderRadius: 3, minHeight: 4 },
  barVal:    { fontSize: 9, color: MUTED, textAlign: 'center' },
  barMonth:  { fontSize: 9, color: MUTED },
});

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminAnalyticsPage() {
  const [stats, setStats]     = useState<PlatformStats | null>(null);
  const [monthly, setMonthly] = useState<MonthlyData[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);

    // Parallel fetch of all aggregate data
    const [
      { count: totalEvents  },
      { count: activeEvents },
      { count: totalUsers   },
      { count: totalPhotos  },
      { data: participants  },
      { data: payoutsPend   },
      { data: events        },
    ] = await Promise.all([
      supabase.from('events').select('*', { count: 'exact', head: true }),
      supabase.from('events').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('photos').select('*', { count: 'exact', head: true }),
      supabase.from('participants').select('amount_paid, joined_at'),
      supabase.from('payouts').select('amount').eq('status', 'pending'),
      supabase.from('events').select('id, date').order('date', { ascending: true }),
    ]);

    const allPaid = (participants ?? []) as { amount_paid: number; joined_at: string }[];
    const totalRevenue = allPaid.reduce((s, r) => s + (r.amount_paid ?? 0), 0);
    const platformRevenue = Math.floor(totalRevenue * (100 - REVENUE_SHARE.organiserPercent) / 100);
    const pendingPayouts  = (payoutsPend ?? []).reduce((s: number, r: any) => s + (r.amount ?? 0), 0);

    const guestCount = (participants ?? []).length;

    setStats({
      totalEvents:     totalEvents  ?? 0,
      activeEvents:    activeEvents ?? 0,
      totalUsers:      totalUsers   ?? 0,
      totalGuests:     guestCount,
      totalPhotos:     totalPhotos  ?? 0,
      totalRevenue,
      platformRevenue,
      pendingPayouts,
    });

    // Build monthly data from participant join dates (last 6 months)
    const now        = new Date();
    const monthSlots: MonthlyData[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthSlots.push({ month: getMonthLabel(d.toISOString()), revenue: 0, events: 0, guests: 0 });
    }

    allPaid.forEach(r => {
      const label = getMonthLabel(r.joined_at);
      const slot  = monthSlots.find(s => s.month === label);
      if (slot) { slot.revenue += r.amount_paid ?? 0; slot.guests += 1; }
    });

    (events ?? []).forEach((ev: any) => {
      const label = getMonthLabel(ev.date);
      const slot  = monthSlots.find(s => s.month === label);
      if (slot) slot.events += 1;
    });

    setMonthly(monthSlots);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      {/* Page header */}
      <View style={[s.pageHeader, { borderBottomColor: BORDER }]}>
        <View>
          <Text style={s.pageTitle}>Analytics</Text>
          <Text style={s.pageSubtitle}>Platform performance overview</Text>
        </View>
        <TouchableOpacity style={s.refreshBtn} onPress={loadData}>
          <Text style={s.refreshBtnText}>↻ Refresh</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.loadWrap}>
          <ActivityIndicator color={GOLD} size="large" />
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>

          {/* KPI grid — row 1 */}
          <View style={s.kpiRow}>
            <KpiCard icon="🎭" label="Total Events"  value={String(stats!.totalEvents)}  sub={`${stats!.activeEvents} active`} color={TXT} />
            <KpiCard icon="👥" label="Total Users"   value={String(stats!.totalUsers)}   color={TXT} />
          </View>
          <View style={s.kpiRow}>
            <KpiCard icon="📷" label="Photos"        value={String(stats!.totalPhotos)}  color={TXT} />
            <KpiCard icon="🎟"  label="Participants"  value={String(stats!.totalGuests)}  color={TXT} />
          </View>

          {/* Revenue KPIs */}
          <View style={[s.section, { borderColor: BORDER }]}>
            <Text style={s.sectionTitle}>REVENUE</Text>
            <View style={s.kpiRow}>
              <KpiCard
                icon="💰"
                label="Gross Revenue"
                value={fmtINR(stats!.totalRevenue)}
                color={GOLD}
              />
              <KpiCard
                icon="🏦"
                label="Platform Share (75%)"
                value={fmtINR(stats!.platformRevenue)}
                color={GREEN}
              />
            </View>
            <View style={s.kpiRow}>
              <KpiCard
                icon="⏳"
                label="Pending Payouts"
                value={fmtINR(stats!.pendingPayouts)}
                color={GOLD}
              />
              <View style={[k.card, { borderColor: BORDER, backgroundColor: GOLD_T }]}>
                <Text style={k.icon}>📊</Text>
                <Text style={[k.value, { color: GOLD }]}>
                  {REVENUE_SHARE.organiserPercent}%
                </Text>
                <Text style={k.label}>Organiser Share</Text>
                <Text style={k.sub}>Days {REVENUE_SHARE.payoutWindowStartDay}–{REVENUE_SHARE.payoutWindowEndDay}</Text>
              </View>
            </View>
          </View>

          {/* Monthly charts */}
          {monthly.length > 0 && (
            <View style={[s.section, { borderColor: BORDER }]}>
              <Text style={s.sectionTitle}>LAST 6 MONTHS</Text>

              <View style={[s.chartCard, { borderColor: BORDER }]}>
                <BarChart data={monthly} valueKey="revenue" color={GOLD}  label="Monthly Revenue (₹)" />
              </View>

              <View style={[s.chartCard, { borderColor: BORDER }]}>
                <BarChart data={monthly} valueKey="events"  color={BLUE}  label="Events Created" />
              </View>

              <View style={[s.chartCard, { borderColor: BORDER }]}>
                <BarChart data={monthly} valueKey="guests"  color={GREEN} label="Participants Joined" />
              </View>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: H_PAD,
    paddingTop: 32,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pageTitle:    { fontSize: 24, color: TXT, fontWeight: '700', letterSpacing: 0.2 },
  pageSubtitle: { fontSize: 13, color: MUTED, marginTop: 2 },

  refreshBtn:     { borderWidth: 1, borderColor: BORDER, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  refreshBtnText: { fontSize: 13, color: MUTED },

  loadWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  kpiRow: { flexDirection: 'row', paddingHorizontal: H_PAD, gap: 12, marginTop: 12 },

  section: {
    marginHorizontal: H_PAD,
    marginTop: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: CARD,
  },
  sectionTitle: {
    fontSize: 10, color: MUTED, letterSpacing: 2,
    paddingHorizontal: H_PAD, paddingTop: 16, paddingBottom: 8,
  },

  chartCard: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: H_PAD,
    paddingVertical: 16,
  },
});
