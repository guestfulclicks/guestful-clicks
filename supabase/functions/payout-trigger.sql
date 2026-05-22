-- ─────────────────────────────────────────────────────────────────────────────
-- Guestful Clicks — Payout Amount Trigger
-- Run after schema.sql.
--
-- Whenever a participant pays (amount_paid > 0), this trigger recalculates the
-- organiser's 25% share and updates the payouts row for that event.
-- This keeps payouts.amount accurate in real time without any client-side logic.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.update_payout_amount()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_revenue   int;
  v_organiser_share int;
begin
  -- Skip free-tier participants (no revenue, no payout change).
  if NEW.amount_paid <= 0 then
    return NEW;
  end if;

  -- Sum all paid amounts for this event (the new row is already committed
  -- because this is an AFTER INSERT trigger).
  select coalesce(sum(amount_paid), 0)
  into   v_total_revenue
  from   public.participants
  where  event_id = NEW.event_id;

  -- 25% organiser share, rounded down to the nearest rupee.
  v_organiser_share := floor(v_total_revenue * 25.0 / 100.0)::int;

  -- Update the payout record only while it is still actionable.
  -- Paid/failed payouts are historical and should not be mutated.
  update public.payouts
  set    amount = v_organiser_share
  where  event_id = NEW.event_id
    and  status   in ('pending', 'scheduled');

  return NEW;
end;
$$;

drop trigger if exists on_participant_paid_update_payout on public.participants;
create trigger on_participant_paid_update_payout
  after insert on public.participants
  for each row
  execute function public.update_payout_amount();
