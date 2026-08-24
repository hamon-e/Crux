import { DarkTheme, DefaultTheme, ThemeProvider, Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import '../global.css';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { DATABASE_NAME, migrateDbIfNeeded } from '@/db';
import { initNotifications } from '@/lib/reminders';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    void initNotifications();
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrateDbIfNeeded}>
        <AnimatedSplashOverlay />
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="ajouter-exercice"
            options={{ title: 'Ajouter un exercice', presentation: 'modal' }}
          />
          <Stack.Screen
            name="ajouter-seance"
            options={{ title: 'Ajouter une séance', presentation: 'modal' }}
          />
          <Stack.Screen name="historique/[id]" options={{ title: 'Séance' }} />
          <Stack.Screen name="routines/[id]" options={{ title: 'Routine' }} />
          <Stack.Screen name="exercice/[id]" options={{ title: 'Exercice' }} />
          <Stack.Screen name="export" options={{ title: 'Export' }} />
          <Stack.Screen name="importer" options={{ title: 'Importer' }} />
        </Stack>
      </SQLiteProvider>
    </ThemeProvider>
  );
}
