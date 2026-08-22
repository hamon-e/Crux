import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { useSQLiteContext } from 'expo-sqlite';

import { useTheme } from '@/hooks/use-theme';

function csvEscape(value: unknown): string {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function makeFilename(ext: string) {
  return `strong-export-${Date.now()}.${ext}`;
}

async function buildJson(db: ReturnType<typeof useSQLiteContext>) {
  return JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      exercises: await db.getAllAsync('SELECT * FROM exercises'),
      workouts: await db.getAllAsync('SELECT * FROM workouts'),
      sets: await db.getAllAsync('SELECT * FROM sets'),
      templates: await db.getAllAsync('SELECT * FROM templates'),
      template_exercises: await db.getAllAsync('SELECT * FROM template_exercises'),
      settings: await db.getAllAsync('SELECT * FROM settings'),
    },
    null,
    2
  );
}

async function buildCsv(db: ReturnType<typeof useSQLiteContext>) {
  const rows = await db.getAllAsync<{
    date: string;
    workout_name: string;
    exercise_name: string;
    muscle: string;
    weight: number;
    reps: number;
    done: number;
  }>(
    `SELECT w.date, w.name AS workout_name, e.name AS exercise_name, e.muscle,
            s.weight, s.reps, s.done
     FROM sets s
     JOIN workouts w ON w.id = s.workout_id
     JOIN exercises e ON e.id = s.exercise_id
     WHERE w.completed = 1 ORDER BY w.started_at, s.set_order`
  );
  const header = 'date,seance,exercice,muscle,poids,reps,validee\n';
  const body = rows
    .map((r) =>
      [r.date, r.workout_name, r.exercise_name, r.muscle, r.weight, r.reps, r.done]
        .map(csvEscape)
        .join(',')
    )
    .join('\n');
  return header + body;
}

async function share(file: File, setStatus: (s: string) => void) {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: file.extension === '.json' ? 'application/json' : 'text/csv',
      dialogTitle: 'Exporter les données',
    });
    setStatus(`Fichier créé : ${file.name}`);
  } else {
    setStatus(`Sauvegardé dans : ${file.uri}`);
  }
}

export default function ExportScreen() {
  const db = useSQLiteContext();
  const colors = useTheme();
  const [status, setStatus] = useState<string | null>(null);

  async function exportJson() {
    const json = await buildJson(db);
    const file = new File(Paths.cache, makeFilename('json'));
    file.create({ overwrite: true });
    file.write(json);
    await share(file, setStatus);
  }

  async function exportCsv() {
    const content = await buildCsv(db);
    const file = new File(Paths.cache, makeFilename('csv'));
    file.create({ overwrite: true });
    file.write(content);
    await share(file, setStatus);
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>Exporter / Sauvegarder</Text>
        <Text style={{ color: colors.textSecondary }}>
          Toutes tes données restent sur ton appareil. Exporte un fichier pour les partager ou les
          sauvegarder.
        </Text>

        <View style={styles.actions}>
          <Pressable
            style={[styles.button, { backgroundColor: '#007AFF' }]}
            onPress={() => void exportCsv()}>
            <Text style={styles.buttonText}>Exporter en CSV</Text>
          </Pressable>
          <Pressable
            style={[styles.button, { backgroundColor: '#30D158' }]}
            onPress={() => void exportJson()}>
            <Text style={styles.buttonText}>Backup complet (JSON)</Text>
          </Pressable>
        </View>

        {status && <Text style={{ color: colors.textSecondary }}>{status}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: Platform.select({ ios: 24 }) ?? 16,
    paddingTop: 12,
    gap: 12,
  },
  title: { fontSize: 28, fontWeight: '800' },
  actions: { gap: 12, marginTop: 8 },
  button: { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
