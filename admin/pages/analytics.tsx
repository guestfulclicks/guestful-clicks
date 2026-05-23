import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import AdminLayout from '../components/admin-layout';
import { REVENUE_SHARE } from '../../shared/constants';

const GOLD  = '#D4A853';
const SERIF = '"Playfair Display", serif';
const MONO  = '"DM Mono", monospace';
const CARD  = { backgroundColor: '#FFFFFF', border: '1px solid #E8E3DC', borderRadius: '12px', padding: '20px 24px' };

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlatformStats {
  totalEvents:     number;
  activeEvents:    number;
  totalUsers:      number;
  totalPhotos:     number;
  totalRevenue:    number;
  platformRevenue: number;
  pendingPayouts:  number;
}

interface MonthlyData {
  month:   string;
  revenue: number;
  events:  number;
  guests:  number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtINR(n: number) { return `₹${n.toLocaleString('en-IN')}`; }

function getMonthLabel(iso: string): string {
  if (!iso) return '';
  const dt = new Date(iso);
  return dt.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, sub, accent }: { icon: string; label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div style={{ ...CARD, flex: 1, minWidth: '160px' }}>
      <div style={{ fontSize: '22px', marginBottom: '10px' }}>{icon}</div>
      <div style={{ fontFamily: SERIF, fontSize: '24px', fontWeight: '700', color: accent ? GOLD : '#0C0904', lineHeight: 1, marginBottom: '6px' }}>{value}</div>
      <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>{label}</div>
      {sub && <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px' }}>{sub}</div>}
    </div>
  );
}

function BarChart({ data, valueKey, color, label }: { data: MonthlyData[]; valueKey: keyof MonthlyData; color: string; label: string }) {
  if (!data.length) return <div style={{ color: '#888', fontSize: '12px', textAlign: 'center' as const, padding: '20px 0' }}>No data</div>;
  const max = Math.max(...data.map(d => Number(d[valueKey])), 1);
  return (
    <div>
      <div style={{ fontSize: '12px', color: '#888', marginBottom: '12px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '120px' }}>
        {data.map(d => {
          const val = Number(d[valueKey]);
          const h   = Math.max((val / max) * 100, 2);
          return (
            <div key={d.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <div style={{ fontSize: '10px', color: '#888' }}>{valueKey === 'revenue' ? fmtINR(val) : val}</div>
              <div style={{ width: '100%', height: `${h}px`, backgroundColor: color, borderRadius: '4px 4px 0 0', minHeight: '4px', transition: 'height 0.3s' }} />
              <div style={{ fontSize: '9px', color: '#aaa', textAlign: 'center' as const }}>{d.month}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [stats, setStats]     = useState<PlatformStats | null>(null);
  const [monthly, setMonthly] = useState<MonthlyData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    const [
      { count: totalEvents },
      { count: activeEvents },
      { count: totalUsers },
      { count: totalPhotos },
      { data: revData },
      { data: pendingData },
      { data: eventsRaw },
    ] = await Promise.all([
      supabase.from('events').select('*', { count: 'exact', head: true }),
      supabase.from('events').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('photos').select('*', { count: 'exact', head: true }),
      supabase.from('participants').select('amount_paid'),
      supabase.from('payouts').select('amount').eq('status', 'pending'),
      supabase.from('events').select('id, created_at').order('created_at', { ascending: true }).limit(500),
    ]);

    const totalRevenue    = (revData ?? []).reduce((s: number, r: any) => s + (r.amount_paid ?? 0), 0);
    const platformRevenue = totalRevenue * (100 - REVENUE_SHARE.organiserPercent) / 100;
    const pendingPayouts  = (pendingData ?? []).reduce((s: number, r: any) => s + (r.amount ?? 0), 0);

    setStats({ totalEvents: totalEvents ?? 0, activeEvents: activeEvents ?? 0, totalUsers: totalUsers ?? 0, totalPhotos: totalPhotos ?? 0, totalRevenue, platformRevenue, pendingPayouts });

    // Build last 6 months of data
    if (eventsRaw?.length) {
      const map: Record<string, { revenue: number; events: number; guests: number }> = {};
      for (const ev of eventsRaw) {
        const m = getMonthLabel((ev as any).created_at);
        if (!map[m]) map[m] = { revenue: 0, events: 0, guests: 0 };
        map[m].events++;
      }
      setMonthly(
        Object.entries(map)
          .slice(-6)
          .map(([month, d]) => ({ month, ...d }))
      );
    }

    setLoading(false);
  };

  return (
    <AdminLayout pageTitle="Analytics">
      {loading ? (
        <div style={{ color: '#888', fontSize: '13px' }}>Loading analytics…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* KPI row 1 */}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' as const }}>
            <KpiCard icon="📅" label="Total Events"     value={String(stats!.totalEvents)} />
            <KpiCard icon="🟢" label="Active Events"    value={String(stats!.activeEvents)} />
            <KpiCard icon="👥" label="Total Users"      value={String(stats!.totalUsers)} />
            <KpiCard icon="📷" label="Photos Uploaded"  value={String(stats!.totalPhotos)} />
          </div>

          {/* KPI row 2 */}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' as const }}>
            <KpiCard icon="💰" label="Gross Revenue"    value={fmtINR(stats!.totalRevenue)}    accent />
            <KpiCard icon="🏦" label="Platform Revenue" value={fmtINR(stats!.platformRevenue)} sub="25% platform share" />
            <KpiCard icon="⏳" label="Pending Payouts"  value={fmtINR(stats!.pendingPayouts)} />
            <KpiCard icon="📈" label="Avg Revenue/Event" value={stats!.totalEvents ? fmtINR(Math.round(stats!.totalRevenue / stats!.totalEvents)) : '₹0'} />
          </div>

          {/* Charts row */}
          {monthly.length > 0 && (
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' as const }}>
              <div style={{ ...CARD, flex: 1, minWidth: '280px' }}>
                <h2 style={{ fontFamily: SERIF, fontSize: '18px', fontWeight: '700', color: '#0C0904', marginBottom: '20px' }}>Revenue Trend</h2>
                <BarChart data={monthly} valueKey="revenue" color={GOLD} label="Monthly Revenue" />
              </div>
              <div style={{ ...CARD, flex: 1, minWidth: '280px' }}>
                <h2 style={{ fontFamily: SERIF, fontSize: '18px', fontWeight: '700', color: '#0C0904', marginBottom: '20px' }}>Events Created</h2>
                <BarChart data={monthly} valueKey="events" color="#4A90E2" label="Events per Month" />
              </div>
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}
