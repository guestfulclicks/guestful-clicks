// Supabase Edge Function: auto-delete
// Schedule: daily at 02:00 UTC via Supabase Dashboard → Edge Functions → Schedules
// Finds events where expires_at < now(), deletes their storage files, marks events deleted.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Find events that have expired and are not yet marked deleted
  const { data: expiredEvents, error: evErr } = await supabase
    .from('events')
    .select('id, title')
    .lt('expires_at', new Date().toISOString())
    .neq('status', 'deleted');

  if (evErr) return new Response(JSON.stringify({ error: evErr.message }), { status: 500 });
  if (!expiredEvents?.length) return new Response(JSON.stringify({ deleted: 0 }));

  let deleted = 0;

  for (const ev of expiredEvents) {
    // List all storage objects for this event
    const { data: objects } = await supabase.storage
      .from('event-photos')
      .list(ev.id, { limit: 1000 });

    if (objects?.length) {
      const paths = objects.map((o: any) => `${ev.id}/${o.name}`);
      await supabase.storage.from('event-photos').remove(paths);
    }

    // Mark event as deleted
    await supabase
      .from('events')
      .update({ status: 'deleted', expires_at: new Date().toISOString() })
      .eq('id', ev.id);

    // Soft-delete all photos
    await supabase
      .from('photos')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('event_id', ev.id);

    deleted++;
  }

  return new Response(JSON.stringify({ deleted, events: expiredEvents.map((e: any) => e.title) }));
});
