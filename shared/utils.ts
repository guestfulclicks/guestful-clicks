import * as Localization from 'expo-localization';

// ── generateShareCode ─────────────────────────────────────────────────────────
// Generates an 8-character uppercase alphanumeric code for event sharing.
// Example: "GF4X9K2M"

export function generateShareCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ── generateQRToken ───────────────────────────────────────────────────────────
// Generates a 32-character lowercase hex string for participant identification.
// Used in guest join flow.

export function generateQRToken(): string {
  let token = '';
  const hexChars = '0123456789abcdef';
  for (let i = 0; i < 32; i++) {
    token += hexChars[Math.floor(Math.random() * 16)];
  }
  return token;
}

// ── formatRevealDate ──────────────────────────────────────────────────────────
// Formats a Date into human-readable reveal time string.
// Example: "Saturday, 14 June 2026 at 11:00 PM"

export function formatRevealDate(date: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];

  const dayName = days[date.getDay()];
  const dayNum = date.getDate();
  const monthName = months[date.getMonth()];
  const year = date.getFullYear();

  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const period = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 === 0 ? 12 : hours % 12;

  return `${dayName}, ${dayNum} ${monthName} ${year} at ${hours}:${minutes} ${period}`;
}

// ── formatCountdown ────────────────────────────────────────────────────────────
// Calculates time remaining until targetDate and returns zero-padded components.
// Returns { days, hours, minutes, seconds } as "08" format strings.

export function formatCountdown(targetDate: Date): {
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
} {
  const now = Date.now();
  const target = targetDate.getTime();
  const diff = Math.max(0, target - now);

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);

  return {
    days: String(days).padStart(2, '0'),
    hours: String(hours).padStart(2, '0'),
    minutes: String(minutes).padStart(2, '0'),
    seconds: String(seconds).padStart(2, '0'),
  };
}

// ── getCountryCode ────────────────────────────────────────────────────────────
// Returns the device country code (e.g., "IN", "US").
// Falls back to "IN" if unavailable.

export function getCountryCode(): string {
  try {
    const code = Localization.getLocales()[0]?.regionCode;
    return code || 'IN';
  } catch {
    return 'IN';
  }
}

// ── buildJoinURL ──────────────────────────────────────────────────────────────
// Builds the full join URL for an event share code.
// Query-param format matches useLocalSearchParams in app/guest/join.tsx and
// maps to the /guest/join route via the Android intent filter / iOS App Link.
// Example: "https://join.guestfulclicks.com/guest/join?code=GF4X9K2M"

export function buildJoinURL(shareCode: string): string {
  return `https://join.guestfulclicks.com/guest/join?code=${shareCode}`;
}

// ── buildWhatsAppMessage ──────────────────────────────────────────────────────
// Builds a formatted WhatsApp message for event sharing.

export function buildWhatsAppMessage(
  eventName: string,
  shareCode: string,
): string {
  const joinURL = buildJoinURL(shareCode);
  return (
    `You're invited to ${eventName} on Guestful Clicks! 📷\n` +
    `Scan to join and capture the moments:\n` +
    `${joinURL}\n` +
    `\n` +
    `Every angle. Every guest. One gallery.`
  );
}
