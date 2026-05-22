import React from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

// ── Constants ─────────────────────────────────────────────────────────────────

const TXT    = '#F0E8D5';
const MUTED  = 'rgba(240,232,213,0.5)';
const BORDER = 'rgba(240,232,213,0.1)';
const GOLD   = '#D4A853';
const GREEN  = '#4CAF50';
const BLUE   = '#5B8AF0';
const RED    = '#FF5252';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PayoutStatus = 'pending' | 'scheduled' | 'paid' | 'failed';

export interface PayoutTableRow {
  id: string;
  event_title: string;
  organiser_name: string;
  amount: number;
  status: PayoutStatus;
  scheduled_date: string;
  event_date: string;
}

interface PayoutTableProps {
  payouts: PayoutTableRow[];
  loading?: boolean;
  onSchedule?: (id: string) => void;
  onMarkPaid?: (id: string) => void;
  onMarkFailed?: (id: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d} ${months[m - 1]} ${y}`;
}

function fmtINR(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`;
}

function statusMeta(s: PayoutStatus): { label: string; color: string } {
  switch (s) {
    case 'pending':   return { label: 'Pending',   color: GOLD  };
    case 'scheduled': return { label: 'Scheduled', color: BLUE  };
    case 'paid':      return { label: 'Paid',       color: GREEN };
    case 'failed':    return { label: 'Failed',     color: RED   };
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PayoutTable({ payouts, loading, onSchedule, onMarkPaid, onMarkFailed }: PayoutTableProps) {
  if (loading) {
    return (
      <View style={t.loadWrap}>
        <ActivityIndicator color={GOLD} size="small" />
        <Text style={t.loadText}>Loading payouts...</Text>
      </View>
    );
  }

  if (!payouts.length) {
    return (
      <View style={t.emptyWrap}>
        <Text style={t.emptyText}>No payouts found.</Text>
      </View>
    );
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={t.table}>
        {/* Header */}
        <View style={[t.row, t.headerRow]}>
          <Text style={[t.cell, t.hCell, { width: 200 }]}>EVENT</Text>
          <Text style={[t.cell, t.hCell, { width: 160 }]}>ORGANISER</Text>
          <Text style={[t.cell, t.hCell, { width: 100 }]}>AMOUNT</Text>
          <Text style={[t.cell, t.hCell, { width: 90  }]}>STATUS</Text>
          <Text style={[t.cell, t.hCell, { width: 110 }]}>EVENT DATE</Text>
          <Text style={[t.cell, t.hCell, { width: 110 }]}>SCHED. DATE</Text>
          <Text style={[t.cell, t.hCell, { width: 180 }]}>ACTIONS</Text>
        </View>

        {/* Rows */}
        {payouts.map((po, idx) => {
          const meta = statusMeta(po.status);
          return (
            <View key={po.id} style={[t.row, idx % 2 === 1 && t.altRow]}>
              <Text style={[t.cell, t.bodyCell, { width: 200 }]} numberOfLines={2}>
                {po.event_title}
              </Text>
              <Text style={[t.cell, t.bodyCell, { width: 160 }]} numberOfLines={1}>
                {po.organiser_name}
              </Text>
              <Text style={[t.cell, t.bodyCell, { width: 100, color: GOLD, fontWeight: '600' }]}>
                {fmtINR(po.amount)}
              </Text>

              <View style={[t.cell, { width: 90 }]}>
                <View style={[t.statusPill, { borderColor: meta.color }]}>
                  <Text style={[t.statusText, { color: meta.color }]}>{meta.label}</Text>
                </View>
              </View>

              <Text style={[t.cell, t.bodyCell, { width: 110 }]}>{fmtDate(po.event_date)}</Text>
              <Text style={[t.cell, t.bodyCell, { width: 110 }]}>{fmtDate(po.scheduled_date)}</Text>

              <View style={[t.cell, t.actionsCell, { width: 180 }]}>
                {po.status === 'pending' && onSchedule && (
                  <TouchableOpacity
                    style={[t.actionBtn, { borderColor: BLUE }]}
                    onPress={() => onSchedule(po.id)}
                  >
                    <Text style={[t.actionBtnText, { color: BLUE }]}>Schedule</Text>
                  </TouchableOpacity>
                )}
                {(po.status === 'pending' || po.status === 'scheduled') && onMarkPaid && (
                  <TouchableOpacity
                    style={[t.actionBtn, { borderColor: GREEN }]}
                    onPress={() => onMarkPaid(po.id)}
                  >
                    <Text style={[t.actionBtnText, { color: GREEN }]}>Mark Paid</Text>
                  </TouchableOpacity>
                )}
                {po.status !== 'paid' && po.status !== 'failed' && onMarkFailed && (
                  <TouchableOpacity
                    style={[t.actionBtn, { borderColor: RED }]}
                    onPress={() => onMarkFailed(po.id)}
                  >
                    <Text style={[t.actionBtnText, { color: RED }]}>Failed</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const t = StyleSheet.create({
  loadWrap:  { flexDirection: 'row', alignItems: 'center', padding: 24, gap: 12 },
  loadText:  { color: MUTED, fontSize: 13 },
  emptyWrap: { padding: 24, alignItems: 'center' },
  emptyText: { color: MUTED, fontSize: 14 },

  table: { minWidth: '100%' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
    minHeight: 52,
  },
  headerRow: { backgroundColor: '#141210', minHeight: 40 },
  altRow:    { backgroundColor: 'rgba(255,255,255,0.015)' },

  cell: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  hCell:    { fontSize: 10, letterSpacing: 1.5, color: MUTED, fontWeight: '600' },
  bodyCell: { fontSize: 13, color: TXT },

  statusPill: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  statusText: { fontSize: 10, letterSpacing: 0.6, fontWeight: '600' },

  actionsCell: { gap: 6 },
  actionBtn: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  actionBtnText: { fontSize: 11, letterSpacing: 0.5 },
});
