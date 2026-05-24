// Requires this table in Supabase:
//
// create table public.admin_activity_log (
//   id uuid default gen_random_uuid() primary key,
//   admin_id uuid references public.users(id),
//   action text not null,
//   entity_type text,
//   entity_id text,
//   details jsonb default '{}',
//   ip_address text,
//   created_at timestamp with time zone default timezone('utc', now())
// );

import { supabase } from './supabase';

export async function logAdminActivity(
  adminId: string,
  action: string,
  entityType?: string,
  entityId?: string,
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.from('admin_activity_log').insert({
      admin_id: adminId,
      action,
      entity_type: entityType ?? null,
      entity_id: entityId ?? null,
      details: details ?? {},
    });
  } catch {}
}
