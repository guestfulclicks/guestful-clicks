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

type UserRole = 'host' | 'organiser' | 'guest' | 'admin';

interface UserRow {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  created_at: string;
  event_count: number;
}

type FilterRole = UserRole | 'all';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  if (!iso) return '—';
  const dt = new Date(iso);
  const M  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${dt.getDate()} ${M[dt.getMonth()]} ${dt.getFullYear()}`;
}

function roleColor(role: UserRole): string {
  switch (role) {
    case 'admin':     return '#FF6B6B';
    case 'organiser': return GOLD;
    case 'host':      return GREEN;
    case 'guest':     return MUTED;
  }
}

const AVATAR_COLORS = ['#C47C2A', '#6B4E3D', '#3D5A73', '#4A5E3D', '#6B3D5E'];
function avatarColor(name: string): string {
  return AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length];
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const [users, setUsers]           = useState<UserRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [roleFilter, setRoleFilter] = useState<FilterRole>('all');

  // Summary
  const [totalHosts,      setTotalHosts]      = useState(0);
  const [totalOrganisers, setTotalOrganisers] = useState(0);
  const [totalGuests,     setTotalGuests]     = useState(0);

  // ── Data load ────────────────────────────────────────────────────────────

  const loadUsers = useCallback(async () => {
    setLoading(true);

    const { data: us } = await supabase
      .from('users')
      .select('id, full_name, email, role, created_at')
      .order('created_at', { ascending: false });

    if (!us?.length) { setUsers([]); setLoading(false); return; }

    const rows: UserRow[] = await Promise.all(
      us.map(async u => {
        const { count: ec } = await supabase
          .from('events')
          .select('*', { count: 'exact', head: true })
          .eq('host_id', u.id);
        return {
          id:          u.id,
          full_name:   u.full_name ?? 'Unknown',
          email:       u.email ?? '',
          role:        (u.role ?? 'guest') as UserRole,
          created_at:  u.created_at ?? '',
          event_count: ec ?? 0,
        };
      })
    );

    setUsers(rows);
    setTotalHosts(rows.filter(r => r.role === 'host').length);
    setTotalOrganisers(rows.filter(r => r.role === 'organiser').length);
    setTotalGuests(rows.filter(r => r.role === 'guest').length);
    setLoading(false);
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  // ── Role change ───────────────────────────────────────────────────────────

  const handleRoleChange = (user: UserRow, newRole: UserRole) => {
    if (newRole === user.role) return;
    Alert.alert(
      'Change role?',
      `Set ${user.full_name} as ${newRole}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            await supabase.from('users').update({ role: newRole }).eq('id', user.id);
            setUsers(prev => prev.map(u => u.id === user.id ? { ...u, role: newRole } : u));
          },
        },
      ]
    );
  };

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filtered = users.filter(u => {
    const matchRole   = roleFilter === 'all' || u.role === roleFilter;
    const matchSearch = !search ||
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    return matchRole && matchSearch;
  });

  // ── Render ────────────────────────────────────────────────────────────────

  const ROLE_TABS: FilterRole[] = ['all', 'host', 'organiser', 'guest', 'admin'];
  const ROLE_OPTIONS: UserRole[] = ['host', 'organiser', 'guest', 'admin'];

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      {/* Page header */}
      <View style={[s.pageHeader, { borderBottomColor: BORDER }]}>
        <View>
          <Text style={s.pageTitle}>Users</Text>
          <Text style={s.pageSubtitle}>{users.length} registered users</Text>
        </View>
        <TouchableOpacity style={s.refreshBtn} onPress={loadUsers}>
          <Text style={s.refreshBtnText}>↻ Refresh</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>

        {/* Summary cards */}
        <View style={s.statsRow}>
          <View style={[s.statCard, { borderColor: BORDER }]}>
            <Text style={s.statLabel}>Hosts</Text>
            <Text style={[s.statValue, { color: GREEN }]}>{totalHosts}</Text>
          </View>
          <View style={[s.statCard, { borderColor: BORDER }]}>
            <Text style={s.statLabel}>Organisers</Text>
            <Text style={[s.statValue, { color: GOLD }]}>{totalOrganisers}</Text>
          </View>
          <View style={[s.statCard, { borderColor: BORDER }]}>
            <Text style={s.statLabel}>Guests</Text>
            <Text style={[s.statValue, { color: TXT }]}>{totalGuests}</Text>
          </View>
        </View>

        {/* Filters */}
        <View style={[s.filtersWrap, { borderBottomColor: BORDER }]}>
          <View style={[s.searchWrap, { borderColor: BORDER }]}>
            <Text style={s.searchIcon}>🔍</Text>
            <TextInput
              style={s.searchInput}
              placeholder="Search by name or email..."
              placeholderTextColor={MUTED}
              value={search}
              onChangeText={setSearch}
            />
          </View>

          <View style={s.filterTabs}>
            {ROLE_TABS.map(tab => (
              <TouchableOpacity
                key={tab}
                style={[
                  s.filterTab,
                  roleFilter === tab && s.filterTabActive,
                  roleFilter === tab && tab !== 'all' && { borderColor: roleColor(tab as UserRole) },
                ]}
                onPress={() => setRoleFilter(tab)}
              >
                <Text style={[
                  s.filterTabText,
                  roleFilter === tab && { color: tab === 'all' ? GOLD : roleColor(tab as UserRole) },
                ]}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Results */}
        <View style={s.resultsRow}>
          <Text style={s.resultsText}>{filtered.length} user{filtered.length !== 1 ? 's' : ''}</Text>
        </View>

        {/* User rows */}
        <View style={[s.tableWrap, { borderColor: BORDER }]}>
          {loading ? (
            <View style={s.loadRow}>
              <Text style={s.loadText}>Loading users...</Text>
            </View>
          ) : filtered.length === 0 ? (
            <View style={s.loadRow}>
              <Text style={s.loadText}>No users found.</Text>
            </View>
          ) : (
            <>
              {/* Table header */}
              <View style={[s.tRow, s.tHeaderRow]}>
                <Text style={[s.tCell, s.tHCell, { flex: 2 }]}>USER</Text>
                <Text style={[s.tCell, s.tHCell, { flex: 1.5 }]}>EMAIL</Text>
                <Text style={[s.tCell, s.tHCell, { width: 90 }]}>ROLE</Text>
                <Text style={[s.tCell, s.tHCell, { width: 80 }]}>EVENTS</Text>
                <Text style={[s.tCell, s.tHCell, { width: 110 }]}>JOINED</Text>
                <Text style={[s.tCell, s.tHCell, { width: 180 }]}>CHANGE ROLE</Text>
              </View>

              {filtered.map((u, idx) => (
                <View key={u.id} style={[s.tRow, idx % 2 === 1 && s.tAltRow]}>
                  {/* Avatar + name */}
                  <View style={[s.tCell, { flex: 2, gap: 10 }]}>
                    <View style={[s.avatar, { backgroundColor: avatarColor(u.full_name) }]}>
                      <Text style={s.avatarText}>{u.full_name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <Text style={s.tBodyCell} numberOfLines={1}>{u.full_name}</Text>
                  </View>

                  <Text style={[s.tCell, s.tBodyCell, { flex: 1.5 }]} numberOfLines={1}>
                    {u.email}
                  </Text>

                  {/* Role badge */}
                  <View style={[s.tCell, { width: 90 }]}>
                    <View style={[s.roleBadge, { borderColor: roleColor(u.role) }]}>
                      <Text style={[s.roleBadgeText, { color: roleColor(u.role) }]}>
                        {u.role.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  <Text style={[s.tCell, s.tBodyCell, { width: 80, textAlign: 'center' }]}>
                    {u.event_count}
                  </Text>
                  <Text style={[s.tCell, s.tBodyCell, { width: 110 }]}>{fmtDate(u.created_at)}</Text>

                  {/* Role change buttons */}
                  <View style={[s.tCell, { width: 180, gap: 4, flexWrap: 'wrap' }]}>
                    {ROLE_OPTIONS.filter(r => r !== u.role).map(r => (
                      <TouchableOpacity
                        key={r}
                        style={[s.roleBtn, { borderColor: roleColor(r) }]}
                        onPress={() => handleRoleChange(u, r)}
                      >
                        <Text style={[s.roleBtnText, { color: roleColor(r) }]}>
                          {r}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}
            </>
          )}
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

  statsRow: { flexDirection: 'row', paddingHorizontal: H_PAD, paddingVertical: 16, gap: 12 },
  statCard: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 16, backgroundColor: CARD, gap: 6 },
  statLabel: { fontSize: 11, color: MUTED, letterSpacing: 0.5, textTransform: 'uppercase' },
  statValue: { fontSize: 24, color: TXT, fontWeight: '700' },

  filtersWrap: { paddingHorizontal: H_PAD, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 12, height: 40,
    backgroundColor: CARD, gap: 8,
  },
  searchIcon:  { fontSize: 14 },
  searchInput: { flex: 1, color: TXT, fontSize: 14, height: 40 },

  filterTabs: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  filterTab:  { borderWidth: 1, borderColor: BORDER, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  filterTabActive:   { borderColor: GOLD, backgroundColor: 'rgba(212,168,83,0.1)' },
  filterTabText:     { fontSize: 12, color: MUTED },

  resultsRow:  { paddingHorizontal: H_PAD, paddingVertical: 10 },
  resultsText: { fontSize: 12, color: MUTED },

  tableWrap: { marginHorizontal: H_PAD, borderWidth: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: CARD },

  loadRow:  { padding: 24, alignItems: 'center' },
  loadText: { color: MUTED, fontSize: 14 },

  // Table rows
  tRow: {
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER,
    minHeight: 56,
  },
  tHeaderRow: { backgroundColor: '#141210', minHeight: 40 },
  tAltRow:    { backgroundColor: 'rgba(255,255,255,0.015)' },
  tCell:      { paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center' },
  tHCell:     { fontSize: 10, letterSpacing: 1.5, color: MUTED, fontWeight: '600' },
  tBodyCell:  { fontSize: 13, color: TXT },

  avatar:     { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 14, color: '#fff', fontWeight: '700' },

  roleBadge:     { borderWidth: 1, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  roleBadgeText: { fontSize: 9, letterSpacing: 0.8, fontWeight: '600' },

  roleBtn:     { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  roleBtnText: { fontSize: 10, letterSpacing: 0.4 },
});
