import React, { useEffect, useRef } from 'react';
import { Stack, useNavigationContainerRef, LinkingOptions } from 'expo-router';
import { useFonts } from 'expo-font';
import { PlayfairDisplay_400Regular, PlayfairDisplay_700Bold } from '@expo-google-fonts/playfair-display';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase/client';
import { registerForPushNotifications } from '../shared/notifications';
import type { UserRole } from '../shared/types';

// ── Linking configuration for deep links ──────────────────────────────────────

const linking: LinkingOptions<any> = {
  prefixes: ['guestfulclicks://', 'https://join.guestfulclicks.com'],
  config: {
    screens: {
      'guest/join': ':code',
    },
  },
};

// ── Root layout with auth and notification setup ───────────────────────────────

export default function RootLayout() {
  const navigationRef = useNavigationContainerRef();
  const notificationListener = useRef<any>();
  const responseListener = useRef<any>();

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
              navigationRef.navigate('dashboard/host-dashboard');
            } else if (role === 'organiser') {
              navigationRef.navigate('dashboard/organiser-dashboard');
            } else if (role === 'admin') {
              navigationRef.navigate('admin/events');
            }
          }
        } else {
          // No session — check for guest participant marker
          const participant = await AsyncStorage.getItem('@guestful_participant');

          if (participant) {
            // Guest is returning — go to reveal screen
            navigationRef.navigate('gallery/reveal-screen');
          } else {
            // First time or not a guest — go to onboarding
            navigationRef.navigate('onboarding/slides');
          }
        }
      } catch (error) {
        console.error('Auth check error:', error);
        // On error, default to onboarding
        navigationRef.navigate('onboarding/slides');
      }
    };

    checkAuthAndNavigate();
  }, [navigationRef]);

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
              navigationRef.navigate('dashboard/host-dashboard');
            } else if (role === 'organiser') {
              navigationRef.navigate('dashboard/organiser-dashboard');
            } else if (role === 'admin') {
              navigationRef.navigate('admin/events');
            }
          }
        } else if (event === 'SIGNED_OUT') {
          // User signed out — clear participant data and go to onboarding
          await AsyncStorage.removeItem('@guestful_participant');
          navigationRef.navigate('onboarding/slides');
        }
      },
    );

    return () => {
      subscription?.unsubscribe();
    };
  }, [navigationRef]);

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
          navigationRef.navigate('gallery/reveal-screen');
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
  }, [navigationRef]);

  if (!fontsLoaded) {
    return null; // Fonts loading — render nothing briefly
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animationEnabled: true,
      }}
    />
  );
}
