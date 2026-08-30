import { Tabs, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCallback } from 'react';
import { Platform, useColorScheme } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

import { Colors } from '@/constants/theme';
import { getSetting, setSetting } from '@/db/queries';
import {
  REMINDER_DEFAULT_HOUR,
  REMINDER_DEFAULT_MINUTE,
  hasReminderPermission,
  initNotifications,
  requestReminderPermission,
  syncRoutineReminder,
} from '@/lib/reminders';

export default function TabsLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const iconColor = scheme === 'dark' ? '#0A84FF' : '#007AFF';
  const db = useSQLiteContext();

  // Réévalue le rappel « routine oubliée » à chaque retour sur l'app.
  useFocusEffect(
    useCallback(() => {
      void (async () => {
        if (Platform.OS === 'web') return;
        const savedEnabled = await getSetting(db, 'reminder_enabled');
        const enabled = savedEnabled === null || savedEnabled === '1';
        if (!enabled) return;

        await initNotifications();
        let permissionGranted = await hasReminderPermission();
        if (!permissionGranted) permissionGranted = await requestReminderPermission();
        if (!permissionGranted) {
          await setSetting(db, 'reminder_enabled', '0');
          return;
        }

        const hour = parseInt((await getSetting(db, 'reminder_hour')) ?? '', 10);
        const minute = parseInt((await getSetting(db, 'reminder_minute')) ?? '', 10);
        await syncRoutineReminder(
          db,
          true,
          Number.isNaN(hour) ? REMINDER_DEFAULT_HOUR : hour,
          Number.isNaN(minute) ? REMINDER_DEFAULT_MINUTE : minute
        );
      })();
    }, [db])
  );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: iconColor,
        tabBarStyle: { backgroundColor: colors.background },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Séance',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="barbell-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="historique"
        options={{
          title: 'Historique',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="time-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="arbre"
        options={{
          title: 'Arbre',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="git-network-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Stats',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="stats-chart-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="plus"
        options={{
          title: 'Réglages',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
