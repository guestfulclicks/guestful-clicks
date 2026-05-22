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

const BG     = '#0F0E0C';
const CARD   = '#1A1714';
const TXT    = '#F0E8D5';
const MUTED  = 'rgba(240,232,213,0.5)';
const BORDER = 'rgba(240,232,213,0.1)';
const GOLD   = '#D4A853';
const GREEN  = '#4CAF50';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EventTableRow {
  id: string;
  title: string;
  type: 'private' | 'public';
  status: 'active' | 'revealed' | 'archived';
  date: string;
  host_name: string;
  guest_count: number;
  photo_count: number;
  revenue: number;
}

interface EventTableProps {
  events: EventTableRow[];
  loading?: boolean;
  onReveal?:  (id: string) => void;
  onArchive?: (id: string) => void;
  onView?:    (row: EventTableRow) => void;
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

function statusColor(s: string): string {
  if (s === 'active')   return GREEN;
  if (s === 'revealed') return GOLD;
  return '#888';
}

// ── Component ─────────────────────────────────────────────────────────────────

export function EventTable({ events, loading, onReveal, onArchive, onView }: EventTableProps) {
  if (loading) {
    return (
      <View style={t.loadWrap}>
        <ActivityIndicator color={GOLD} size="small" />
        <Text style={t.loadText}>Loading events...</Text>
      </View>
    );
  }

  if (!events.length) {
    return (
      <View style={t.emptyWrap}>
        <Text style={t.emptyText}>No events found.</Text>
      </View>
    );
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={t.table}>
        {/* Header */}
        <View style={[t.row, t.headerRow]}>
          <Text style={[t.cell, t.hCell, { width: 220 }]}>EVENT</Text>
          <Text style={[t.cell, t.hCell, { width: 80  }]}>TYPE</Text>
          <Text style={[t.cell, t.hCell, { width: 100 }]}>DATE</Text>
          <Text style={[t.cell, t.hCell, { width: 140 }]}>HOST</Text>
          <Text style={[t.cell, t.hCell, { width: 80  }]}>STATUS</Text>
          <Text style={[t.cell, t.hCell, { width: 70  }]}>GUESTS</Text>
          <Text style={[t.cell, t.hCell, { width: 70  }]}>PHOTOS</Text>
          <Text style={[t.cell, t.hCell, { width: 90  }]}>REVENUE</Text>
          <Text style={[t.cell, t.hCell, { width: 140 }]}>ACTIONS</Text>
        </View>

        {/* Rows */}
        {events.map((ev, idx) => (
          <View
            key={ev.id}
            style={[t.row, idx % 2 === 1 && t.altRow]}
          >
            <TouchableOpacity style={[t.cell, { width: 220 }]} onPress={() => onView?.(ev)}>
              <Text style={t.titleCell} numberOfLines={2}>{ev.title}</Text>
            </TouchableOpacity>

            <View style={[t.cell, { width: 80 }]}>
              <View style={[t.badge, { borderColor: ev.type === 'public' ? GOLD : MUTED }]}>
                <Text style={[t.badgeText, { color: ev.type === 'public' ? GOLD : MUTED }]}>
                  {ev.type.toUpperCase()}
                </Text>
              </View>
            </View>

            <Text style={[t.cell, t.bodyCell, { width: 100 }]}>{fmtDate(ev.date)}</Text>
            <Text style={[t.cell, t.bodyCell, { width: 140 }]} numberOfLines={1}>{ev.host_name}</Text>

            <View style={[t.cell, { width: 80 }]}>
              <View style={[t.statusDot, { backgroundColor: statusColor(ev.status) }]} />
              <Text style={[t.bodyCell, { color: statusColor(ev.status) }]}>
                {ev.status.charAt(0).toUpperCase() + ev.status.slice(1)}
              </Text>
            </View>

            <Text style={[t.cell, t.bodyCell, t.numCell, { width: 70 }]}>{ev.guest_count}</Text>
            <Text style={[t.cell, t.bodyCell, t.numCell, { width: 70 }]}>{ev.photo_count}</Text>
            <Text style={[t.cell, t.bodyCell, t.numCell, { width: 90, color: GOLD }]}>
              {fmtINR(ev.revenue)}
            </Text>

            <View style={[t.cell, t.actionsCell, { width: 140 }]}>
              {ev.status === 'active' && onReveal && (
                <TouchableOpacity
                  style={[t.actionBtn, { borderColor: GOLD }]}
                  onPress={() => onReveal(ev.id)}
                >
                  <Text style={[t.actionBtnText, { color: GOLD }]}>Reveal</Text>
                </TouchableOpacity>
              )}
              {ev.status !== 'archived' && onArchive && (
                <TouchableOpacity
                  style={[t.actionBtn, { borderColor: '#888' }]}
                  onPress={() => onArchive(ev.id)}
                >
                  <Text style={[t.actionBtnText, { color: '#888' }]}>Archive</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}
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
  numCell:  { justifyContent: 'flex-end' },
  titleCell: { fontSize: 13, color: TXT, fontWeight: '600', lineHeight: 18 },

  badge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 9, letterSpacing: 0.8, fontWeight: '600' },

  statusDot: { width: 7, height: 7, borderRadius: 4, marginRight: 6 },

  actionsCell: { gap: 6 },
  actionBtn: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  actionBtnText: { fontSize: 11, letterSpacing: 0.5 },
});
