import { useCallback, useState } from 'react';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';

import { ExerciseImage } from '@/components/exercise-image';
import {
  deleteTemplate,
  getTemplateDetail,
  removeTemplateExercise,
  renameTemplate,
  setTemplateExerciseSetCount,
  startWorkout,
  updateTemplateSet,
} from '@/db/queries';
import type { Exercise, TemplateExercise, TemplateSet } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';
import { confirm } from '@/lib/alert';

type Detail = NonNullable<Awaited<ReturnType<typeof getTemplateDetail>>>;

export default function RoutineEditorScreen() {
  const db = useSQLiteContext();
  const colors = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);

  useFocusEffect(
    useCallback(() => {
      void getTemplateDetail(db, Number(id)).then(setDetail);
    }, [db, id])
  );

  if (!detail) return null;

  async function handleRename(name: string) {
    await renameTemplate(db, detail!.id, name);
    await getTemplateDetail(db, detail!.id).then(setDetail);
  }

  function handleDelete() {
    confirm('Supprimer la routine', 'Cette action est irréversible.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await deleteTemplate(db, detail!.id);
          router.back();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <TextInput
          style={[styles.nameInput, { color: colors.text }]}
          defaultValue={detail.name}
          onEndEditing={(e) => handleRename(e.nativeEvent.text)}
        />

        {detail.exercises.length === 0 && (
          <Text style={{ color: colors.textSecondary }}>
            Ajoute des exercices pour composer ta routine.
          </Text>
        )}
        {detail.exercises.map((te) => (
          <View
            key={te.id}
            style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
            <View style={styles.cardHeader}>
              <ExerciseImage name={te.exercise.name} muscle={te.exercise.muscle} width={48} radius={6} />
              <Text style={[styles.exerciseName, { color: colors.text }]}>{te.exercise.name}</Text>
              <Pressable hitSlop={8} onPress={() => void removeTe(te)}>
                <Text style={{ color: '#FF453A' }}>×</Text>
              </Pressable>
            </View>
            <Stepper
              label="séries"
              value={te.sets.length}
              min={1}
              colors={colors}
              onChange={(delta) => void changeSetCount(te, Math.max(1, te.sets.length + delta))}
            />
            {te.sets.map((ts, i) => (
              <View key={ts.id} style={styles.setRow}>
                <Text style={{ color: colors.textSecondary, width: 28 }}>S{i + 1}</Text>
                <Stepper
                  label="reps"
                  value={ts.target_reps}
                  min={1}
                  step={ts.target_reps >= 20 ? 5 : 1}
                  colors={colors}
                  onChange={(delta) => void updateTs(ts, { target_reps: Math.max(1, ts.target_reps + delta) })}
                />
                <Stepper
                  label="kg"
                  value={ts.target_weight ?? 0}
                  min={0}
                  step={2.5}
                  format={(v) => Number.isInteger(v) ? String(v) : v.toFixed(1)}
                  colors={colors}
                  onChange={(delta) =>
                    void updateTs(ts, {
                      target_weight: Math.max(0, Math.round(((ts.target_weight ?? 0) + delta) * 10) / 10),
                    })
                  }
                />
              </View>
            ))}
          </View>
        ))}

        <Pressable
          style={[styles.addButton, { borderColor: colors.backgroundSelected }]}
          onPress={() =>
            router.push({ pathname: '/ajouter-exercice', params: { mode: 'template', templateId: String(detail.id) } })
          }>
          <Text style={{ color: '#007AFF', fontWeight: '600' }}>+ Exercice</Text>
        </Pressable>

        <View style={styles.actions}>
          <Pressable
            style={[styles.button, { backgroundColor: '#007AFF' }]}
            onPress={async () => {
              await startWorkout(db, detail.id);
              router.replace('/(tabs)');
            }}>
            <Text style={styles.buttonText}>Démarrer avec cette routine</Text>
          </Pressable>
          <Pressable style={[styles.deleteButton]} onPress={handleDelete}>
            <Text style={{ color: '#FF453A', fontWeight: '600' }}>Supprimer</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );

  async function removeTe(te: TemplateExercise & { exercise: Exercise; sets: TemplateSet[] }) {
    await removeTemplateExercise(db, te.id);
    await getTemplateDetail(db, Number(id)).then(setDetail);
  }

  async function changeSetCount(
    te: TemplateExercise & { exercise: Exercise; sets: TemplateSet[] },
    count: number
  ) {
    await setTemplateExerciseSetCount(db, te.id, count);
    await getTemplateDetail(db, Number(id)).then(setDetail);
  }

  async function updateTs(ts: TemplateSet, updates: { target_reps?: number; target_weight?: number }) {
    await updateTemplateSet(db, ts.id, updates);
    await getTemplateDetail(db, Number(id)).then(setDetail);
  }
}

function Stepper({
  label,
  value,
  min = 1,
  step = 1,
  format,
  colors,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  step?: number;
  format?: (value: number) => string;
  colors: ReturnType<typeof useTheme>;
  onChange: (delta: number) => void;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable
        hitSlop={8}
        disabled={value <= min}
        onPress={() => onChange(-step)}>
        <Text style={{ color: value <= min ? colors.textSecondary : '#007AFF', fontWeight: '700' }}>−</Text>
      </Pressable>
      <Text style={{ color: colors.textSecondary }}>
        {format ? format(value) : value} {label}
      </Text>
      <Pressable hitSlop={8} onPress={() => onChange(step)}>
        <Text style={{ color: '#007AFF', fontWeight: '700' }}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, gap: 12 },
  nameInput: { fontSize: 26, fontWeight: '800' },
  card: {
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  exerciseName: { flex: 1, fontWeight: '700' },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addButton: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  actions: { gap: 12, marginTop: 12, marginBottom: 32 },
  button: { borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  deleteButton: { alignItems: 'center', paddingVertical: 6 },
  buttonText: { color: '#fff', fontWeight: '700' },
});
