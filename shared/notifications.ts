import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from '../supabase/client';

// ── Foreground handler ────────────────────────────────────────────────────────
// Module-level side effect: sets how notifications behave while the app is open.

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// ── Internal helpers ──────────────────────────────────────────────────────────

function revealNotifId(eventName: string): string {
  return `reveal_${eventName.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 80)}`;
}

// ── registerForPushNotifications ──────────────────────────────────────────────
// Requests permission, gets the Expo push token, persists it to the
// authenticated user's row if signed in, and returns the raw token string.
// Returns null on web, simulators, or permission denial.
//
// For unauthenticated participants (guest join flow), the caller is responsible
// for persisting the returned token to the participants table.
//
// Note: standalone production builds require an EAS projectId in app.json
// under extra.eas.projectId. In Expo Go / development it works without one.

export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  if (!Device.isDevice) return null;  // simulators cannot receive push

  // Android requires a notification channel before any notification can fire.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('guestful_default', {
      name: 'Guestful Clicks',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#D4A853',
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  const { status } = existing === 'granted'
    ? { status: existing }
    : await Notifications.requestPermissionsAsync();

  if (status !== 'granted') return null;

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync();

    // Persist to the authenticated user row (hosts / organisers).
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('users').update({ push_token: token }).eq('id', user.id);
    }

    return token;
  } catch {
    return null;
  }
}

// ── scheduleRevealNotification ────────────────────────────────────────────────
// Schedules a local notification that fires at the exact reveal time.
// Cancels any previously scheduled reveal notification for the same event
// so re-scheduling (e.g. after a time change) doesn't create duplicates.

export async function scheduleRevealNotification(
  eventName: string,
  revealTime: Date,
): Promise<void> {
  if (Platform.OS === 'web') return;
  if (revealTime.getTime() <= Date.now()) return;   // already passed — skip

  const notifId = revealNotifId(eventName);

  try {
    await Notifications.cancelScheduledNotificationAsync(notifId);
  } catch {/* not yet scheduled — ignore */}

  await Notifications.scheduleNotificationAsync({
    identifier: notifId,
    content: {
      title: 'Your gallery is ready 🎞',
      body:  `${eventName} — Come see what everyone captured.`,
      data:  { type: 'reveal', eventName },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: revealTime,
    },
  });
}

// ── sendImmediateNotification ─────────────────────────────────────────────────
// Delivers a local notification instantly. Used for in-app confirmations.

export async function sendImmediateNotification(
  title: string,
  body: string,
): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: null,
  });
}

// ── cancelAllNotifications ────────────────────────────────────────────────────
// Cancels every pending scheduled notification. Call on logout.

export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

// ── setupNotificationListeners ────────────────────────────────────────────────
// Listens for notifications received while the app is foregrounded.
// Calls onReveal when a reveal notification fires.
// Returns a cleanup function — wire into useEffect's return value.

export function setupNotificationListeners(onReveal: () => void): () => void {
  const sub = Notifications.addNotificationReceivedListener(notification => {
    if (notification.request.content.data?.type === 'reveal') {
      onReveal();
    }
  });
  return () => sub.remove();
}
