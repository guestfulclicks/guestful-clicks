import RazorpayCheckout from 'react-native-razorpay';

// ── Key ───────────────────────────────────────────────────────────────────────
// Loaded from .env as EXPO_PUBLIC_RAZORPAY_KEY_ID so the value is
// baked in at build time (no runtime secret exposure).

export const RAZORPAY_KEY_ID: string =
  (process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID as string) ?? '';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RazorpayOptions {
  /** Amount in Indian Rupees (₹). The function converts to paise internally. */
  amount: number;
  description: string;
  userName: string;
  userEmail: string;
  eventName: string;
  prefillPhone?: string;
}

export interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_order_id?: string;
  razorpay_signature?: string;
}

// ── openRazorpayCheckout ──────────────────────────────────────────────────────
// Wraps the native SDK call with typed options and a clean async API.
// Throws on cancellation (code === 'PAYMENT_CANCELLED') and on failure.
// Callers should distinguish the two to decide whether to show an error.

export async function openRazorpayCheckout(
  options: RazorpayOptions,
): Promise<RazorpaySuccess> {
  const razorpayOptions = {
    key:         RAZORPAY_KEY_ID,
    amount:      options.amount * 100,       // rupees → paise
    currency:    'INR',
    name:        'Guestful Clicks',
    description: options.description,
    image:       'https://guestfulclicks.com/logo.png',
    prefill: {
      name:    options.userName,
      email:   options.userEmail,
      contact: options.prefillPhone ?? '',
    },
    theme: { color: '#D4A853' },
    modal: {
      backdropclose: false,
      escape:        false,
    },
  };

  const response = await (RazorpayCheckout as any).open(razorpayOptions);
  return response as RazorpaySuccess;
}
