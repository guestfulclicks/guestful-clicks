import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import AdminLayout from '../components/admin-layout';

const GOLD    = '#D4A853';
const CARD_S  = { backgroundColor: '#FFFFFF', border: '1px solid #E8E3DC', borderRadius: '12px', padding: '20px 24px' };
const MONO    = '"DM Mono", monospace';
const SERIF   = '"Playfair Display", serif';
const MUTED   = '#888';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Stats {
  revenueToday:      number;
  activeEvents:      number;
  newUsersToday:     number;
  pendingPayouts:    number;
  photosToday:       number;
  eventsThisWeek:    number;
  flaggedKYC:        number;
  totalOrganisers:   number;
}

interface RecentEvent {
  id:         string;
  title:      string;
  host_name:  string;
  date:       string;
  status:     string;
  created_at: string;
}

interface GeoRow {
  country:      string;
  events:       number;
  revenue:      number;
  participants: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtINR(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`;
}

function todayStart(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function weekStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function fmtDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, accent }: {
  icon: string; label: string; value: string; sub?: string; accent?: boolean;
}) {
  return (
    <div style={{ ...CARD_S, flex: 1, minWidth: '180px' }}>
      <div style={{ fontSize: '22px', marginBottom: '10px' }}>{icon}</div>
      <div style={{ fontFamily: SERIF, fontSize: '26px', fontWeight: '700', color: accent ? GOLD : '#0C0904', lineHeight: 1, marginBottom: '6px' }}>
        {value}
      </div>
      <div style={{ fontSize: '11px', color: MUTED, letterSpacing: '0.5px', textTransform: 'uppercase' as const }}>{label}</div>
      {sub && <div style={{ fontSize: '11px', color: MUTED, marginTop: '4px' }}>{sub}</div>}
    </div>
  );
}

function statusPill(status: string) {
  const map: Record<string, { bg: string; color: string }> = {
    active:   { bg: '#E6F9EE', color: '#1A7A40' },
    revealed: { bg: '#FFF3CD', color: '#856404' },
    archived: { bg: '#F0F0F0', color: '#666' },
  };
  const s = map[status] ?? { bg: '#F0F0F0', color: '#666' };
  return (
    <span style={{ ...s, fontSize: '11px', fontWeight: '600', padding: '3px 8px', borderRadius: '4px', textTransform: 'capitalize' as const }}>
      {status}
    </span>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [stats, setStats]           = useState<Stats | null>(null);
  const [recentEvents, setRecent]   = useState<RecentEvent[]>([]);
  const [geoData, setGeoData]       = useState<GeoRow[]>([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    const today = todayStart();
    const week  = weekStart();

    const [
      { data: revData },
      { count: activeEventsCount },
      { count: newUsersCount },
      { count: pendingPayoutsCount },
      { count: photosTodayCount },
      { count: eventsWeekCount },
      { count: flaggedKYCCount },
      { count: organisersCount },
      { data: recentEventsData },
    ] = await Promise.all([
      supabase.from('payouts').select('amount').gte('created_at', today),
      supabase.from('events').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('users').select('*', { count: 'exact', head: true }).gte('created_at', today),
      supabase.from('payouts').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('photos').select('*', { count: 'exact', head: true }).gte('uploaded_at', today),
      supabase.from('events').select('*', { count: 'exact', head: true }).gte('created_at', week),
      supabase.from('organiser_kyc').select('*', { count: 'exact', head: true }).eq('verification_status', 'flagged'),
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'organiser'),
      supabase.from('events').select('id, title, host_id, date, status, created_at').order('created_at', { ascending: false }).limit(10),
    ]);

    const revenueToday = (revData ?? []).reduce((s: number, r: any) => s + (r.amount ?? 0), 0);

    setStats({
      revenueToday,
      activeEvents:    activeEventsCount  ?? 0,
      newUsersToday:   newUsersCount      ?? 0,
      pendingPayouts:  pendingPayoutsCount ?? 0,
      photosToday:     photosTodayCount   ?? 0,
      eventsThisWeek:  eventsWeekCount    ?? 0,
      flaggedKYC:      flaggedKYCCount    ?? 0,
      totalOrganisers: organisersCount    ?? 0,
    });

    // Enrich recent events with host names
    if (recentEventsData?.length) {
      const enriched: RecentEvent[] = await Promise.all(
        recentEventsData.map(async (ev: any) => {
          const { data: host } = await supabase
            .from('users').select('full_name').eq('id', ev.host_id).single();
          return {
            id:        ev.id,
            title:     ev.title,
            host_name: (host as any)?.full_name ?? '—',
            date:      ev.date,
            status:    ev.status,
            created_at: ev.created_at,
          };
        })
      );
      setRecent(enriched);
    }

    // Geography — group events by country (India as default when no country column)
    const { data: evGeo } = await supabase.from('events').select('id, country').limit(1000);
    if (evGeo?.length) {
      const map: Record<string, { events: number }> = {};
      for (const ev of evGeo) {
        const c = (ev as any).country ?? 'India';
        if (!map[c]) map[c] = { events: 0 };
        map[c].events++;
      }
      setGeoData(
        Object.entries(map).map(([country, d]) => ({
          country,
          events:       d.events,
          revenue:      0,
          participants: 0,
        }))
      );
    } else {
      setGeoData([{ country: 'India', events: 0, revenue: 0, participants: 0 }]);
    }

    setLoading(false);
  };

  return (
    <AdminLayout pageTitle="Dashboard">
      {loading ? (
        <div style={{ color: MUTED, fontFamily: MONO, fontSize: '13px' }}>Loading dashboard...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Row 1 */}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' as const }}>
            <StatCard icon="💸" label="Total Revenue Today"  value={fmtINR(stats!.revenueToday)}   accent />
            <StatCard icon="📅" label="Active Events Now"    value={String(stats!.activeEvents)} />
            <StatCard icon="👥" label="New Users Today"      value={String(stats!.newUsersToday)} />
            <StatCard icon="⏳" label="Pending Payouts"      value={String(stats!.pendingPayouts)} />
          </div>

          {/* Row 2 */}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' as const }}>
            <StatCard icon="📷" label="Photos Uploaded Today"      value={String(stats!.photosToday)} />
            <StatCard icon="🗓️" label="Events Created This Week"  value={String(stats!.eventsThisWeek)} />
            <StatCard icon="🚩" label="Flagged KYC"               value={String(stats!.flaggedKYC)} />
            <StatCard icon="🏢" label="Total Organisers"           value={String(stats!.totalOrganisers)} />
          </div>

          {/* Row 3 — Geography + Activity */}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' as const }}>

            {/* Events by Location */}
            <div style={{ ...CARD_S, flex: 1, minWidth: '300px' }}>
              <h2 style={{ fontFamily: SERIF, fontSize: '18px', fontWeight: '700', color: '#0C0904', marginBottom: '16px' }}>
                Events by Location
              </h2>
              <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #E8E3DC' }}>
                    {['Country', 'Events', 'Revenue', 'Participants'].map(h => (
                      <th key={h} style={{ textAlign: 'left' as const, padding: '8px 0', color: MUTED, fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase' as const }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {geoData.length ? geoData.map(row => (
                    <tr key={row.country} style={{ borderBottom: '1px solid #F5F3EF' }}>
                      <td style={{ padding: '10px 0', color: '#0C0904', fontWeight: '500' }}>{row.country}</td>
                      <td style={{ padding: '10px 0', color: '#333' }}>{row.events}</td>
                      <td style={{ padding: '10px 0', color: '#333' }}>{fmtINR(row.revenue)}</td>
                      <td style={{ padding: '10px 0', color: '#333' }}>{row.participants}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={4} style={{ padding: '20px 0', color: MUTED, textAlign: 'center' as const }}>No data</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Recent Activity */}
            <div style={{ ...CARD_S, flex: 2, minWidth: '360px' }}>
              <h2 style={{ fontFamily: SERIF, fontSize: '18px', fontWeight: '700', color: '#0C0904', marginBottom: '16px' }}>
                Recent Events
              </h2>
              {recentEvents.length === 0 ? (
                <div style={{ color: MUTED, fontSize: '13px', textAlign: 'center' as const, padding: '24px 0' }}>No events yet.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: '12px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #E8E3DC' }}>
                      {['Event', 'Host', 'Date', 'Status'].map(h => (
                        <th key={h} style={{ textAlign: 'left' as const, padding: '8px 0', color: MUTED, fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase' as const }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recentEvents.map(ev => (
                      <tr key={ev.id} style={{ borderBottom: '1px solid #F5F3EF' }}>
                        <td style={{ padding: '10px 0', color: '#0C0904', fontWeight: '500', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                          {ev.title}
                        </td>
                        <td style={{ padding: '10px 0', color: '#555' }}>{ev.host_name}</td>
                        <td style={{ padding: '10px 0', color: '#555' }}>{fmtDate(ev.date)}</td>
                        <td style={{ padding: '10px 0' }}>{statusPill(ev.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
