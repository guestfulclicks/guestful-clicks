import React, { useEffect, useRef } from 'react';
import { Stack, router } from 'expo-router';
import { useFonts } from 'expo-font';
import { PlayfairDisplay_400Regular, PlayfairDisplay_700Bold } from '@expo-google-fonts/playfair-display';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase/client';
import { registerForPushNotifications } from '../shared/notifications';
import type { UserRole } from '../shared/types';

// ── Root layout with auth and notification setup ───────────────────────────────

export default function RootLayout() {
  const notificationListener = useRef<any>(null);
  const responseListener = useRef<any>(null);

  const [fontsLoaded] = useFonts({
    PlayfairDisplay_400Regular,
    PlayfairDisplay_700Bold,
  });

  // ── Auth check and redirect on app start ──────────────────────────────────

  useEffect(() => {
    const checkAuthAndNavigate = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          const { data: userData } = await supabase
            .from('users')
            .select('role')
            .eq('id', session.user.id)
            .single();

          const role = userData?.role as UserRole | undefined;
          if (role === 'host') {
            setTimeout(() => router.replace('/dashboard/host-dashboard'), 100);
          } else if (role === 'organiser') {
            setTimeout(() => router.replace('/dashboard/organiser-dashboard'), 100);
          } else if (role === 'admin') {
            setTimeout(() => router.replace('/admin/events'), 100);
          } else {
            // Signed in but role not set yet (e.g. new user mid-onboarding)
            setTimeout(() => router.replace('/auth/select-role'), 100);
          }
        } else {
          const participant = await AsyncStorage.getItem('@guestful_participant');
          if (participant) {
            setTimeout(() => router.replace('/gallery/reveal-screen'), 100);
          } else {
            setTimeout(() => router.replace('/onboarding/slides'), 100);
          }
        }
      } catch (error) {
        console.error('Auth check error:', error);
        setTimeout(() => router.replace('/onboarding/slides'), 100);
      }
    };

    const timer = setTimeout(() => {
      checkAuthAndNavigate();
    }, 500);
    return () => clearTimeout(timer);
  }, []);


  // ── Supabase auth state listener ──────────────────────────────────────────

  useEffect(() => {
    // IMPORTANT: callback must NOT be async — supabase-js v2 awaits all
    // subscribers before resolving setSession/exchangeCodeForSession, so an
    // async callback here causes a deadlock. Fire async work in a void IIFE.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_IN') {
          void (async () => {
            const { data: userData } = await supabase
              .from('users')
              .select('role')
              .eq('id', session?.user?.id)
              .single();

            const role = userData?.role as UserRole | undefined;
            if (role === 'host') {
              setTimeout(() => router.replace('/dashboard/host-dashboard'), 100);
            } else if (role === 'organiser') {
              setTimeout(() => router.replace('/dashboard/organiser-dashboard'), 100);
            } else if (role === 'admin') {
              setTimeout(() => router.replace('/admin/events'), 100);
            } else {
              setTimeout(() => router.replace('/auth/select-role'), 100);
            }
          })();
        } else if (event === 'SIGNED_OUT') {
          void (async () => {
            await AsyncStorage.removeItem('@guestful_participant');
            setTimeout(() => router.replace('/onboarding/slides'), 100);
          })();
        }
      },
    );

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // ── Notification listeners ────────────────────────────────────────────────

  useEffect(() => {
    // Request push notification permissions and register token
    registerForPushNotifications().catch(() => {});

    // Handler for notifications received while app is in foreground
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        const eventName = notification.request.content.data.eventName as string;
        // The notification is displayed automatically via setNotificationHandler
      },
    );

    // Handler for notification taps (both foreground and background)
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const type = response.notification.request.content.data.type as string;
        if (type === 'reveal') {
          router.replace('gallery/reveal-screen');
        }
      },
    );

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}
