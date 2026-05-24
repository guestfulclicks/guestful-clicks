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
        // Attempt to get the current Supabase session
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          // User is signed in — fetch their role
          const { data: userData, error } = await supabase
            .from('users')
            .select('role')
            .eq('id', session.user.id)
            .single();

          if (!error && userData) {
            const role = userData.role as UserRole;

            // Redirect based on role
            if (role === 'host') {
              router.replace('dashboard/host-dashboard');
            } else if (role === 'organiser') {
              router.replace('dashboard/organiser-dashboard');
            } else if (role === 'admin') {
              router.replace('admin/events');
            }
          }
        } else {
          // No session — check for guest participant marker
          const participant = await AsyncStorage.getItem('@guestful_participant');

          if (participant) {
            // Guest is returning — go to reveal screen
            router.replace('gallery/reveal-screen');
          } else {
            // First time or not a guest — go to onboarding
            router.replace('onboarding/slides');
          }
        }
      } catch (error) {
        console.error('Auth check error:', error);
        // On error, default to onboarding
        router.replace('onboarding/slides');
      }
    };

    checkAuthAndNavigate();
  }, []);

  // ── Supabase auth state listener ──────────────────────────────────────────

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN') {
          // User just signed in — fetch role and navigate
          const { data: userData } = await supabase
            .from('users')
            .select('role')
            .eq('id', session?.user?.id)
            .single();

          if (userData) {
            const role = userData.role as UserRole;
            if (role === 'host') {
              router.replace('dashboard/host-dashboard');
            } else if (role === 'organiser') {
              router.replace('dashboard/organiser-dashboard');
            } else if (role === 'admin') {
              router.replace('admin/events');
            }
          }
        } else if (event === 'SIGNED_OUT') {
          // User signed out — clear participant data and go to onboarding
          await AsyncStorage.removeItem('@guestful_participant');
          router.replace('onboarding/slides');
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
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  if (!fontsLoaded) {
    return null; // Fonts loading — render nothing briefly
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}
