// ── Private Host Pricing (INR) ─────────────────────────────────────────────
export const PRIVATE_HOST_PRICING = [
  { maxGuests: 25,  price: 299 },
  { maxGuests: 75,  price: 599 },
  { maxGuests: 150, price: 999 },
  { maxGuests: 300, price: 1799 },
  { maxGuests: Infinity, price: 2999 },
] as const;

// ── Public Organiser Pricing (INR) ─────────────────────────────────────────
export const PUBLIC_ORGANISER_PRICING = {
  singleEvent:      2499,
  monthlyUnlimited: 5999,
} as const;

// ── Public Participant Pricing (INR) ───────────────────────────────────────
export const PUBLIC_PARTICIPANT_PRICING = [
  { shots: 10, price: 99 },
  { shots: 15, price: 199 },
  { shots: 25, price: 299 },
  { shots: 46, price: 499 },
] as const;

// ── Shot Limits ────────────────────────────────────────────────────────────
export const SHOT_LIMITS = {
  privateGuest:  18,
  public99:      10,
  public199:     15,
  public299:     25,
  public499:     46,
} as const;

// ── Revenue Share ──────────────────────────────────────────────────────────
export const REVENUE_SHARE = {
  organiserPercent: 25,
  payoutWindowStartDay: 36,
  payoutWindowEndDay:   50,
} as const;

// ── Reveal Rules ───────────────────────────────────────────────────────────
export const REVEAL_RULES = {
  private: 'host_custom',       // host sets a custom date and time
  public:  'auto_2h_after_end', // automatic 2 hours after event end time
} as const;
