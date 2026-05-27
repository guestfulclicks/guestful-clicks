import React, { createContext, useContext, useState } from 'react';

// ── Draft shape — grows as user moves through the flow ─────────────────────

export interface CreateEventDraft {
  eventCategory: string;   // e.g. 'wedding', 'sports', 'concert' …
  eventName: string;
  eventDate: string;       // ISO date string  "YYYY-MM-DD"
  eventEndTime: string;    // 24-h "HH:MM" — used to auto-compute organiser reveal
  revealTime: string;      // ISO datetime string — set on reveal-time screen
  revealMode: string;      // 'during' | 'after' | 'custom'
  aesthetic: string;
  invitationCard: string;
  guestCount: number | null;
  pricingTier: string;
}

const EMPTY_DRAFT: CreateEventDraft = {
  eventCategory: '',
  eventName: '',
  eventDate: '',
  eventEndTime: '',
  revealTime: '',
  revealMode: 'after',
  aesthetic: '',
  invitationCard: '',
  guestCount: null,
  pricingTier: '',
};

// ── Context ────────────────────────────────────────────────────────────────

interface CreateEventContextValue {
  draft: CreateEventDraft;
  update: (patch: Partial<CreateEventDraft>) => void;
  reset: () => void;
}

const CreateEventContext = createContext<CreateEventContextValue | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────

export function CreateEventProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = useState<CreateEventDraft>(EMPTY_DRAFT);

  const update = (patch: Partial<CreateEventDraft>) =>
    setDraft((prev) => ({ ...prev, ...patch }));

  const reset = () => setDraft(EMPTY_DRAFT);

  return (
    <CreateEventContext.Provider value={{ draft, update, reset }}>
      {children}
    </CreateEventContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useCreateEvent(): CreateEventContextValue {
  const ctx = useContext(CreateEventContext);
  if (!ctx) {
    throw new Error('useCreateEvent must be used inside <CreateEventProvider>');
  }
  return ctx;
}
