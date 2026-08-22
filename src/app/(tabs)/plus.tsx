import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { createTemplate, deleteAllData, getSetting, getTemplates, setSetting } from '@/db/queries';
import { useTheme } from '@/hooks/use-theme';
import { confirm } from '@/lib/alert';

export const ROUTINE_COLORS = [
  '#4a90d9',
  '#34c759',
  '#ff9500',
  '#af52de',
  '#ff2d55',
  '#5ac8fa',
  '#ffd60a',
  '#8e8e93',
];

export default function MoreScreen() {
  const db = useSQLiteContext();
  const colors = useTheme();
  const [templates, setTemplates] = useState<(Awaited<ReturnType<typeof getTemplates>>)[number][]>([]);
  const [newRoutineName, setNewRoutineName] = useState('');
  const [newRoutineColor, setNewRoutineColor] = useState(ROUTINE_COLORS[0]);
  const [restSeconds, setRestSeconds] = useState('90');

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        setTemplates(await getTemplates(db));
        const saved = await getSetting(db, 'rest_seconds');
        if (saved) setRestSeconds(saved);
      })();
    }, [db])
  );

  async function addRoutine() {
    if (!newRoutineName.trim()) return;
    const id = await createTemplate(db, newRoutineName.trim(), newRoutineColor);
    setNewRoutineName('');
    router.push(`/routines/${id}`);
  }

  async function saveRest() {
    const v = parseInt(restSeconds, 10);
    if (!Number.isNaN(v) && v >= 0) await setSetting(db, 'rest_seconds', String(v));
  }

  function handleDeleteAll() {
    confirm(
      'Supprimer toutes les données',
      'Séances, séries, routines et exercices personnalisés seront définitivement supprimés. Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Tout supprimer',
          style: 'destructive',
          onPress: async () => {
            await deleteAllData(db);
            setTemplates([]);
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>Plus</Text>

        <SectionTitle text="Routines" color={colors.textSecondary} />
        <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TextInput
              style={[
                styles.input,
                styles.flex1,
                { color: colors.text, borderColor: colors.backgroundSelected },
              ]}
              placeholder="Nom de la routine"
              placeholderTextColor={colors.textSecondary}
              value={newRoutineName}
              onChangeText={setNewRoutineName}
            />
            <Pressable
              style={[styles.addButton, { backgroundColor: '#007AFF' }]}
              onPress={() => void addRoutine()}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Créer</Text>
            </Pressable>
          </View>
          <View style={styles.colorRow}>
            {ROUTINE_COLORS.map((c) => (
              <Pressable
                key={c}
                style={[
                  styles.colorSwatch,
                  {
                    backgroundColor: c,
                    borderWidth: newRoutineColor === c ? 3 : 0,
                    borderColor: colors.text,
                  },
                ]}
                onPress={() => setNewRoutineColor(c)}
              />
            ))}
          </View>
          {templates.map((t) => (
            <Pressable
              key={t.id}
              style={styles.routineRow}
              onPress={() => router.push(`/routines/${t.id}`)}>
              <View
                style={[styles.routineDot, { backgroundColor: t.color || ROUTINE_COLORS[0] }]}
              />
              <Text style={{ color: colors.text, flex: 1 }}>{t.name}</Text>
              <Text style={{ color: colors.textSecondary }}>
                {t.exercise_count} exercices ›
              </Text>
            </Pressable>
          ))}
        </View>

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
            <Text style={{ color: '#FF453A', fontWeight: '600' }}>Supprimer toutes les données</Text>
            <Text style={{ color: colors.textSecondary }}>›</Text>
          </Pressable>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
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
  flex1: { flex: 1 },
  addButton: {
    borderRadius: 10,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#8884',
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  colorSwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  routineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
