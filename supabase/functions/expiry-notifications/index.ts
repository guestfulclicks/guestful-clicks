// Supabase Edge Function: expiry-notifications
// Schedule: daily at 10:00 UTC via Supabase Dashboard → Edge Functions → Schedules
// Finds events expiring in exactly 3 days and sends push notifications to
// the host and all participants who have a push_token.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const now        = new Date();
  const in3Days    = new Date(now.getTime() + 3 * 86400000);
  const windowFrom = new Date(in3Days.getTime() - 12 * 3600000).toISOString(); // ±12h window
  const windowTo   = new Date(in3Days.getTime() + 12 * 3600000).toISOString();

  const { data: events } = await supabase
    .from('events')
    .select('id, title, expires_at')
    .gte('expires_at', windowFrom)
    .lte('expires_at', windowTo)
    .neq('status', 'deleted');

  if (!events?.length) return new Response(JSON.stringify({ notified: 0 }));

  let notified = 0;

  for (const ev of events) {
    // Collect push tokens from host (users table) and all participants
    const [{ data: parts }] = await Promise.all([
      supabase
        .from('participants')
        .select('push_token')
        .eq('event_id', ev.id)
        .not('push_token', 'is', null),
    ]);

    const tokens: string[] = (parts ?? [])
      .map((p: any) => p.push_token)
      .filter(Boolean);

    if (!tokens.length) continue;

    const messages = tokens.map((token: string) => ({
      to:    token,
      sound: 'default',
      title: 'Gallery expiring soon 📸',
      body:  `Your Guestful Clicks gallery for "${ev.title}" expires in 3 days. Download your photos before they\'re gone forever.`,
      data:  { eventId: ev.id },
    }));

    // Send in batches of 100 (Expo limit)
    for (let i = 0; i < messages.length; i += 100) {
      await fetch(EXPO_PUSH_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(messages.slice(i, i + 100)),
      });
    }

    notified += tokens.length;
  }

  return new Response(JSON.stringify({ notified, events: events.length }));
});
