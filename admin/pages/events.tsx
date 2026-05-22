import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../../supabase/client';
import { EventTable, EventTableRow } from '../components/event-table';

// ── Constants ─────────────────────────────────────────────────────────────────

const BG     = '#0F0E0C';
const CARD   = '#1A1714';
const TXT    = '#F0E8D5';
const MUTED  = 'rgba(240,232,213,0.5)';
const BORDER = 'rgba(240,232,213,0.1)';
const GOLD   = '#D4A853';
const GREEN  = '#4CAF50';
const H_PAD  = 24;

// ── Types ─────────────────────────────────────────────────────────────────────

type FilterStatus = 'all' | 'active' | 'revealed' | 'archived';
type FilterType   = 'all' | 'private' | 'public';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtINR(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminEventsPage() {
  const [events, setEvents]       = useState<EventTableRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [typeFilter, setTypeFilter]     = useState<FilterType>('all');

  // Summary stats
  const [totalEvents,  setTotalEvents]  = useState(0);
  const [activeEvents, setActiveEvents] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);

  // ── Data load ────────────────────────────────────────────────────────────

  const loadEvents = useCallback(async () => {
    setLoading(true);

    // Fetch events with host info
    const { data: evs } = await supabase
      .from('events')
      .select('id, title, type, status, date, host_id, guest_count')
      .order('date', { ascending: false });

    if (!evs?.length) { setEvents([]); setLoading(false); return; }

    // Resolve host names and stats per event
    const rows: EventTableRow[] = await Promise.all(
      evs.map(async ev => {
        const [{ data: host }, { count: gc }, { count: pc }, { data: paid }] = await Promise.all([
          supabase.from('users').select('full_name').eq('id', ev.host_id).single(),
          supabase.from('participants').select('*', { count: 'exact', head: true }).eq('event_id', ev.id),
          supabase.from('photos').select('*', { count: 'exact', head: true }).eq('event_id', ev.id),
          supabase.from('participants').select('amount_paid').eq('event_id', ev.id),
        ]);
        const revenue = (paid ?? []).reduce((s: number, r: any) => s + (r.amount_paid ?? 0), 0);
        return {
          id:          ev.id,
          title:       ev.title,
          type:        ev.type,
          status:      ev.status,
          date:        ev.date,
          host_name:   (host as any)?.full_name ?? 'Unknown',
          guest_count: gc ?? 0,
          photo_count: pc ?? 0,
          revenue,
        };
      })
    );

    setEvents(rows);
    setTotalEvents(rows.length);
    setActiveEvents(rows.filter(r => r.status === 'active').length);
    setTotalRevenue(rows.reduce((s, r) => s + r.revenue, 0));
    setLoading(false);
  }, []);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleReveal = (id: string) => {
    Alert.alert('Reveal event?', 'This will make all photos visible to participants.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reveal',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('events').update({ status: 'revealed' }).eq('id', id);
          await supabase.from('photos').update({ is_revealed: true }).eq('event_id', id);
          setEvents(prev => prev.map(e => e.id === id ? { ...e, status: 'revealed' as const } : e));
          setActiveEvents(n => Math.max(0, n - 1));
        },
      },
    ]);
  };

  const handleArchive = (id: string) => {
    Alert.alert('Archive event?', 'This event will be marked as archived.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        onPress: async () => {
          await supabase.from('events').update({ status: 'archived' }).eq('id', id);
          setEvents(prev => prev.map(e => e.id === id ? { ...e, status: 'archived' as const } : e));
        },
      },
    ]);
  };

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filtered = events.filter(ev => {
    const matchStatus = statusFilter === 'all' || ev.status === statusFilter;
    const matchType   = typeFilter   === 'all' || ev.type   === typeFilter;
    const matchSearch = !search || ev.title.toLowerCase().includes(search.toLowerCase()) ||
                        ev.host_name.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchType && matchSearch;
  });

  // ── Render ────────────────────────────────────────────────────────────────

  const STATUS_TABS: FilterStatus[] = ['all', 'active', 'revealed', 'archived'];
  const TYPE_TABS:   FilterType[]   = ['all', 'private', 'public'];

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      {/* Page header */}
      <View style={[s.pageHeader, { borderBottomColor: BORDER }]}>
        <View>
          <Text style={s.pageTitle}>Events</Text>
          <Text style={s.pageSubtitle}>All events across the platform</Text>
        </View>
        <TouchableOpacity style={s.refreshBtn} onPress={loadEvents}>
          <Text style={s.refreshBtnText}>↻ Refresh</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>

        {/* Summary cards */}
        <View style={s.statsRow}>
          <View style={[s.statCard, { borderColor: BORDER }]}>
            <Text style={s.statLabel}>Total Events</Text>
            <Text style={s.statValue}>{totalEvents}</Text>
          </View>
          <View style={[s.statCard, { borderColor: BORDER }]}>
            <Text style={s.statLabel}>Active</Text>
            <Text style={[s.statValue, { color: GREEN }]}>{activeEvents}</Text>
          </View>
          <View style={[s.statCard, { borderColor: BORDER }]}>
            <Text style={s.statLabel}>Total Revenue</Text>
            <Text style={[s.statValue, { color: GOLD }]}>{fmtINR(totalRevenue)}</Text>
          </View>
        </View>

        {/* Filters */}
        <View style={[s.filtersWrap, { borderBottomColor: BORDER }]}>
          {/* Search */}
          <View style={[s.searchWrap, { borderColor: BORDER }]}>
            <Text style={s.searchIcon}>🔍</Text>
            <TextInput
              style={s.searchInput}
              placeholder="Search by title or host..."
              placeholderTextColor={MUTED}
              value={search}
              onChangeText={setSearch}
            />
          </View>

          {/* Status filter */}
          <View style={s.filterTabs}>
            {STATUS_TABS.map(tab => (
              <TouchableOpacity
                key={tab}
                style={[s.filterTab, statusFilter === tab && s.filterTabActive]}
                onPress={() => setStatusFilter(tab)}
              >
                <Text style={[s.filterTabText, statusFilter === tab && s.filterTabTextActive]}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Type filter */}
          <View style={s.filterTabs}>
            {TYPE_TABS.map(tab => (
              <TouchableOpacity
                key={tab}
                style={[s.filterTab, typeFilter === tab && s.filterTabActive]}
                onPress={() => setTypeFilter(tab)}
              >
                <Text style={[s.filterTabText, typeFilter === tab && s.filterTabTextActive]}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Results count */}
        <View style={s.resultsRow}>
          <Text style={s.resultsText}>{filtered.length} event{filtered.length !== 1 ? 's' : ''}</Text>
        </View>

        {/* Table */}
        <View style={[s.tableWrap, { borderColor: BORDER }]}>
          <EventTable
            events={filtered}
            loading={loading}
            onReveal={handleReveal}
            onArchive={handleArchive}
          />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
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

  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: H_PAD,
    paddingVertical: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    backgroundColor: CARD,
    gap: 6,
  },
  statLabel: { fontSize: 11, color: MUTED, letterSpacing: 0.5, textTransform: 'uppercase' },
  statValue: { fontSize: 24, color: TXT, fontWeight: '700' },

  filtersWrap: {
    paddingHorizontal: H_PAD,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    backgroundColor: CARD,
    gap: 8,
  },
  searchIcon:  { fontSize: 14 },
  searchInput: { flex: 1, color: TXT, fontSize: 14, height: 40 },

  filterTabs:        { flexDirection: 'row', gap: 8 },
  filterTab:         { borderWidth: 1, borderColor: BORDER, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  filterTabActive:   { borderColor: GOLD, backgroundColor: 'rgba(212,168,83,0.12)' },
  filterTabText:     { fontSize: 12, color: MUTED },
  filterTabTextActive: { color: GOLD },

  resultsRow: { paddingHorizontal: H_PAD, paddingVertical: 10 },
  resultsText: { fontSize: 12, color: MUTED },

  tableWrap: {
    marginHorizontal: H_PAD,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: CARD,
  },
});
