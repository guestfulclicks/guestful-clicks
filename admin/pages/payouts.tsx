import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../../supabase/client';
import { PayoutTable, PayoutTableRow, PayoutStatus } from '../components/payout-table';

// ── Constants ─────────────────────────────────────────────────────────────────

const BG     = '#0F0E0C';
const CARD   = '#1A1714';
const TXT    = '#F0E8D5';
const MUTED  = 'rgba(240,232,213,0.5)';
const BORDER = 'rgba(240,232,213,0.1)';
const GOLD   = '#D4A853';
const GREEN  = '#4CAF50';
const BLUE   = '#5B8AF0';
const RED    = '#FF5252';
const H_PAD  = 24;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtINR(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`;
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminPayoutsPage() {
  const [payouts, setPayouts]           = useState<PayoutTableRow[]>([]);
  const [loading, setLoading]           = useState(true);
  const [statusFilter, setStatusFilter] = useState<PayoutStatus | 'all'>('all');

  // Schedule modal
  const [scheduleId, setScheduleId]   = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState(todayISO());

  // Summary
  const [totalPending,   setTotalPending]   = useState(0);
  const [totalScheduled, setTotalScheduled] = useState(0);
  const [totalPaid,      setTotalPaid]      = useState(0);

  // ── Data load ────────────────────────────────────────────────────────────

  const loadPayouts = useCallback(async () => {
    setLoading(true);

    const { data: pos } = await supabase
      .from('payouts')
      .select('id, event_id, organiser_id, amount, status, scheduled_date')
      .order('scheduled_date', { ascending: false });

    if (!pos?.length) { setPayouts([]); setLoading(false); return; }

    const rows: PayoutTableRow[] = await Promise.all(
      pos.map(async po => {
        const [{ data: ev }, { data: org }] = await Promise.all([
          supabase.from('events').select('title, date').eq('id', po.event_id).single(),
          supabase.from('users').select('full_name').eq('id', po.organiser_id).single(),
        ]);
        return {
          id:             po.id,
          event_title:    (ev as any)?.title   ?? 'Unknown',
          organiser_name: (org as any)?.full_name ?? 'Unknown',
          amount:         po.amount,
          status:         po.status as PayoutStatus,
          scheduled_date: po.scheduled_date ?? '',
          event_date:     (ev as any)?.date ?? '',
        };
      })
    );

    setPayouts(rows);

    const pending   = rows.filter(r => r.status === 'pending').reduce((s, r) => s + r.amount, 0);
    const scheduled = rows.filter(r => r.status === 'scheduled').reduce((s, r) => s + r.amount, 0);
    const paid      = rows.filter(r => r.status === 'paid').reduce((s, r) => s + r.amount, 0);
    setTotalPending(pending);
    setTotalScheduled(scheduled);
    setTotalPaid(paid);

    setLoading(false);
  }, []);

  useEffect(() => { loadPayouts(); }, [loadPayouts]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleSchedule = (id: string) => {
    setScheduleId(id);
    setScheduleDate(todayISO());
  };

  const confirmSchedule = async () => {
    if (!scheduleId) return;
    await supabase
      .from('payouts')
      .update({ status: 'scheduled', scheduled_date: scheduleDate })
      .eq('id', scheduleId);
    setPayouts(prev =>
      prev.map(p => p.id === scheduleId
        ? { ...p, status: 'scheduled' as PayoutStatus, scheduled_date: scheduleDate }
        : p)
    );
    setScheduleId(null);
  };

  const handleMarkPaid = (id: string) => {
    Alert.alert('Mark as paid?', 'This will record the payout as completed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark Paid',
        onPress: async () => {
          await supabase.from('payouts').update({ status: 'paid' }).eq('id', id);
          setPayouts(prev => prev.map(p => p.id === id ? { ...p, status: 'paid' as PayoutStatus } : p));
        },
      },
    ]);
  };

  const handleMarkFailed = (id: string) => {
    Alert.alert('Mark as failed?', 'This will flag the payout as failed and require re-processing.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark Failed',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('payouts').update({ status: 'failed' }).eq('id', id);
          setPayouts(prev => prev.map(p => p.id === id ? { ...p, status: 'failed' as PayoutStatus } : p));
        },
      },
    ]);
  };

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filtered = payouts.filter(p =>
    statusFilter === 'all' || p.status === statusFilter
  );

  // ── Render ────────────────────────────────────────────────────────────────

  const STATUS_FILTERS: (PayoutStatus | 'all')[] = ['all', 'pending', 'scheduled', 'paid', 'failed'];
  const statusColors: Record<PayoutStatus | 'all', string> = {
    all: MUTED, pending: GOLD, scheduled: BLUE, paid: GREEN, failed: RED,
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      {/* Page header */}
      <View style={[s.pageHeader, { borderBottomColor: BORDER }]}>
        <View>
          <Text style={s.pageTitle}>Payouts</Text>
          <Text style={s.pageSubtitle}>Organiser payout management</Text>
        </View>
        <TouchableOpacity style={s.refreshBtn} onPress={loadPayouts}>
          <Text style={s.refreshBtnText}>↻ Refresh</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>

        {/* Summary cards */}
        <View style={s.statsRow}>
          <View style={[s.statCard, { borderColor: BORDER }]}>
            <Text style={s.statLabel}>Pending</Text>
            <Text style={[s.statValue, { color: GOLD }]}>{fmtINR(totalPending)}</Text>
          </View>
          <View style={[s.statCard, { borderColor: BORDER }]}>
            <Text style={s.statLabel}>Scheduled</Text>
            <Text style={[s.statValue, { color: BLUE }]}>{fmtINR(totalScheduled)}</Text>
          </View>
          <View style={[s.statCard, { borderColor: BORDER }]}>
            <Text style={s.statLabel}>Paid Out</Text>
            <Text style={[s.statValue, { color: GREEN }]}>{fmtINR(totalPaid)}</Text>
          </View>
        </View>

        {/* Status filter */}
        <View style={[s.filtersWrap, { borderBottomColor: BORDER }]}>
          <View style={s.filterTabs}>
            {STATUS_FILTERS.map(tab => (
              <TouchableOpacity
                key={tab}
                style={[
                  s.filterTab,
                  { borderColor: statusFilter === tab ? statusColors[tab] : BORDER },
                  statusFilter === tab && { backgroundColor: `${statusColors[tab]}18` },
                ]}
                onPress={() => setStatusFilter(tab)}
              >
                <Text style={[s.filterTabText, { color: statusFilter === tab ? statusColors[tab] : MUTED }]}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Results */}
        <View style={s.resultsRow}>
          <Text style={s.resultsText}>{filtered.length} payout{filtered.length !== 1 ? 's' : ''}</Text>
        </View>

        {/* Table */}
        <View style={[s.tableWrap, { borderColor: BORDER }]}>
          <PayoutTable
            payouts={filtered}
            loading={loading}
            onSchedule={handleSchedule}
            onMarkPaid={handleMarkPaid}
            onMarkFailed={handleMarkFailed}
          />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Schedule date modal */}
      <Modal
        visible={!!scheduleId}
        transparent
        animationType="fade"
        onRequestClose={() => setScheduleId(null)}
      >
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { borderColor: BORDER }]}>
            <Text style={s.modalTitle}>Schedule Payout</Text>
            <Text style={s.modalLabel}>Scheduled Date (YYYY-MM-DD)</Text>
            <TextInput
              style={[s.dateInput, { borderColor: BORDER }]}
              value={scheduleDate}
              onChangeText={setScheduleDate}
              placeholder="2026-05-22"
              placeholderTextColor={MUTED}
              keyboardType={Platform.OS === 'web' ? 'default' : 'numeric'}
            />
            <View style={s.modalActions}>
              <TouchableOpacity
                style={[s.modalBtn, { borderColor: BORDER }]}
                onPress={() => setScheduleId(null)}
              >
                <Text style={[s.modalBtnText, { color: MUTED }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalBtn, { borderColor: BLUE, backgroundColor: `${BLUE}18` }]}
                onPress={confirmSchedule}
              >
                <Text style={[s.modalBtnText, { color: BLUE }]}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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

  statsRow: { flexDirection: 'row', paddingHorizontal: H_PAD, paddingVertical: 16, gap: 12 },
  statCard: {
    flex: 1, borderWidth: 1, borderRadius: 12,
    padding: 16, backgroundColor: CARD, gap: 6,
  },
  statLabel: { fontSize: 11, color: MUTED, letterSpacing: 0.5, textTransform: 'uppercase' },
  statValue: { fontSize: 22, color: TXT, fontWeight: '700' },

  filtersWrap:   { paddingHorizontal: H_PAD, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  filterTabs:    { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  filterTab:     { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  filterTabText: { fontSize: 12 },

  resultsRow:  { paddingHorizontal: H_PAD, paddingVertical: 10 },
  resultsText: { fontSize: 12, color: MUTED },

  tableWrap: {
    marginHorizontal: H_PAD, borderWidth: 1, borderRadius: 12,
    overflow: 'hidden', backgroundColor: CARD,
  },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: H_PAD,
  },
  modalCard: {
    width: '100%', maxWidth: 400,
    backgroundColor: CARD, borderWidth: 1, borderRadius: 16,
    padding: 24, gap: 16,
  },
  modalTitle:   { fontSize: 18, color: TXT, fontWeight: '700' },
  modalLabel:   { fontSize: 12, color: MUTED, letterSpacing: 0.5 },
  dateInput: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, height: 44,
    color: TXT, fontSize: 15,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  modalActions:  { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  modalBtn:      { borderWidth: 1, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  modalBtnText:  { fontSize: 14, fontWeight: '600' },
});
