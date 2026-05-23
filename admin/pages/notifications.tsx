import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getAdminUser } from '../lib/admin-auth';
import AdminLayout from '../components/admin-layout';

const GOLD  = '#D4A853';
const SERIF = '"Playfair Display", serif';
const MONO  = '"DM Mono", monospace';
const CARD  = { backgroundColor: '#FFFFFF', border: '1px solid #E8E3DC', borderRadius: '12px', padding: '24px' };

type Audience = 'all' | 'host' | 'organiser' | 'guest';

interface SendResult {
  sent: number;
  failed: number;
  timestamp: string;
  title: string;
  audience: string;
}

const AUDIENCE_LABELS: Record<Audience, string> = {
  all: 'All Users',
  host: 'Hosts Only',
  organiser: 'Organisers Only',
  guest: 'Guests Only',
};

async function sendExpoPush(tokens: string[], title: string, body: string, data?: Record<string, string>) {
  const CHUNK = 100;
  let sent = 0;
  let failed = 0;

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
    } catch {
      failed += chunk.length;
    }
  }

  return { sent, failed };
}

export default function Notifications() {
  const navigate = useNavigate();
  const [canSend, setCanSend]             = useState(false);
  const [loading, setLoading]             = useState(true);
  const [sending, setSending]             = useState(false);
  const [title, setTitle]                 = useState('');
  const [body, setBody]                   = useState('');
  const [audience, setAudience]           = useState<Audience>('all');
  const [deepLink, setDeepLink]           = useState('');
  const [preview, setPreview]             = useState(false);
  const [history, setHistory]             = useState<SendResult[]>([]);
  const [error, setError]                 = useState('');
  const [audienceCount, setAudienceCount] = useState<number | null>(null);

  useEffect(() => {
    const init = async () => {
      const user = await getAdminUser();
      if (!user) { navigate('/admin/login'); return; }
      setCanSend(user.permissions.canSendNotifications);
      setLoading(false);
    };
    init();
  }, [navigate]);

  useEffect(() => {
    if (loading) return;
    let q = supabase.from('users').select('id', { count: 'exact', head: true }).not('push_token', 'is', null);
    if (audience !== 'all') q = q.eq('role', audience);
    q.then(({ count }) => setAudienceCount(count ?? 0));
  }, [audience, loading]);

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) { setError('Title and message are required.'); return; }
    setError('');
    setSending(true);

    let q = supabase.from('users').select('push_token').not('push_token', 'is', null);
    if (audience !== 'all') q = q.eq('role', audience);
    const { data: users } = await q;

    const tokens = (users ?? []).map((u: any) => u.push_token).filter(Boolean) as string[];
    if (tokens.length === 0) {
      setError('No users with push tokens found for this audience.');
      setSending(false);
      return;
    }

    const data: Record<string, string> = {};
    if (deepLink.trim()) data.deepLink = deepLink.trim();

    const { sent, failed } = await sendExpoPush(tokens, title.trim(), body.trim(), data);

    setHistory(prev => [{
      sent, failed,
      timestamp: new Date().toISOString(),
      title: title.trim(),
      audience: AUDIENCE_LABELS[audience],
    }, ...prev].slice(0, 20));

    setTitle('');
    setBody('');
    setDeepLink('');
    setPreview(false);
    setSending(false);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #E0D8CC',
    borderRadius: '6px',
    fontSize: '13px',
    fontFamily: MONO,
    color: '#1A1208',
    boxSizing: 'border-box',
    backgroundColor: '#FDFCFA',
  };

  if (loading) return <AdminLayout pageTitle="Notifications">Loading…</AdminLayout>;

  if (!canSend) {
    return (
      <AdminLayout pageTitle="Notifications">
        <div style={{ ...CARD, textAlign: 'center' as const, padding: '48px' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔒</div>
          <h2 style={{ fontFamily: SERIF, fontSize: '20px', color: '#0C0904', margin: '0 0 8px' }}>Access Restricted</h2>
          <p style={{ color: '#888', fontSize: '13px', fontFamily: MONO }}>You need the <strong>canSendNotifications</strong> permission to use this page.</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout pageTitle="Notifications">

      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontFamily: SERIF, fontSize: '28px', fontWeight: '700', color: '#0C0904', margin: '0 0 6px' }}>Push Notifications</h1>
        <p style={{ fontSize: '13px', color: '#888', margin: 0, fontFamily: MONO }}>Broadcast to users via Expo push. Only reaches users who have enabled notifications.</p>
      </div>

      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' as const, alignItems: 'flex-start' }}>

        {/* Compose card */}
        <div style={{ ...CARD, flex: 2, minWidth: '320px' }}>
          <h2 style={{ fontFamily: SERIF, fontSize: '18px', fontWeight: '700', color: '#0C0904', margin: '0 0 20px' }}>Compose</h2>

          {/* Audience */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#0C0904', marginBottom: '8px', textTransform: 'uppercase' as const, letterSpacing: '0.5px', fontFamily: MONO }}>Audience</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const }}>
              {(['all', 'host', 'organiser', 'guest'] as Audience[]).map(aud => (
                <button key={aud} onClick={() => setAudience(aud)} style={{
                  padding: '7px 14px', borderRadius: '6px', fontSize: '12px', fontFamily: MONO, fontWeight: '600', cursor: 'pointer',
                  border: audience === aud ? 'none' : '1px solid #DDD',
                  backgroundColor: audience === aud ? GOLD : '#F5F3EF',
                  color: audience === aud ? '#0C0904' : '#666',
                }}>
                  {AUDIENCE_LABELS[aud]}
                </button>
              ))}
            </div>
            {audienceCount !== null && (
              <div style={{ marginTop: '6px', fontSize: '11px', color: audienceCount === 0 ? '#FF6B6B' : '#888', fontFamily: MONO }}>
                {audienceCount === 0
                  ? 'No users with push tokens in this segment.'
                  : `~${audienceCount} user${audienceCount !== 1 ? 's' : ''} will receive this notification.`
                }
              </div>
            )}
          </div>

          {/* Title */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#0C0904', marginBottom: '6px', textTransform: 'uppercase' as const, letterSpacing: '0.5px', fontFamily: MONO }}>
              Title <span style={{ color: '#aaa', fontWeight: '400' }}>({title.length}/65)</span>
            </label>
            <input type="text" style={inputStyle} value={title} maxLength={65} onChange={e => setTitle(e.target.value)} placeholder="e.g. Your gallery is ready" />
          </div>

          {/* Body */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#0C0904', marginBottom: '6px', textTransform: 'uppercase' as const, letterSpacing: '0.5px', fontFamily: MONO }}>
              Message <span style={{ color: '#aaa', fontWeight: '400' }}>({body.length}/178)</span>
            </label>
            <textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' as const }} value={body} maxLength={178} onChange={e => setBody(e.target.value)} placeholder="e.g. Come see what everyone captured at the event." />
          </div>

          {/* Deep link */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#0C0904', marginBottom: '6px', textTransform: 'uppercase' as const, letterSpacing: '0.5px', fontFamily: MONO }}>
              Deep Link <span style={{ color: '#aaa', fontWeight: '400' }}>(optional)</span>
            </label>
            <input type="text" style={inputStyle} value={deepLink} onChange={e => setDeepLink(e.target.value)} placeholder="guestfulclicks://event/abc123" />
          </div>

          {error && (
            <div style={{ marginBottom: '16px', padding: '10px 14px', backgroundColor: '#FFE9E9', border: '1px solid #FFCCCC', borderRadius: '6px', fontSize: '12px', color: '#B71C1C', fontFamily: MONO }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setPreview(p => !p)} style={{ flex: 1, padding: '10px', backgroundColor: '#F5F3EF', color: '#555', border: '1px solid #DDD', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontFamily: MONO }}>
              {preview ? 'Hide Preview' : 'Preview'}
            </button>
            <button
              onClick={handleSend}
              disabled={sending || !title.trim() || !body.trim()}
              style={{
                flex: 2, padding: '10px', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', fontFamily: MONO,
                backgroundColor: sending || !title.trim() || !body.trim() ? '#E0D8CC' : GOLD,
                color: '#0C0904',
                cursor: sending || !title.trim() || !body.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {sending ? 'Sending…' : `Send to ${AUDIENCE_LABELS[audience]}`}
            </button>
          </div>
        </div>

        {/* Right column: preview + history */}
        <div style={{ flex: 1, minWidth: '260px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {preview && (
            <div style={CARD}>
              <h3 style={{ fontFamily: SERIF, fontSize: '15px', fontWeight: '700', color: '#0C0904', margin: '0 0 14px' }}>Device Preview</h3>
              <div style={{ backgroundColor: '#1C1C1E', borderRadius: '16px', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '6px', backgroundColor: GOLD, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>📷</div>
                  <div style={{ fontSize: '11px', color: '#aaa', fontFamily: MONO }}>GUESTFUL CLICKS · now</div>
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

          {history.length > 0 ? (
            <div style={CARD}>
              <h3 style={{ fontFamily: SERIF, fontSize: '15px', fontWeight: '700', color: '#0C0904', margin: '0 0 14px' }}>Recent Sends</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {history.map((h, i) => (
                  <div key={i} style={{ padding: '10px 12px', backgroundColor: '#F5F3EF', borderRadius: '8px' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#0C0904', fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, marginBottom: '2px' }}>{h.title}</div>
                    <div style={{ fontSize: '11px', color: '#888', fontFamily: MONO, marginBottom: '6px' }}>
                      {h.audience} · {new Date(h.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <span style={{ fontSize: '10px', padding: '2px 6px', backgroundColor: '#E6F9EE', color: '#1A7A40', borderRadius: '4px', fontFamily: MONO }}>✓ {h.sent} sent</span>
                      {h.failed > 0 && <span style={{ fontSize: '10px', padding: '2px 6px', backgroundColor: '#FFE9E9', color: '#B71C1C', borderRadius: '4px', fontFamily: MONO }}>✗ {h.failed} failed</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : !preview ? (
            <div style={{ ...CARD, textAlign: 'center' as const, padding: '32px' }}>
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>🔔</div>
              <div style={{ fontSize: '12px', color: '#aaa', fontFamily: MONO }}>Send history appears here after your first broadcast.</div>
            </div>
          ) : null}
        </div>
      </div>
    </AdminLayout>
  );
}
