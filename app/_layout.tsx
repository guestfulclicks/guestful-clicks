import { Slot } from 'expo-router';
import { useEffect } from 'react';
import { registerForPushNotifications } from '../shared/notifications';

export default function RootLayout() {
  useEffect(() => {
    // Request push notification permission on first launch.
    // Non-blocking: the result is a no-op here since guests and organisers
    // each save their token at the relevant point in the flow.
    registerForPushNotifications().catch(() => {});
  }, []);

  return <Slot />;
}
