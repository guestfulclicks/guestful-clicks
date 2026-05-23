import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import AdminLayout from '../components/admin-layout';

const GOLD         = '#D4A853';
const SERIF        = '"Playfair Display", serif';
const MONO         = '"DM Mono", monospace';
const PLATFORM_CUT = 0.75;

const CARD: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #E8E3DC',
  borderRadius: '12px',
  padding: '20px 24px',
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface DashStats {
  revenueToday:        number;
  revenueYesterday:    number;
  revenueThisMonth:    number;
  revenueLastMonth:    number;
  pendingAmount:       number;
  nextPayoutDate:      string | null;
  sparkline:           number[];
  activeEvents:        number;
  newUsersToday:       number;
  newHostsToday:       number;
  newOrganisersToday:  number;
  newGuestsToday:      number;
  photosToday:         number;
  flaggedKYC:          number;
}

type GeoLevel = 'country' | 'state' | 'city';

interface GeoCountry {
  code:            string;
  name:            string;
  flag:            string;
  currencySymbol:  string;
  totalEvents:     number;
  activeEvents:    number;
  totalGuests:     number;
  totalRevenue:    number;
  lastMonthRev:    number;
}

interface GeoState {
  name:        string;
  totalEvents: number;
  totalGuests: number;
  totalRev:    number;
  topCity:     string;
}

interface GeoCity {
  name:        string;
  totalEvents: number;
  totalGuests: number;
  totalRev:    number;
  topType:     string;
}

interface ActivityItem {
  key:         string;
  icon:        string;
  description: string;
  timeStr:     string;
  ts:          number;
  revenue?:    number;
  link:        string;
}

interface TopEventRow {
  id:           string;
  title:        string;
  type:         string;
  status:       string;
  participants: number;
  revenue:      number;
}

interface TopOrgRow {
  id:          string;
  fullName:    string;
  company:     string;
  events:      number;
  revenue:     number;
  earned:      number;
  kycApproved: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function flagEmoji(code: string): string {
  if (!code || code.length < 2) return '🌐';
  const BASE = 0x1F1E6 - 65;
  return (
    String.fromCodePoint(code.toUpperCase().charCodeAt(0) + BASE) +
    String.fromCodePoint(code.toUpperCase().charCodeAt(1) + BASE)
  );
}

function fmtINR(n: number, sym = '₹'): string {
  if (n >= 100_000) return `${sym}${(n / 100_000).toFixed(1)}L`;
  if (n >= 1_000)   return `${sym}${(n / 1_000).toFixed(1)}K`;
  return `${sym}${Math.round(n).toLocaleString('en-IN')}`;
}

function fmtFull(n: number, sym = '₹'): string {
  return `${sym}${Math.round(n).toLocaleString('en-IN')}`;
}

function timeAgo(iso: string): { str: string; ts: number } {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  let str = 'just now';
  if (diff > 86_400_000) str = `${Math.floor(diff / 86_400_000)}d ago`;
  else if (diff > 3_600_000) str = `${Math.floor(diff / 3_600_000)}h ago`;
  else if (diff > 60_000) str = `${Math.floor(diff / 60_000)}m ago`;
  return { str, ts: t };
}

function fmtDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function todayStart()    { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString(); }
function yesterdayStart(){ const d = new Date(); d.setDate(d.getDate()-1); d.setHours(0,0,0,0); return d.toISOString(); }
function monthStart()    { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d.toISOString(); }
function lastMonthRange(): [string, string] {
  const end   = new Date(); end.setDate(0); end.setHours(23,59,59,999);
  const start = new Date(end.getFullYear(), end.getMonth(), 1); start.setHours(0,0,0,0);
  return [start.toISOString(), end.toISOString()];
}

// Module-level country cache so it survives re-renders
const _cc: Record<string, { symbol: string; name: string }> = {};

async function fetchCountryInfo(code: string): Promise<{ symbol: string; name: string }> {
  if (_cc[code]) return _cc[code];
  try {
    const res  = await fetch(`https://restcountries.com/v3.1/alpha/${code}`);
    const [d]  = await res.json();
    const curr = Object.keys(d.currencies ?? {})[0] ?? '';
    _cc[code]  = { symbol: d.currencies?.[curr]?.symbol ?? '₹', name: d.name?.common ?? code };
  } catch { _cc[code] = { symbol: '₹', name: code }; }
  return _cc[code];
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '22px', marginTop: '10px' }}>
      {data.map((v, i) => (
        <div key={i} style={{
          flex: 1, minHeight: '2px',
          height: `${Math.max((v / max) * 100, 5)}%`,
          backgroundColor: i === data.length - 1 ? GOLD : 'rgba(212,168,83,0.28)',
          borderRadius: '2px 2px 0 0',
        }} />
      ))}
    </div>
  );
}

// ── Enhanced StatCard ─────────────────────────────────────────────────────────

interface SCProps {
  icon: string; label: string; value: string;
  sub?: string; badge?: string; badgeColor?: string;
  accent?: boolean; pulse?: boolean; flash?: boolean;
  sparkline?: number[]; children?: React.ReactNode;
}

function StatCard({ icon, label, value, sub, badge, badgeColor, accent, pulse, flash, sparkline, children }: SCProps) {
  return (
    <div style={{
      ...CARD, flex: 1, minWidth: '190px',
      boxShadow: flash ? `0 0 0 2px ${GOLD}, 0 4px 16px rgba(212,168,83,0.2)` : '0 1px 3px rgba(0,0,0,0.04)',
      transition: 'box-shadow 0.4s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
        <span style={{ fontSize: '20px' }}>{icon}</span>
        {badge && (
          <span style={{
            fontSize: '10px', fontWeight: '600', padding: '3px 8px', borderRadius: '20px', fontFamily: MONO,
            backgroundColor: badgeColor ? badgeColor + '18' : '#E6F9EE',
            color: badgeColor ?? '#1A7A40',
          }}>
            {badge}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
        <div style={{ fontFamily: SERIF, fontSize: '26px', fontWeight: '700', color: accent ? GOLD : '#0C0904', lineHeight: 1 }}>
          {value}
        </div>
        {pulse && (
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#4CAF50', animation: 'gfPulse 1.5s ease-in-out infinite', flexShrink: 0 }} />
        )}
      </div>

      <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.6px', fontFamily: MONO }}>
        {label}
      </div>

      {sub && <div style={{ fontSize: '11px', color: '#aaa', fontFamily: MONO, marginTop: '5px' }}>{sub}</div>}
      {sparkline && <Sparkline data={sparkline} />}
      {children}
    </div>
  );
}

// ── Geography Section ─────────────────────────────────────────────────────────

function GeographySection({ events, revenueMap }: { events: any[]; revenueMap: Record<string, number> }) {
  const [level, setLevel]                 = useState<GeoLevel>('country');
  const [selCountry, setSelCountry]       = useState('');
  const [selState, setSelState]           = useState('');
  const [countries, setCountries]         = useState<GeoCountry[]>([]);
  const [states, setStates]               = useState<GeoState[]>([]);
  const [cities, setCities]               = useState<GeoCity[]>([]);
  const infoRef = useRef<Record<string, { symbol: string; name: string }>>({});

  useEffect(() => { if (events.length) buildCountries(); }, [events, revenueMap]);

  const buildCountries = async () => {
    const map: Record<string, { evs: any[] }> = {};
    for (const ev of events) {
      const c = (ev.country ?? 'IN').toUpperCase();
      if (!map[c]) map[c] = { evs: [] };
      map[c].evs.push(ev);
    }
    const now = Date.now();
    const lmCutoff = new Date(); lmCutoff.setDate(1); lmCutoff.setMonth(lmCutoff.getMonth() - 1); lmCutoff.setHours(0,0,0,0);
    const lmCut = lmCutoff.toISOString();

    const result: GeoCountry[] = await Promise.all(
      Object.entries(map).map(async ([code, { evs }]) => {
        const info = await fetchCountryInfo(code);
        infoRef.current[code] = info;
        const thisMonthEvs = evs.filter(e => e.created_at >= lmCut);
        const lastMonthRev = evs.filter(e => e.created_at < lmCut).reduce((s: number, e: any) => s + (revenueMap[e.id] ?? 0), 0);
        return {
          code, flag: flagEmoji(code), name: info.name, currencySymbol: info.symbol,
          totalEvents:  evs.length,
          activeEvents: evs.filter(e => e.status === 'active').length,
          totalGuests:  evs.reduce((s: number, e: any) => s + (e.guest_count ?? 0), 0),
          totalRevenue: evs.reduce((s: number, e: any) => s + (revenueMap[e.id] ?? 0), 0),
          lastMonthRev,
        };
      })
    );
    setCountries(result.sort((a, b) => b.totalRevenue - a.totalRevenue));
  };

  const drillStates = (code: string) => {
    const evs = events.filter(e => (e.country ?? 'IN').toUpperCase() === code);
    const map: Record<string, any[]> = {};
    for (const e of evs) { const s = e.state ?? 'Unknown'; if (!map[s]) map[s] = []; map[s].push(e); }
    const result: GeoState[] = Object.entries(map).map(([name, evList]) => {
      const cityFreq: Record<string, number> = {};
      for (const e of evList) { const c = e.city ?? 'Unknown'; cityFreq[c] = (cityFreq[c] ?? 0) + 1; }
      const topCity = Object.entries(cityFreq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
      return { name, totalEvents: evList.length, totalGuests: evList.reduce((s: number, e: any) => s + (e.guest_count ?? 0), 0), totalRev: evList.reduce((s: number, e: any) => s + (revenueMap[e.id] ?? 0), 0), topCity };
    }).sort((a, b) => b.totalRev - a.totalRev);
    setStates(result); setSelCountry(code); setLevel('state');
  };

  const drillCities = (stateName: string) => {
    const evs = events.filter(e => (e.country ?? 'IN').toUpperCase() === selCountry && (e.state ?? 'Unknown') === stateName);
    const map: Record<string, any[]> = {};
    for (const e of evs) { const c = e.city ?? 'Unknown'; if (!map[c]) map[c] = []; map[c].push(e); }
    const result: GeoCity[] = Object.entries(map).map(([name, evList]) => {
      const typeFreq: Record<string, number> = {};
      for (const e of evList) { const t = e.type ?? 'private'; typeFreq[t] = (typeFreq[t] ?? 0) + 1; }
      const topType = Object.entries(typeFreq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
      return { name, totalEvents: evList.length, totalGuests: evList.reduce((s: number, e: any) => s + (e.guest_count ?? 0), 0), totalRev: evList.reduce((s: number, e: any) => s + (revenueMap[e.id] ?? 0), 0), topType };
    }).sort((a, b) => b.totalRev - a.totalRev);
    setCities(result); setSelState(stateName); setLevel('city');
  };

  const TH = ({ label }: { label: string }) => (
    <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: '11px', fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #E8E3DC', whiteSpace: 'nowrap', fontFamily: MONO }}>
      {label}
    </th>
  );
  const td: React.CSSProperties = { padding: '13px 12px', borderBottom: '1px solid #F5F3EF', fontSize: '12px', fontFamily: MONO };
  const hovProps = {
    onMouseEnter: (e: React.MouseEvent<HTMLTableRowElement>) => { (e.currentTarget as HTMLElement).style.backgroundColor = '#FAFAF8'; },
    onMouseLeave: (e: React.MouseEvent<HTMLTableRowElement>) => { (e.currentTarget as HTMLElement).style.backgroundColor = ''; },
  };

  const sym = infoRef.current[selCountry]?.symbol ?? '₹';

  return (
    <div style={CARD}>
      {/* Header + breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '8px' }}>
        <h2 style={{ fontFamily: SERIF, fontSize: '18px', fontWeight: '700', color: '#0C0904', margin: 0 }}>Events by Location</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontFamily: MONO }}>
          <button onClick={() => setLevel('country')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: MONO, fontSize: '12px', color: level === 'country' ? GOLD : '#888', padding: 0 }}>
            🌍 All Countries
          </button>
          {(level === 'state' || level === 'city') && (
            <> <span style={{ color: '#DDD' }}>›</span>
              <button onClick={() => setLevel('state')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: MONO, fontSize: '12px', color: level === 'state' ? GOLD : '#888', padding: 0 }}>
                {flagEmoji(selCountry)} {infoRef.current[selCountry]?.name ?? selCountry}
              </button>
            </>
          )}
          {level === 'city' && (
            <> <span style={{ color: '#DDD' }}>›</span>
              <span style={{ color: GOLD }}>🏙 {selState}</span>
            </>
          )}
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        {/* COUNTRIES */}
        {level === 'country' && (
          countries.length === 0
            ? <div style={{ textAlign: 'center', padding: '32px', color: '#888', fontSize: '12px', fontFamily: MONO }}>No location data. Add city/state/country columns to events table.</div>
            : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><TH label="Country" /><TH label="Currency" /><TH label="Events" /><TH label="Guests" /><TH label="Revenue" /><TH label="Active" /><TH label="Growth" /></tr></thead>
                <tbody>
                  {countries.map(c => {
                    const growth = c.lastMonthRev > 0 ? Math.round(((c.totalRevenue - c.lastMonthRev) / c.lastMonthRev) * 100) : 0;
                    const up = growth >= 0;
                    return (
                      <tr key={c.code} {...hovProps} onClick={() => drillStates(c.code)} style={{ cursor: 'pointer' }}>
                        <td style={{ ...td, fontWeight: '600', color: '#0C0904' }}>{c.flag} {c.name}</td>
                        <td style={{ ...td, color: '#888' }}>{c.currencySymbol}</td>
                        <td style={td}>{c.totalEvents}</td>
                        <td style={td}>{c.totalGuests.toLocaleString()}</td>
                        <td style={{ ...td, color: GOLD, fontWeight: '600' }}>{fmtINR(c.totalRevenue, c.currencySymbol)}</td>
                        <td style={td}><span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#4CAF50', display: 'inline-block' }} />{c.activeEvents}</span></td>
                        <td style={{ ...td, color: up ? '#1A7A40' : '#B71C1C', fontWeight: '600' }}>{up ? '↑' : '↓'}{Math.abs(growth)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
        )}

        {/* STATES */}
        {level === 'state' && (
          states.length === 0
            ? <div style={{ textAlign: 'center', padding: '32px', color: '#888', fontSize: '12px', fontFamily: MONO }}>No state data.</div>
            : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><TH label="State" /><TH label="Events" /><TH label="Guests" /><TH label="Revenue" /><TH label="Top City" /></tr></thead>
                <tbody>
                  {states.map(s => (
                    <tr key={s.name} {...hovProps} onClick={() => drillCities(s.name)} style={{ cursor: 'pointer' }}>
                      <td style={{ ...td, fontWeight: '600', color: '#0C0904' }}>{s.name}</td>
                      <td style={td}>{s.totalEvents}</td>
                      <td style={td}>{s.totalGuests.toLocaleString()}</td>
                      <td style={{ ...td, color: GOLD, fontWeight: '600' }}>{fmtINR(s.totalRev, sym)}</td>
                      <td style={{ ...td, color: '#888' }}>{s.topCity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
        )}

        {/* CITIES */}
        {level === 'city' && (
          cities.length === 0
            ? <div style={{ textAlign: 'center', padding: '32px', color: '#888', fontSize: '12px', fontFamily: MONO }}>No city data.</div>
            : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><TH label="City" /><TH label="Events" /><TH label="Guests" /><TH label="Revenue" /><TH label="Top Type" /></tr></thead>
                <tbody>
                  {cities.map(c => (
                    <tr key={c.name} {...hovProps}>
                      <td style={{ ...td, fontWeight: '600', color: '#0C0904' }}>{c.name}</td>
                      <td style={td}>{c.totalEvents}</td>
                      <td style={td}>{c.totalGuests.toLocaleString()}</td>
                      <td style={{ ...td, color: GOLD, fontWeight: '600' }}>{fmtINR(c.totalRev, sym)}</td>
                      <td style={td}><span style={{ fontSize: '11px', fontWeight: '600', padding: '2px 7px', borderRadius: '4px', backgroundColor: '#F5F3EF', color: '#666', textTransform: 'capitalize' }}>{c.topType}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
        )}
      </div>
    </div>
  );
}

// ── Activity Feed ─────────────────────────────────────────────────────────────

function ActivityFeed({ items }: { items: ActivityItem[] }) {
  const navigate = useNavigate();
  return (
    <div style={CARD}>
      <h2 style={{ fontFamily: SERIF, fontSize: '18px', fontWeight: '700', color: '#0C0904', marginBottom: '16px' }}>Recent Activity</h2>
      {items.length === 0
        ? <div style={{ textAlign: 'center', padding: '32px', color: '#888', fontSize: '12px', fontFamily: MONO }}>No recent activity.</div>
        : items.map((item, i) => (
            <div
              key={item.key + i}
              onClick={() => navigate(item.link)}
              style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '11px 0', borderBottom: i < items.length - 1 ? '1px solid #F5F3EF' : 'none', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#FAFAF8'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = ''}
            >
              <span style={{ fontSize: '17px', flexShrink: 0, marginTop: '1px' }}>{item.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '12px', color: '#0C0904', fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</div>
                <div style={{ fontSize: '11px', color: '#aaa', fontFamily: MONO, marginTop: '2px' }}>{item.timeStr}</div>
              </div>
              {item.revenue !== undefined && (
                <div style={{ fontSize: '12px', color: GOLD, fontWeight: '700', fontFamily: MONO, flexShrink: 0 }}>{fmtINR(item.revenue)}</div>
              )}
            </div>
          ))
      }
    </div>
  );
}

// ── Top Performers ────────────────────────────────────────────────────────────

function TopPerformers({ topEvents, topOrgs }: { topEvents: TopEventRow[]; topOrgs: TopOrgRow[] }) {
  const sPill = (s: string) => {
    const m: Record<string, [string, string]> = { active: ['#E6F9EE','#1A7A40'], revealed: ['#FFF7E0','#7A5200'], archived: ['#F0F0F0','#666'] };
    const [bg, c] = m[s] ?? ['#F0F0F0','#666'];
    return <span style={{ fontSize: '10px', fontWeight: '600', padding: '2px 6px', borderRadius: '4px', backgroundColor: bg, color: c, textTransform: 'capitalize' }}>{s}</span>;
  };
  const tPill = (t: string) => (
    <span style={{ fontSize: '10px', fontWeight: '600', padding: '2px 6px', borderRadius: '4px', backgroundColor: t === 'public' ? '#EEF4FF' : '#F5F3EF', color: t === 'public' ? '#4A90E2' : '#666', textTransform: 'capitalize' }}>{t}</span>
  );

  return (
    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
      <div style={{ ...CARD, flex: 1, minWidth: '280px' }}>
        <h2 style={{ fontFamily: SERIF, fontSize: '18px', fontWeight: '700', color: '#0C0904', marginBottom: '16px' }}>Top Events This Month</h2>
        {topEvents.length === 0
          ? <div style={{ textAlign: 'center', padding: '20px', color: '#888', fontSize: '12px', fontFamily: MONO }}>No events this month.</div>
          : topEvents.map((ev, i) => (
              <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 0', borderBottom: i < topEvents.length - 1 ? '1px solid #F5F3EF' : 'none' }}>
                <span style={{ fontSize: '12px', fontWeight: '700', color: '#CCC', width: '18px', flexShrink: 0, fontFamily: MONO }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#0C0904', fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '4px' }}>{ev.title}</div>
                  <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                    {tPill(ev.type)} {sPill(ev.status)}
                    <span style={{ fontSize: '10px', color: '#aaa', fontFamily: MONO }}>{ev.participants} guests</span>
                  </div>
                </div>
                <span style={{ fontSize: '13px', color: GOLD, fontWeight: '700', fontFamily: MONO, flexShrink: 0 }}>{fmtINR(ev.revenue)}</span>
              </div>
            ))
        }
      </div>

      <div style={{ ...CARD, flex: 1, minWidth: '280px' }}>
        <h2 style={{ fontFamily: SERIF, fontSize: '18px', fontWeight: '700', color: '#0C0904', marginBottom: '16px' }}>Top Organisers This Month</h2>
        {topOrgs.length === 0
          ? <div style={{ textAlign: 'center', padding: '20px', color: '#888', fontSize: '12px', fontFamily: MONO }}>No organiser data.</div>
          : topOrgs.map((org, i) => (
              <div key={org.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 0', borderBottom: i < topOrgs.length - 1 ? '1px solid #F5F3EF' : 'none' }}>
                <span style={{ fontSize: '12px', fontWeight: '700', color: '#CCC', width: '18px', flexShrink: 0, fontFamily: MONO }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '2px' }}>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#0C0904', fontFamily: MONO }}>{org.fullName}</span>
                    {org.kycApproved && <span title="KYC Verified" style={{ fontSize: '11px' }}>✅</span>}
                  </div>
                  <div style={{ fontSize: '11px', color: '#aaa', fontFamily: MONO }}>{org.company || `${org.events} events`}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '13px', color: GOLD, fontWeight: '700', fontFamily: MONO }}>{fmtINR(org.earned)}</div>
                  <div style={{ fontSize: '10px', color: '#aaa', fontFamily: MONO }}>earned</div>
                </div>
              </div>
            ))
        }
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [stats, setStats]         = useState<DashStats | null>(null);
  const [allEvents, setAllEvents] = useState<any[]>([]);
  const [revenueMap, setRevMap]   = useState<Record<string, number>>({});
  const [activity, setActivity]   = useState<ActivityItem[]>([]);
  const [topEvents, setTopEvents] = useState<TopEventRow[]>([]);
  const [topOrgs, setTopOrgs]     = useState<TopOrgRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [flash, setFlash]         = useState('');
  const channelRef                = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Stats ──────────────────────────────────────────────────────────────────

  const loadStats = useCallback(async () => {
    const today     = todayStart();
    const yesterday = yesterdayStart();
    const month     = monthStart();
    const [lmS, lmE] = lastMonthRange();
    const d8 = new Date(Date.now() - 8 * 86_400_000).toISOString();

    const [
      { data: todayRev },
      { data: yRev },
      { data: monthRev },
      { data: lmRev },
      { data: pendPay },
      { data: nextPay },
      { count: activeEv },
      { data: newUsers },
      { count: photosN },
      { count: flagKYC },
      { data: sparkRaw },
    ] = await Promise.all([
      supabase.from('participants').select('amount_paid').gte('joined_at', today),
      supabase.from('participants').select('amount_paid').gte('joined_at', yesterday).lt('joined_at', today),
      supabase.from('participants').select('amount_paid').gte('joined_at', month),
      supabase.from('participants').select('amount_paid').gte('joined_at', lmS).lte('joined_at', lmE),
      supabase.from('payouts').select('amount').eq('status', 'pending'),
      supabase.from('payouts').select('scheduled_date').eq('status', 'scheduled').order('scheduled_date', { ascending: true }).limit(1),
      supabase.from('events').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('users').select('role, created_at').gte('created_at', today),
      supabase.from('photos').select('*', { count: 'exact', head: true }).gte('uploaded_at', today),
      supabase.from('organiser_kyc').select('*', { count: 'exact', head: true }).eq('verification_status', 'flagged'),
      supabase.from('participants').select('amount_paid, joined_at').gte('joined_at', d8),
    ]);

    const sparkline = Array(7).fill(0);
    for (const p of sparkRaw ?? []) {
      const da = Math.floor((Date.now() - new Date((p as any).joined_at).getTime()) / 86_400_000);
      if (da >= 0 && da < 7) sparkline[6 - da] += (p as any).amount_paid ?? 0;
    }

    const sumAP = (arr: any[]) => (arr ?? []).reduce((s, r) => s + (r.amount_paid ?? r.amount ?? 0), 0);
    const nu = newUsers ?? [];

    setStats({
      revenueToday:       sumAP(todayRev ?? []),
      revenueYesterday:   sumAP(yRev ?? []),
      revenueThisMonth:   sumAP(monthRev ?? []),
      revenueLastMonth:   sumAP(lmRev ?? []),
      pendingAmount:      sumAP(pendPay ?? []),
      nextPayoutDate:     (nextPay?.[0] as any)?.scheduled_date ?? null,
      sparkline,
      activeEvents:       activeEv ?? 0,
      newUsersToday:      nu.length,
      newHostsToday:      nu.filter((u: any) => u.role === 'host').length,
      newOrganisersToday: nu.filter((u: any) => u.role === 'organiser').length,
      newGuestsToday:     nu.filter((u: any) => u.role === 'guest').length,
      photosToday:        photosN ?? 0,
      flaggedKYC:         flagKYC ?? 0,
    });
  }, []);

  // ── Geo data ───────────────────────────────────────────────────────────────

  const loadGeo = useCallback(async () => {
    const [{ data: evs }, { data: parts }] = await Promise.all([
      supabase.from('events').select('id, title, type, status, host_id, guest_count, created_at, country, state, city').order('created_at', { ascending: false }),
      supabase.from('participants').select('event_id, amount_paid'),
    ]);
    const rm: Record<string, number> = {};
    for (const p of parts ?? []) rm[(p as any).event_id] = (rm[(p as any).event_id] ?? 0) + ((p as any).amount_paid ?? 0);
    setAllEvents(evs ?? []);
    setRevMap(rm);
  }, []);

  // ── Activity ───────────────────────────────────────────────────────────────

  const loadActivity = useCallback(async () => {
    const N = 5;
    const [
      { data: evs }, { data: us }, { data: ps },
      { data: kyc }, { data: pos }, { data: revs },
    ] = await Promise.all([
      supabase.from('events').select('id, title, created_at').order('created_at', { ascending: false }).limit(N),
      supabase.from('users').select('id, full_name, role, created_at').order('created_at', { ascending: false }).limit(N),
      supabase.from('participants').select('id, name, amount_paid, joined_at').order('joined_at', { ascending: false }).limit(N),
      supabase.from('organiser_kyc').select('id, company_name, verification_status, score, updated_at').order('updated_at', { ascending: false }).limit(N),
      supabase.from('payouts').select('id, amount, updated_at').order('updated_at', { ascending: false }).limit(N),
      supabase.from('events').select('id, title, updated_at').eq('status', 'revealed').order('updated_at', { ascending: false }).limit(N),
    ]);

    const items: ActivityItem[] = [];
    const push = (key: string, icon: string, desc: string, isoTime: string, link: string, revenue?: number) => {
      const { str, ts } = timeAgo(isoTime);
      items.push({ key, icon, description: desc, timeStr: str, ts, link, revenue });
    };

    for (const e of evs ?? [])  push(e.id, '🎞', `New event created — "${(e as any).title}"`, (e as any).created_at, '/admin/events');
    for (const u of us  ?? [])  push((u as any).id, '👤', `${(u as any).full_name || 'Someone'} joined as ${(u as any).role}`, (u as any).created_at, '/admin/users');
    for (const p of ps  ?? [])  if ((p as any).amount_paid > 0) push((p as any).id, '💰', `₹${(p as any).amount_paid} received from ${(p as any).name || 'guest'}`, (p as any).joined_at, '/admin/payouts', (p as any).amount_paid);
    for (const k of kyc ?? []) {
      const approved = (k as any).verification_status === 'approved';
      const flagged  = (k as any).verification_status === 'flagged';
      if (approved) push((k as any).id + 'a', '✅', `${(k as any).company_name} KYC approved (score: ${(k as any).score ?? '—'})`, (k as any).updated_at, '/admin/kyc');
      if (flagged)  push((k as any).id + 'f', '⚠️', `${(k as any).company_name} KYC needs review (score: ${(k as any).score ?? '—'})`, (k as any).updated_at, '/admin/kyc');
    }
    for (const po of pos  ?? []) push((po as any).id, '💸', `${fmtINR((po as any).amount ?? 0)} payout processed`, (po as any).updated_at, '/admin/payouts', (po as any).amount);
    for (const rv of revs ?? []) push((rv as any).id + 'r', '📷', `Gallery revealed — "${(rv as any).title}"`, (rv as any).updated_at, '/admin/events');

    items.sort((a, b) => b.ts - a.ts);
    setActivity(items.slice(0, 20));
  }, []);

  // ── Top performers ─────────────────────────────────────────────────────────

  const loadTop = useCallback(async () => {
    const month = monthStart();

    // Top events
    const { data: mEvs } = await supabase.from('events').select('id, title, type, status, guest_count').gte('created_at', month);
    if (mEvs?.length) {
      const { data: mParts } = await supabase.from('participants').select('event_id, amount_paid').in('event_id', mEvs.map((e: any) => e.id));
      const rm: Record<string, number> = {};
      for (const p of mParts ?? []) rm[(p as any).event_id] = (rm[(p as any).event_id] ?? 0) + ((p as any).amount_paid ?? 0);
      setTopEvents(
        mEvs.map((e: any) => ({ id: e.id, title: e.title, type: e.type, status: e.status, participants: e.guest_count ?? 0, revenue: rm[e.id] ?? 0 }))
          .sort((a, b) => b.revenue - a.revenue).slice(0, 5)
      );
    }

    // Top organisers
    const { data: orgs } = await supabase.from('users').select('id, full_name').eq('role', 'organiser').limit(20);
    if (orgs?.length) {
      const ids = orgs.map((o: any) => o.id);
      const [{ data: orgEvs }, { data: kycRows }] = await Promise.all([
        supabase.from('events').select('id, host_id').in('host_id', ids).gte('created_at', month),
        supabase.from('organiser_kyc').select('organiser_id, company_name, verification_status').in('organiser_id', ids),
      ]);
      const kycMap: Record<string, { company: string; approved: boolean }> = {};
      for (const k of kycRows ?? []) kycMap[(k as any).organiser_id] = { company: (k as any).company_name ?? '', approved: (k as any).verification_status === 'approved' };

      const evsByOrg: Record<string, string[]> = {};
      for (const e of orgEvs ?? []) { if (!evsByOrg[(e as any).host_id]) evsByOrg[(e as any).host_id] = []; evsByOrg[(e as any).host_id].push((e as any).id); }

      const allEIds = (orgEvs ?? []).map((e: any) => e.id);
      const orgRevMap: Record<string, number> = {};
      if (allEIds.length) {
        const { data: orgParts } = await supabase.from('participants').select('event_id, amount_paid').in('event_id', allEIds);
        for (const p of orgParts ?? []) {
          const hostId = (orgEvs ?? []).find((e: any) => e.id === (p as any).event_id) as any;
          if (hostId) orgRevMap[hostId.host_id] = (orgRevMap[hostId.host_id] ?? 0) + ((p as any).amount_paid ?? 0);
        }
      }

      setTopOrgs(
        orgs.map((o: any) => ({
          id: o.id, fullName: o.full_name ?? '—',
          company: kycMap[o.id]?.company ?? '',
          events: (evsByOrg[o.id] ?? []).length,
          revenue: orgRevMap[o.id] ?? 0,
          earned: Math.round((orgRevMap[o.id] ?? 0) * 0.25),
          kycApproved: kycMap[o.id]?.approved ?? false,
        }))
          .sort((a, b) => b.revenue - a.revenue).slice(0, 5)
      );
    }
  }, []);

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  useEffect(() => {
    Promise.all([loadStats(), loadGeo(), loadActivity(), loadTop()]).then(() => setLoading(false));

    // Realtime
    channelRef.current = supabase
      .channel('gc-dashboard-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' }, () => {
        setStats(p => p ? { ...p, activeEvents: p.activeEvents + 1 } : p);
        setFlash('events'); setTimeout(() => setFlash(''), 1600);
        loadActivity();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'participants' }, (pl) => {
        const amt = (pl.new as any)?.amount_paid ?? 0;
        setStats(p => p ? { ...p, revenueToday: p.revenueToday + amt, revenueThisMonth: p.revenueThisMonth + amt } : p);
        if (amt > 0) { setFlash('revenue'); setTimeout(() => setFlash(''), 1600); }
        loadActivity();
      })
      .subscribe();

    const poll = setInterval(loadStats, 30_000);
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      clearInterval(poll);
    };
  }, []);

  const s = stats;
  const todayGrowth  = s && s.revenueYesterday > 0 ? Math.round(((s.revenueToday - s.revenueYesterday)   / s.revenueYesterday)   * 100) : 0;
  const monthGrowth  = s && s.revenueLastMonth  > 0 ? Math.round(((s.revenueThisMonth - s.revenueLastMonth) / s.revenueLastMonth) * 100) : 0;
  const kycAmber     = s ? s.flaggedKYC > 0 && s.flaggedKYC <= 5 : false;
  const kycRed       = s ? s.flaggedKYC > 5 : false;

  return (
    <>
      <style>{`@keyframes gfPulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
      <AdminLayout pageTitle="Dashboard">
        {loading ? (
          <div style={{ color: '#888', fontFamily: MONO, fontSize: '13px' }}>Loading dashboard…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Row 1 — Revenue */}
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <StatCard
                icon="💸" label="Total Revenue Today" accent flash={flash === 'revenue'}
                value={fmtFull(s!.revenueToday)}
                sub={`${todayGrowth >= 0 ? '↑' : '↓'}${Math.abs(todayGrowth)}% vs ${fmtFull(s!.revenueYesterday)} yesterday`}
                sparkline={s!.sparkline}
              />
              <StatCard
                icon="📆" label="Revenue This Month" accent flash={flash === 'revenue'}
                value={fmtINR(s!.revenueThisMonth)}
                badge={`${monthGrowth >= 0 ? '↑' : '↓'}${Math.abs(monthGrowth)}% vs last month`}
                badgeColor={monthGrowth >= 0 ? '#1A7A40' : '#B71C1C'}
              />
              <StatCard
                icon="⏳" label="Pending Payouts"
                value={fmtINR(s!.pendingAmount)}
                sub={s!.nextPayoutDate ? `Next payout: ${fmtDate(s!.nextPayoutDate)}` : 'No scheduled payouts'}
                badge={s!.pendingAmount > 50_000 ? 'Overdue' : undefined}
                badgeColor="#E65100"
              />
              <StatCard
                icon="🏦" label="Platform Revenue (75%)" accent
                value={fmtINR(s!.revenueThisMonth * PLATFORM_CUT)}
                sub="After 25% organiser share"
              />
            </div>

            {/* Row 2 — Activity */}
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <StatCard icon="📅" label="Active Events Right Now" pulse flash={flash === 'events'} value={String(s!.activeEvents)} />
              <StatCard
                icon="👥" label="New Users Today"
                value={String(s!.newUsersToday)}
                sub={`Hosts: ${s!.newHostsToday} · Organisers: ${s!.newOrganisersToday} · Guests: ${s!.newGuestsToday}`}
              />
              <StatCard icon="📷" label="Photos Uploaded Today" value={String(s!.photosToday)} />
              <StatCard
                icon="🚩" label="Flagged KYC"
                value={String(s!.flaggedKYC)}
                accent={s!.flaggedKYC > 0}
                badge={s!.flaggedKYC > 0 ? 'Needs review' : undefined}
                badgeColor={kycRed ? '#B71C1C' : kycAmber ? '#7A5200' : undefined}
              />
            </div>

            {/* Geography */}
            <GeographySection events={allEvents} revenueMap={revenueMap} />

            {/* Activity feed */}
            <ActivityFeed items={activity} />

            {/* Top performers */}
            <TopPerformers topEvents={topEvents} topOrgs={topOrgs} />
          </div>
        )}
      </AdminLayout>
    </>
  );
}
