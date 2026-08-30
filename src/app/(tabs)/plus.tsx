import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import {
  deleteAllData,
  getSetting,
  setSetting,
} from '@/db/queries';
import { useTheme } from '@/hooks/use-theme';
import { confirm } from '@/lib/alert';
import {
  REMINDER_DEFAULT_HOUR,
  REMINDER_DEFAULT_MINUTE,
  requestReminderPermission,
  syncRoutineReminder,
} from '@/lib/reminders';

export default function MoreScreen() {
  const db = useSQLiteContext();
  const colors = useTheme();
  const [restSeconds, setRestSeconds] = useState('90');
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderHour, setReminderHour] = useState(String(REMINDER_DEFAULT_HOUR));
  const [reminderMinute, setReminderMinute] = useState(String(REMINDER_DEFAULT_MINUTE));

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const saved = await getSetting(db, 'rest_seconds');
        if (saved) setRestSeconds(saved);
        const savedReminderEnabled = await getSetting(db, 'reminder_enabled');
        setReminderEnabled(savedReminderEnabled === null || savedReminderEnabled === '1');
        const h = parseInt((await getSetting(db, 'reminder_hour')) ?? '', 10);
        const m = parseInt((await getSetting(db, 'reminder_minute')) ?? '', 10);
        if (!Number.isNaN(h)) setReminderHour(String(h));
        if (!Number.isNaN(m)) setReminderMinute(String(m));
      })();
    }, [db])
  );

  async function saveRest() {
    const v = parseInt(restSeconds, 10);
    if (!Number.isNaN(v) && v >= 0) await setSetting(db, 'rest_seconds', String(v));
  }

  /** Applique le rappel avec les valeurs du formulaire et persiste les réglages. */
  async function applyReminder(enabled: boolean, hourStr: string, minuteStr: string) {
    const hour = parseInt(hourStr, 10);
    const minute = parseInt(minuteStr, 10);
    const validHour = Number.isNaN(hour) ? REMINDER_DEFAULT_HOUR : Math.min(23, Math.max(0, hour));
    const validMinute = Number.isNaN(minute)
      ? REMINDER_DEFAULT_MINUTE
      : Math.min(59, Math.max(0, minute));
    setReminderHour(String(validHour));
    setReminderMinute(String(validMinute));
    await setSetting(db, 'reminder_enabled', enabled ? '1' : '0');
    await setSetting(db, 'reminder_hour', String(validHour));
    await setSetting(db, 'reminder_minute', String(validMinute));
    await syncRoutineReminder(db, enabled, validHour, validMinute);
  }

  async function toggleReminder(value: boolean) {
    setReminderEnabled(value);
    if (value && !(await requestReminderPermission())) {
      setReminderEnabled(false);
      await applyReminder(false, reminderHour, reminderMinute);
      return;
    }
    await applyReminder(value, reminderHour, reminderMinute);
  }

  function handleDeleteAll() {
    confirm(
      'Supprimer mes données',
      "Tes séances, séries, routines, types de séance et exercices personnels seront définitivement supprimés. Les exercices intégrés à l'app et tes associations manuelles d'import seront conservés. Cette action est irréversible.",
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Tout supprimer',
          style: 'destructive',
          onPress: async () => {
            await deleteAllData(db);
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollView
        bottomOffset={16}
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        <Text style={[styles.title, { color: colors.text }]}>Réglages</Text>

        <SectionTitle text="Réglages" color={colors.textSecondary} />
        <View style={[styles.card, { backgroundColor: colors.backgroundElement, gap: 10 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={{ color: colors.text, flex: 1 }}>Repos par défaut (secondes)</Text>
            <TextInput
              style={[
                styles.input,
                { width: 70, color: colors.text, borderColor: colors.backgroundSelected },
              ]}
              keyboardType="number-pad"
              value={restSeconds}
              onChangeText={setRestSeconds}
              onEndEditing={() => void saveRest()}
            />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text }}>Rappel routine oubliée</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                Notifie chaque jour si une routine n&apos;a pas été faite depuis 7 jours
              </Text>
            </View>
            <Switch value={reminderEnabled} onValueChange={(v) => void toggleReminder(v)} />
          </View>
          {reminderEnabled && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={{ color: colors.text, flex: 1 }}>Heure du rappel</Text>
              <TextInput
                style={[
                  styles.input,
                  { width: 56, color: colors.text, borderColor: colors.backgroundSelected },
                ]}
                keyboardType="number-pad"
                maxLength={2}
                value={reminderHour}
                onChangeText={setReminderHour}
                onEndEditing={() => void applyReminder(true, reminderHour, reminderMinute)}
              />
              <Text style={{ color: colors.text }}>:</Text>
              <TextInput
                style={[
                  styles.input,
                  { width: 56, color: colors.text, borderColor: colors.backgroundSelected },
                ]}
                keyboardType="number-pad"
                maxLength={2}
                value={reminderMinute}
                onChangeText={setReminderMinute}
                onEndEditing={() => void applyReminder(true, reminderHour, reminderMinute)}
              />
            </View>
          )}
        </View>

        <SectionTitle text="Données" color={colors.textSecondary} />
        <View style={[styles.card, { backgroundColor: colors.backgroundElement, gap: 12 }]}>
          <Pressable style={styles.dataRow} onPress={() => router.push('/importer')}>
            <Text style={{ color: '#007AFF', fontWeight: '600' }}>Importer depuis Strong (CSV)</Text>
            <Text style={{ color: colors.textSecondary }}>›</Text>
          </Pressable>
          <Pressable style={styles.dataRow} onPress={() => router.push('/export')}>
            <Text style={{ color: '#007AFF', fontWeight: '600' }}>Exporter / sauvegarder</Text>
            <Text style={{ color: colors.textSecondary }}>›</Text>
          </Pressable>
          <Pressable style={[styles.dataRow, { marginTop: 4 }]} onPress={handleDeleteAll}>
            <Text style={{ color: '#FF453A', fontWeight: '600' }}>Supprimer mes données</Text>
            <Text style={{ color: colors.textSecondary }}>›</Text>
          </Pressable>
        </View>

        <View style={{ height: 40 }} />
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

function SectionTitle({ text, color }: { text: string; color: string }) {
  return (
    <Text style={{ color, fontWeight: '700', textTransform: 'uppercase', fontSize: 12, marginTop: 8 }}>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, gap: 8 },
  title: { fontSize: 32, fontWeight: '800' },
  card: { borderRadius: 14, padding: 16 },
  input: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
