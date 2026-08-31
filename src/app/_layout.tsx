import { DarkTheme, DefaultTheme, ThemeProvider, Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import '../global.css';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { DATABASE_NAME, migrateDbIfNeeded } from '@/db';
import { checkForAppUpdate } from '@/lib/app-update';
import { initNotifications } from '@/lib/reminders';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    void initNotifications();

    // Laisse l'animation d'ouverture se terminer avant d'afficher l'alerte.
    const timeout = setTimeout(() => {
      void checkForAppUpdate();
    }, 700);

    return () => clearTimeout(timeout);
  }, []);

  return (
    <KeyboardProvider>
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
          <Stack.Screen name="progression/[id]" options={{ title: 'Progression' }} />
          <Stack.Screen name="etapes/[id]" options={{ title: 'Détail de la progression' }} />
          <Stack.Screen name="export" options={{ title: 'Export' }} />
          <Stack.Screen name="importer" options={{ title: 'Importer' }} />
          </Stack>
        </SQLiteProvider>
      </ThemeProvider>
    </KeyboardProvider>
  );
}
