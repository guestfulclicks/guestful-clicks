// Requires this table in Supabase:
//
// create table public.notification_log (
//   id uuid default gen_random_uuid() primary key,
//   title text not null,
//   message text not null,
//   audience_type text not null,
//   audience_filter jsonb default '{}',
//   recipients_count integer default 0,
//   success_count integer default 0,
//   failed_count integer default 0,
//   sent_by uuid references public.users(id),
//   scheduled_for timestamp with time zone,
//   sent_at timestamp with time zone,
//   status text default 'pending'
//     check (status in ('pending','scheduled','sending','sent','failed')),
//   created_at timestamp with time zone default timezone('utc', now())
// );

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getAdminUser, type AdminUser } from '../lib/admin-auth';
import AdminLayout from '../components/admin-layout';
import { getAllCountries, getStatesByCountry, getCountryFlag, type Country } from '../lib/location-api';
import { logAdminActivity } from '../lib/admin-activity';

const GOLD  = '#D4A853';
const SERIF = '"Playfair Display", serif';
const MONO  = '"DM Mono", monospace';
const GREEN = '#4CAF50';
const CARD  = { backgroundColor: '#FFFFFF', border: '1px solid #E8E3DC', borderRadius: '12px', padding: '24px' };

// ── Types ─────────────────────────────────────────────────────────────────────

type AudienceType = 'all' | 'host' | 'organiser' | 'guest' | 'country' | 'event_type' | 'pending_kyc';

interface NotifLog {
  id:               string;
  title:            string;
  message:          string;
  audience_type:    string;
  audience_filter:  Record<string, string>;
  recipients_count: number;
  success_count:    number;
  failed_count:     number;
  sent_by:          string | null;
  scheduled_for:    string | null;
  sent_at:          string | null;
  status:           string;
  created_at:       string;
}

// ── Templates ─────────────────────────────────────────────────────────────────

const TEMPLATES = [
  { icon: '🖼️', title: 'Gallery Ready',   body: 'Your [eventName] gallery is live! Come see what everyone captured.' },
  { icon: '🚀', title: 'New Feature',      body: 'CANDID Clicks just launched [feature]. Check it out now!' },
  { icon: '💰', title: 'Payout Sent',      body: '₹[amount] has been transferred to your account. Check your bank.' },
  { icon: '✅', title: 'KYC Reminder',     body: 'Complete your KYC to start creating events on CANDID Clicks.' },
  { icon: '📅', title: 'Event Reminder',   body: 'Your event [eventName] is tomorrow! Make sure everything is ready.' },
];

const AUDIENCE_LABELS: Record<AudienceType, string> = {
  all:        'All Users',
  host:       'All Hosts',
  organiser:  'Approved Organisers',
  guest:      'All Guests',
  country:    'By Country',
  event_type: 'By Event Type',
  pending_kyc:'Pending KYC',
};

const EVENT_TYPES = ['Wedding', 'Birthday', 'Concert', 'Sports', 'Corporate', 'Festival', 'Photography', 'Conference', 'Other'];

// ── Expo Push ─────────────────────────────────────────────────────────────────

async function sendExpoPush(tokens: string[], title: string, body: string, data?: Record<string, string>) {
  const CHUNK = 100;
  let sent = 0; let failed = 0;
  for (let i = 0; i < tokens.length; i += CHUNK) {
    const chunk = tokens.slice(i, i + CHUNK).map(to => ({ to, title, body, data: data ?? {}, sound: 'default' }));
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(chunk),
      });
      const json = await res.json();
      const results: any[] = Array.isArray(json.data) ? json.data : [json.data];
      results.forEach(r => { if (r?.status === 'ok') sent++; else failed++; });
    } catch { failed += chunk.length; }
  }
  return { sent, failed };
}

function fmtTime(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Notifications() {
  const navigate = useNavigate();
  const [admin,         setAdmin]          = useState<AdminUser | null>(null);
  const [canSend,       setCanSend]        = useState(false);
  const [loading,       setLoading]        = useState(true);
  const [sending,       setSending]        = useState(false);

  // Compose
  const [title,         setTitle]          = useState('');
  const [body,          setBody]           = useState('');
  const [deepLink,      setDeepLink]       = useState('');
  const [audienceType,  setAudienceType]   = useState<AudienceType>('all');
  const [countryTarget, setCountryTarget]  = useState('');
  const [stateTarget,   setStateTarget]    = useState('');
  const [eventTypeTarget, setEventTypeTarget] = useState('');
  const [preview,       setPreview]        = useState(false);
  const [error,         setError]          = useState('');
  const [audienceCount, setAudienceCount]  = useState<number | null>(null);

  // Schedule
  const [scheduleMode,  setScheduleMode]   = useState<'now' | 'schedule'>('now');
  const [schedDate,     setSchedDate]      = useState('');
  const [schedTime,     setSchedTime]      = useState('');

  // Data
  const [allCountries,  setAllCountries]   = useState<Country[]>([]);
  const [allStates,     setAllStates]      = useState<string[]>([]);
  const [history,       setHistory]        = useState<NotifLog[]>([]);
  const [scheduled,     setScheduled]      = useState<NotifLog[]>([]);

  useEffect(() => {
    const init = async () => {
      const user = await getAdminUser();
      if (!user) { navigate('/admin/login'); return; }
      setAdmin(user);
      setCanSend(user.permissions.canSendNotifications);
      getAllCountries().then(setAllCountries);
      loadHistory();
      setLoading(false);
    };
    init();
  }, [navigate]);

  // Update audience count when targeting changes
  useEffect(() => {
    if (loading || !canSend) return;
    (async () => {
      let count = 0;
      if (audienceType === 'all') {
        const { count: c } = await supabase.from('users').select('id', { count: 'exact', head: true }).not('push_token', 'is', null);
        count = c ?? 0;
      } else if (audienceType === 'host' || audienceType === 'guest') {
        const { count: c } = await supabase.from('users').select('id', { count: 'exact', head: true }).not('push_token', 'is', null).eq('role', audienceType);
        count = c ?? 0;
      } else if (audienceType === 'organiser') {
        const { data: approved } = await supabase.from('organiser_kyc').select('organiser_id').eq('status', 'approved');
        const ids = (approved ?? []).map((k: any) => k.organiser_id);
        if (ids.length) {
          const { count: c } = await supabase.from('users').select('id', { count: 'exact', head: true }).not('push_token', 'is', null).in('id', ids);
          count = c ?? 0;
        }
      } else if (audienceType === 'country' && countryTarget) {
        const { count: c } = await supabase.from('users').select('id', { count: 'exact', head: true }).not('push_token', 'is', null).eq('country', countryTarget);
        count = c ?? 0;
      } else if (audienceType === 'pending_kyc') {
        const { count: c } = await supabase.from('organiser_kyc').select('id', { count: 'exact', head: true }).eq('status', 'pending');
        count = c ?? 0;
      } else if (audienceType === 'event_type' && eventTypeTarget) {
        const { data: evs } = await supabase.from('events').select('id').ilike('type', eventTypeTarget);
        const evIds = (evs ?? []).map((e: any) => e.id);
        if (evIds.length) {
          const { data: parts } = await supabase.from('participants').select('user_id').in('event_id', evIds);
          const uniqueUsers = new Set((parts ?? []).map((p: any) => p.user_id));
          count = uniqueUsers.size;
        }
      }
      setAudienceCount(count);
    })();
  }, [audienceType, countryTarget, eventTypeTarget, loading, canSend]);

  // Load states when country target changes
  useEffect(() => {
    setStateTarget('');
    if (!countryTarget) { setAllStates([]); return; }
    getStatesByCountry(countryTarget).then(setAllStates);
  }, [countryTarget]);

  const loadHistory = async () => {
    try {
      const [{ data: hist }, { data: sched }] = await Promise.all([
        supabase.from('notification_log').select('*').eq('status', 'sent').order('sent_at', { ascending: false }).limit(20),
        supabase.from('notification_log').select('*').eq('status', 'scheduled').order('scheduled_for', { ascending: true }),
      ]);
      setHistory((hist ?? []) as NotifLog[]);
      setScheduled((sched ?? []) as NotifLog[]);
    } catch {}
  };

  const getTokens = async (): Promise<string[]> => {
    let q = supabase.from('users').select('push_token').not('push_token', 'is', null);

    if (audienceType === 'host' || audienceType === 'guest') {
      q = q.eq('role', audienceType);
    } else if (audienceType === 'organiser') {
      const { data: approved } = await supabase.from('organiser_kyc').select('organiser_id').eq('status', 'approved');
      const ids = (approved ?? []).map((k: any) => k.organiser_id);
      if (!ids.length) return [];
      q = q.in('id', ids);
    } else if (audienceType === 'country' && countryTarget) {
      q = q.eq('country', countryTarget);
    } else if (audienceType === 'pending_kyc') {
      const { data: pkyc } = await supabase.from('organiser_kyc').select('organiser_id').eq('status', 'pending');
      const ids = (pkyc ?? []).map((k: any) => k.organiser_id);
      if (!ids.length) return [];
      q = q.in('id', ids);
    } else if (audienceType === 'event_type' && eventTypeTarget) {
      const { data: evs } = await supabase.from('events').select('id').ilike('type', eventTypeTarget);
      const evIds = (evs ?? []).map((e: any) => e.id);
      if (!evIds.length) return [];
      const { data: parts } = await supabase.from('participants').select('user_id').in('event_id', evIds);
      const userIds = [...new Set((parts ?? []).map((p: any) => p.user_id))];
      if (!userIds.length) return [];
      q = q.in('id', userIds);
    }

    const { data } = await q;
    return (data ?? []).map((u: any) => u.push_token).filter(Boolean) as string[];
  };

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) { setError('Title and message are required.'); return; }
    setError(''); setSending(true);

    const audienceFilter: Record<string, string> = {};
    if (audienceType === 'country' && countryTarget) audienceFilter.country = countryTarget;
    if (audienceType === 'country' && stateTarget)   audienceFilter.state   = stateTarget;
    if (audienceType === 'event_type') audienceFilter.event_type = eventTypeTarget;

    // Schedule mode: save to DB only
    if (scheduleMode === 'schedule' && schedDate && schedTime) {
      const scheduledFor = new Date(`${schedDate}T${schedTime}`).toISOString();
      try {
        await supabase.from('notification_log').insert({
          title: title.trim(),
          message: body.trim(),
          audience_type: audienceType,
          audience_filter: audienceFilter,
          recipients_count: audienceCount ?? 0,
          sent_by: admin?.id ?? null,
          scheduled_for: scheduledFor,
          status: 'scheduled',
        });
        setTitle(''); setBody(''); setDeepLink(''); setPreview(false);
        await loadHistory();
      } catch {}
      setSending(false);
      return;
    }

    // Send now
    const tokens = await getTokens();
    if (tokens.length === 0) {
      setError('No users with push tokens found for this audience.');
      setSending(false);
      return;
    }

    const data: Record<string, string> = {};
    if (deepLink.trim()) data.deepLink = deepLink.trim();

    const { sent, failed } = await sendExpoPush(tokens, title.trim(), body.trim(), data);

    try {
      await supabase.from('notification_log').insert({
        title: title.trim(),
        message: body.trim(),
        audience_type: audienceType,
        audience_filter: audienceFilter,
        recipients_count: tokens.length,
        success_count: sent,
        failed_count: failed,
        sent_by: admin?.id ?? null,
        sent_at: new Date().toISOString(),
        status: 'sent',
      });
    } catch {}

    if (admin) logAdminActivity(admin.id, 'notification_sent', 'notification', undefined, { audience: audienceType, title: title.trim(), sent, failed });

    setTitle(''); setBody(''); setDeepLink(''); setPreview(false);
    await loadHistory();
    setSending(false);
  };

  const cancelScheduled = async (id: string) => {
    try {
      await supabase.from('notification_log').update({ status: 'failed' }).eq('id', id);
      setScheduled(prev => prev.filter(n => n.id !== id));
    } catch {}
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', border: '1px solid #E0D8CC', borderRadius: '6px',
    fontSize: '13px', fontFamily: MONO, color: '#1A1208', boxSizing: 'border-box', backgroundColor: '#FDFCFA',
  };
  const smInputStyle: React.CSSProperties = {
    padding: '7px 10px', border: '1px solid #E0D8CC', borderRadius: '6px',
    fontSize: '12px', fontFamily: MONO, color: '#333', backgroundColor: '#fff',
  };

  if (loading) return <AdminLayout pageTitle="Notifications">Loading…</AdminLayout>;

  if (!canSend) {
    return (
      <AdminLayout pageTitle="Notifications">
        <div style={{ ...CARD, textAlign: 'center', padding: '48px' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔒</div>
          <h2 style={{ fontFamily: SERIF, fontSize: '20px', color: '#0C0904', margin: '0 0 8px' }}>Access Restricted</h2>
          <p style={{ color: '#888', fontSize: '13px', fontFamily: MONO }}>You need the <strong>canSendNotifications</strong> permission.</p>
        </div>
      </AdminLayout>
    );
  }

  const countryListForSelect = allCountries.filter(c => c.iso2);

  return (
    <AdminLayout pageTitle="Notifications">

      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontFamily: SERIF, fontSize: '28px', fontWeight: '700', color: '#0C0904', margin: '0 0 6px' }}>Push Notifications</h1>
        <p style={{ fontSize: '13px', color: '#888', margin: 0, fontFamily: MONO }}>Broadcast to users via Expo push. Only reaches users who have enabled notifications.</p>
      </div>

      {/* ── Templates ── */}
      <div style={{ ...CARD, marginBottom: '20px' }}>
        <h2 style={{ fontFamily: SERIF, fontSize: '16px', fontWeight: '700', color: '#0C0904', margin: '0 0 14px' }}>Quick Templates</h2>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {TEMPLATES.map(t => (
            <button key={t.title} onClick={() => { setTitle(t.title); setBody(t.body); }}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', border: `1px solid ${title === t.title ? GOLD : '#E8E3DC'}`, borderRadius: '20px', backgroundColor: title === t.title ? `${GOLD}12` : '#FDFCFA', cursor: 'pointer', fontFamily: MONO, fontSize: '12px', color: title === t.title ? GOLD : '#555', fontWeight: title === t.title ? '600' : '400', transition: 'all 0.15s' }}>
              <span>{t.icon}</span>
              <span>{t.title}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-start' }}>

        {/* ── Compose ── */}
        <div style={{ ...CARD, flex: 2, minWidth: '320px' }}>
          <h2 style={{ fontFamily: SERIF, fontSize: '18px', fontWeight: '700', color: '#0C0904', margin: '0 0 20px' }}>Compose</h2>

          {/* Audience type */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#0C0904', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: MONO }}>Audience</label>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {(Object.entries(AUDIENCE_LABELS) as [AudienceType, string][]).map(([aud, label]) => (
                <button key={aud} onClick={() => setAudienceType(aud)}
                  style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontFamily: MONO, fontWeight: '600', cursor: 'pointer', border: audienceType === aud ? 'none' : '1px solid #DDD', backgroundColor: audienceType === aud ? GOLD : '#F5F3EF', color: audienceType === aud ? '#0C0904' : '#666', transition: 'all 0.15s' }}>
                  {label}
                </button>
              ))}
            </div>

            {/* Extra filters per audience type */}
            {audienceType === 'country' && (
              <div style={{ marginTop: '10px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <select value={countryTarget} onChange={e => setCountryTarget(e.target.value)} style={{ ...smInputStyle, minWidth: '180px' }}>
                  <option value="">Select country…</option>
                  {countryListForSelect.map(c => (
                    <option key={c.iso2} value={c.name}>{getCountryFlag(c.iso2)} {c.name}</option>
                  ))}
                </select>
                {allStates.length > 0 && (
                  <select value={stateTarget} onChange={e => setStateTarget(e.target.value)} style={{ ...smInputStyle, minWidth: '150px' }}>
                    <option value="">All states</option>
                    {allStates.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
              </div>
            )}

            {audienceType === 'event_type' && (
              <div style={{ marginTop: '10px' }}>
                <select value={eventTypeTarget} onChange={e => setEventTypeTarget(e.target.value)} style={{ ...smInputStyle, minWidth: '180px' }}>
                  <option value="">Select event type…</option>
                  {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            )}

            {audienceCount !== null && (
              <div style={{ marginTop: '8px', fontSize: '11px', color: audienceCount === 0 ? '#FF6B6B' : '#888', fontFamily: MONO }}>
                {audienceCount === 0
                  ? 'No users with push tokens in this segment.'
                  : `~${audienceCount} user${audienceCount !== 1 ? 's' : ''} will receive this notification.`}
              </div>
            )}
          </div>

          {/* Schedule toggle */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#0C0904', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: MONO }}>When</label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: scheduleMode === 'schedule' ? '10px' : '0' }}>
              {(['now', 'schedule'] as const).map(m => (
                <button key={m} onClick={() => setScheduleMode(m)}
                  style={{ padding: '7px 14px', border: `1px solid ${scheduleMode === m ? GOLD : '#E8E3DC'}`, borderRadius: '8px', backgroundColor: scheduleMode === m ? `${GOLD}18` : '#fff', color: scheduleMode === m ? GOLD : '#888', fontSize: '12px', fontWeight: scheduleMode === m ? '600' : '400', cursor: 'pointer', fontFamily: MONO }}>
                  {m === 'now' ? 'Send Now' : 'Schedule'}
                </button>
              ))}
            </div>
            {scheduleMode === 'schedule' && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)} style={{ ...smInputStyle, flex: 1 }} />
                <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)} style={{ ...smInputStyle, flex: 1 }} />
              </div>
            )}
          </div>

          {/* Title */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#0C0904', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: MONO }}>
              Title <span style={{ color: '#aaa', fontWeight: '400' }}>({title.length}/65)</span>
            </label>
            <input type="text" style={inputStyle} value={title} maxLength={65} onChange={e => setTitle(e.target.value)} placeholder="e.g. Your gallery is ready" />
          </div>

          {/* Body */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#0C0904', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: MONO }}>
              Message <span style={{ color: '#aaa', fontWeight: '400' }}>({body.length}/178)</span>
            </label>
            <textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} value={body} maxLength={178} onChange={e => setBody(e.target.value)} placeholder="Your message appears here." />
          </div>

          {/* Deep link */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#0C0904', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: MONO }}>
              Deep Link <span style={{ color: '#aaa', fontWeight: '400' }}>(optional)</span>
            </label>
            <input type="text" style={inputStyle} value={deepLink} onChange={e => setDeepLink(e.target.value)} placeholder="candidclicks://event/abc123" />
          </div>

          {error && (
            <div style={{ marginBottom: '16px', padding: '10px 14px', backgroundColor: '#FFE9E9', border: '1px solid #FFCCCC', borderRadius: '6px', fontSize: '12px', color: '#B71C1C', fontFamily: MONO }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setPreview(p => !p)} style={{ flex: 1, padding: '10px', backgroundColor: '#F5F3EF', color: '#555', border: '1px solid #DDD', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontFamily: MONO }}>
              {preview ? 'Hide Preview' : 'Preview'}
            </button>
            <button
              onClick={handleSend}
              disabled={sending || !title.trim() || !body.trim() || (scheduleMode === 'schedule' && (!schedDate || !schedTime))}
              style={{
                flex: 2, padding: '10px', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', fontFamily: MONO,
                backgroundColor: (sending || !title.trim() || !body.trim()) ? '#E0D8CC' : GOLD,
                color: '#0C0904',
                cursor: (sending || !title.trim() || !body.trim()) ? 'not-allowed' : 'pointer',
              }}>
              {sending ? 'Sending…' : scheduleMode === 'schedule' ? 'Schedule Notification' : `Send to ${AUDIENCE_LABELS[audienceType]}`}
            </button>
          </div>
        </div>

        {/* ── Right column ── */}
        <div style={{ flex: 1, minWidth: '260px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {preview && (
            <div style={CARD}>
              <h3 style={{ fontFamily: SERIF, fontSize: '15px', fontWeight: '700', color: '#0C0904', margin: '0 0 14px' }}>Device Preview</h3>
              <div style={{ backgroundColor: '#1C1C1E', borderRadius: '16px', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '6px', backgroundColor: GOLD, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>📷</div>
                  <div style={{ fontSize: '11px', color: '#aaa', fontFamily: MONO }}>CANDID CLICKS · now</div>
                </div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#FFF', marginBottom: '4px', fontFamily: SERIF }}>
                  {title || <span style={{ color: '#555' }}>Your notification title</span>}
                </div>
                <div style={{ fontSize: '12px', color: '#CCC', lineHeight: 1.4, fontFamily: MONO }}>
                  {body || <span style={{ color: '#555' }}>Your message appears here.</span>}
                </div>
              </div>
            </div>
          )}

          {/* Scheduled */}
          {scheduled.length > 0 && (
            <div style={CARD}>
              <h3 style={{ fontFamily: SERIF, fontSize: '15px', fontWeight: '700', color: '#0C0904', margin: '0 0 14px' }}>Scheduled</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {scheduled.map(s => (
                  <div key={s.id} style={{ padding: '10px 12px', backgroundColor: '#FFF7E0', border: '1px solid #FFE0A0', borderRadius: '8px' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#0C0904', fontFamily: MONO, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</div>
                    <div style={{ fontSize: '11px', color: '#888', fontFamily: MONO, marginBottom: '6px' }}>{AUDIENCE_LABELS[s.audience_type as AudienceType] ?? s.audience_type} · {fmtTime(s.scheduled_for!)}</div>
                    <button onClick={() => cancelScheduled(s.id)} style={{ fontSize: '10px', padding: '2px 8px', border: '1px solid #FF6B6B', borderRadius: '4px', color: '#FF6B6B', backgroundColor: 'transparent', cursor: 'pointer', fontFamily: MONO }}>Cancel</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {scheduled.length === 0 && !preview && (
            <div style={{ ...CARD, textAlign: 'center', padding: '24px' }}>
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>🔔</div>
              <div style={{ fontSize: '12px', color: '#aaa', fontFamily: MONO }}>Preview and history appear here.</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Notification History ── */}
      <div style={{ ...CARD, marginTop: '28px', padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #E8E3DC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontFamily: SERIF, fontSize: '18px', fontWeight: '700', color: '#0C0904', margin: 0 }}>Notification History</h2>
          <div style={{ fontSize: '11px', color: '#aaa', fontFamily: MONO }}>Last 20 sent</div>
        </div>

        {history.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#bbb', fontFamily: MONO, fontSize: '13px' }}>
            No notifications sent yet.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Message', 'Audience', 'Recipients', 'Sent At', 'Delivered', 'Failed'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10px', fontWeight: '600', letterSpacing: '1px', color: '#888', textTransform: 'uppercase', backgroundColor: '#F5F3EF', whiteSpace: 'nowrap', fontFamily: MONO }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.id}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#FAFAF8'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}>
                    <td style={{ padding: '12px 16px', fontFamily: MONO, color: '#333', borderBottom: '1px solid #F5F3EF', maxWidth: '260px' }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#0C0904', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.title}</div>
                      <div style={{ fontSize: '11px', color: '#888', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.message}</div>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '12px', fontFamily: MONO, color: '#555', borderBottom: '1px solid #F5F3EF', whiteSpace: 'nowrap' }}>
                      {AUDIENCE_LABELS[h.audience_type as AudienceType] ?? h.audience_type}
                      {h.audience_filter?.country ? ` · ${h.audience_filter.country}` : ''}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '12px', fontFamily: MONO, color: '#333', borderBottom: '1px solid #F5F3EF', textAlign: 'center' }}>{h.recipients_count}</td>
                    <td style={{ padding: '12px 16px', fontSize: '11px', fontFamily: MONO, color: '#888', borderBottom: '1px solid #F5F3EF', whiteSpace: 'nowrap' }}>{fmtTime(h.sent_at!)}</td>
                    <td style={{ padding: '12px 16px', borderBottom: '1px solid #F5F3EF', textAlign: 'center' }}>
                      <span style={{ fontSize: '11px', padding: '2px 8px', backgroundColor: '#E6F9EE', color: '#1A7A40', borderRadius: '4px', fontFamily: MONO }}>✓ {h.success_count}</span>
                    </td>
                    <td style={{ padding: '12px 16px', borderBottom: '1px solid #F5F3EF', textAlign: 'center' }}>
                      {h.failed_count > 0
                        ? <span style={{ fontSize: '11px', padding: '2px 8px', backgroundColor: '#FFE9E9', color: '#B71C1C', borderRadius: '4px', fontFamily: MONO }}>✗ {h.failed_count}</span>
                        : <span style={{ color: '#ddd', fontSize: '11px' }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </AdminLayout>
  );
}
