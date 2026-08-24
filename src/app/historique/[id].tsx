import { useCallback, useState } from 'react';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';

import {
  deleteWorkout,
  duplicateWorkout,
  estimate1rm,
  getWorkoutDetail,
} from '@/db/queries';
import { SIDE_LABELS } from '@/components/workout-exercise-card';
import type { WorkoutSet } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';
import { confirm } from '@/lib/alert';

type Detail = Awaited<ReturnType<typeof getWorkoutDetail>>;

export default function WorkoutDetailScreen() {
  const db = useSQLiteContext();
  const colors = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [detail, setDetail] = useState<Detail>(null);

  useFocusEffect(
    useCallback(() => {
      void getWorkoutDetail(db, Number(id)).then(setDetail);
    }, [db, id])
  );

  if (!detail) return null;

  const duration =
    detail.ended_at && detail.started_at
      ? Math.round((detail.ended_at - detail.started_at) / 60000)
      : null;

  async function handleDuplicate() {
    await duplicateWorkout(db, detail!.id);
    router.back();
  }

  function handleDelete() {
    confirm('Supprimer la séance', 'Cette action est irréversible.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await deleteWorkout(db, detail!.id);
          router.back();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>{detail.name || 'Séance'}</Text>
        <Text style={{ color: colors.textSecondary }}>
          {detail.date}
          {duration !== null ? ` · ${duration} min` : ''}
        </Text>
        {detail.notes ? (
          <Text style={{ color: colors.textSecondary, fontStyle: 'italic' }}>{detail.notes}</Text>
        ) : null}

        {detail.exercises.map((group) => (
          <Pressable
            key={`${group.exercise.id}|${group.side ?? ''}`}
            style={[styles.card, { backgroundColor: colors.backgroundElement }]}
            onPress={() => router.push(`/exercice/${group.exercise.id}`)}
            android_ripple={{ color: colors.border }}>
            <Text style={[styles.exerciseName, { color: colors.text }]}>
            {group.exercise.name}
            {group.side ? ` — ${SIDE_LABELS[group.side]}` : ''}
          </Text>
            {group.sets
              .filter((s) => s.done)
              .map((s, i) => (
                <SetLine key={s.id} index={i + 1} set={s} />
              ))}
            {group.sets.every((s) => !s.done) && (
              <Text style={{ color: colors.textSecondary }}>Aucune série validée</Text>
            )}
          </Pressable>
        ))}

        <View style={styles.actions}>
          <Pressable style={[styles.button, { backgroundColor: '#007AFF' }]} onPress={handleDuplicate}>
            <Text style={styles.buttonText}>Dupliquer</Text>
          </Pressable>
          <Pressable
            style={[styles.button, { borderWidth: 1.5, borderColor: '#FF453A' }]}
            onPress={handleDelete}>
            <Text style={[styles.buttonText, { color: '#FF453A' }]}>Supprimer</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SetLine({ index, set }: { index: number; set: WorkoutSet }) {
  const colors = useTheme();
  if (set.duration !== null && set.duration !== undefined) {
    return (
      <View style={styles.setLine}>
        <Text style={{ color: colors.textSecondary, width: 20 }}>{index}</Text>
        <Text style={{ color: colors.text }}>{set.duration} s</Text>
      </View>
    );
  }
  return (
    <View style={styles.setLine}>
      <Text style={{ color: colors.textSecondary, width: 20 }}>{index}</Text>
      <Text style={{ color: colors.text }}>
        {set.weight > 0 ? `${set.weight} kg` : 'Poids du corps'}
      </Text>
      <Text style={{ color: colors.text }}> × {set.reps} reps</Text>
      {set.weight > 0 && set.reps > 0 && (
        <Text style={{ color: colors.textSecondary, marginLeft: 8 }}>
          (1RM ≈ {Math.round(estimate1rm(set.weight, set.reps))} kg)
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: '800' },
  card: { borderRadius: 14, padding: 16 },
  exerciseName: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  setLine: { flexDirection: 'row', alignItems: 'center', paddingVertical: 2 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 8, marginBottom: 32 },
  button: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '700' },
});
