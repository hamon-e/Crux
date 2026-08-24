import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';

export const REMINDER_IDENTIFIER = 'routine-inactivity';
const CHANNEL_ID = 'reminders';
const DAY_MS = 24 * 60 * 60 * 1000;

export const REMINDER_DEFAULT_HOUR = 18;
export const REMINDER_DEFAULT_MINUTE = 0;

function isGranted(status: Notifications.NotificationPermissionsStatus) {
  return status.granted || status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

/** Handler d'affichage + canal Android. À appeler une fois au démarrage. */
export async function initNotifications() {
  if (Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Rappels',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
}

export async function hasReminderPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  return isGranted(await Notifications.getPermissionsAsync());
}

export async function requestReminderPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  return isGranted(await Notifications.requestPermissionsAsync());
}

/** Routines dont la dernière séance terminée date de plus de 7 jours (ou jamais faite). */
async function getStaleRoutineNames(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ name: string; last: number | null }>(
    `SELECT t.name AS name, MAX(w.started_at) AS last
     FROM templates t
     LEFT JOIN workouts w ON w.template_id = t.id AND w.completed = 1
     GROUP BY t.id ORDER BY t.name`
  );
  const cutoff = Date.now() - 7 * DAY_MS;
  return rows.filter((r) => r.last === null || r.last < cutoff).map((r) => r.name);
}

/**
 * Replanifie (ou annule) le rappel quotidien : notifie à l'heure choisie tant
 * qu'une routine n'a pas été faite depuis au moins 7 jours.
 * À appeler au démarrage / retour sur l'app et après chaque séance terminée.
 */
export async function syncRoutineReminder(
  db: SQLiteDatabase,
  enabled: boolean,
  hour: number,
  minute: number
) {
  if (Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync(REMINDER_IDENTIFIER).catch(() => {});
  if (!enabled || !(await hasReminderPermission())) return;

  const stale = await getStaleRoutineNames(db);
  if (stale.length === 0) return;

  const names = stale.slice(0, 3).join(', ');
  const more = stale.length > 3 ? ` et ${stale.length - 3} autre(s)` : '';
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_IDENTIFIER,
    content: {
      title: 'On garde le rythme ? 💪',
      body: `Pas de séance depuis 7 jours ou plus : ${names}${more}.`,
      sound: false,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId: CHANNEL_ID,
    },
  });
}
