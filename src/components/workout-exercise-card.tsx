import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ExerciseImage } from '@/components/exercise-image';

import type { Exercise, SetSide, WorkoutSet } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';

export const SIDE_LABELS: Record<SetSide, string> = {
  right: 'Côté droit',
  left: 'Côté gauche',
};

interface Props {
  exercise: Exercise;
  sets: WorkoutSet[];
  side?: SetSide | null;
  previousTop?: { weight: number; reps: number } | null;
  onAddSet: () => void;
  onUpdateSet: (setId: number, updates: { weight?: number; reps?: number; duration?: number; done?: number }) => void;
  onDeleteSet?: (setId: number) => void;
  onRemoveExercise?: () => void;
}

export function WorkoutExerciseCard({
  exercise,
  sets,
  side,
  previousTop,
  onAddSet,
  onUpdateSet,
  onDeleteSet,
  onRemoveExercise,
}: Props) {
  const colors = useTheme();
  const [expanded, setExpanded] = useState(true);
  // Exercice chronométré : toutes ses séries portent une durée (secondes).
  const timed = sets.length > 0 && sets.every((s) => s.duration !== null && s.duration !== undefined);

  return (
    <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
      <Pressable style={styles.header} onPress={() => setExpanded((e) => !e)}>
        <ExerciseImage name={exercise.name} muscle={exercise.muscle} width={56} radius={6} />
        <View style={[styles.headerText, { marginLeft: 10 }]}>
          <Text style={[styles.exerciseName, { color: colors.text }]} numberOfLines={2}>
            {exercise.name}
            {side ? ' — ' : ''}
            {side ? SIDE_LABELS[side] : ''}
          </Text>
          <Text style={{ color: colors.textSecondary }}>
            {previousTop
              ? `Précédent : ${previousTop.weight} kg × ${previousTop.reps}`
              : `${exercise.muscle} · ${exercise.equipment}`}
          </Text>
        </View>
        {onRemoveExercise && (
          <Pressable hitSlop={8} onPress={onRemoveExercise}>
            <Text style={{ color: '#FF453A' }}>Retirer</Text>
          </Pressable>
        )}
      </Pressable>

      {expanded && (
        <>
          <View style={[styles.setRowHeader]}>
            <Text style={[styles.colIndex, { color: colors.textSecondary }]}>#</Text>
            {timed ? (
              <Text style={[styles.colInput, { color: colors.textSecondary }]}>Durée (s)</Text>
            ) : (
              <>
                <Text style={[styles.colInput, { color: colors.textSecondary }]}>Poids (kg)</Text>
                <Text style={[styles.colInput, { color: colors.textSecondary }]}>Reps</Text>
              </>
            )}
            <Text style={[styles.colDone, { color: colors.textSecondary }]}>✓</Text>
            {onDeleteSet && <View style={styles.colDelete} />}
          </View>

          {sets.map((s, i) => (
            <View key={s.id} style={styles.setRow}>
              <Text style={[styles.colIndex, { color: colors.text }]}>{i + 1}</Text>
              {timed ? (
                <TextInput
                  style={[
                    styles.input,
                    styles.colInput,
                    { color: colors.text, borderColor: colors.backgroundSelected },
                  ]}
                  keyboardType="number-pad"
                  defaultValue={String(s.duration ?? 0)}
                  onEndEditing={(e) => {
                    const v = parseInt(e.nativeEvent.text, 10);
                    if (!Number.isNaN(v)) onUpdateSet(s.id, { duration: Math.max(0, v) });
                  }}
                />
              ) : (
                <>
                  <TextInput
                    style={[
                      styles.input,
                      styles.colInput,
                      { color: colors.text, borderColor: colors.backgroundSelected },
                    ]}
                    keyboardType="decimal-pad"
                    defaultValue={String(s.weight)}
                    onEndEditing={(e) => {
                      const v = parseFloat(e.nativeEvent.text.replace(',', '.'));
                      if (!Number.isNaN(v)) onUpdateSet(s.id, { weight: v });
                    }}
                  />
                  <TextInput
                    style={[
                      styles.input,
                      styles.colInput,
                      { color: colors.text, borderColor: colors.backgroundSelected },
                    ]}
                    keyboardType="number-pad"
                    defaultValue={String(s.reps)}
                    onEndEditing={(e) => {
                      const v = parseInt(e.nativeEvent.text, 10);
                      if (!Number.isNaN(v)) onUpdateSet(s.id, { reps: v });
                    }}
                  />
                </>
              )}
              <Pressable
                style={[styles.doneButton, s.done ? { backgroundColor: '#30D158' } : { borderColor: colors.backgroundSelected, borderWidth: 1.5 }]}
                onPress={() => onUpdateSet(s.id, { done: s.done ? 0 : 1 })}>
                {s.done ? <Text style={styles.doneCheck}>✓</Text> : null}
              </Pressable>
              {onDeleteSet && (
                <Pressable hitSlop={8} style={styles.colDelete} onPress={() => onDeleteSet(s.id)}>
                  <Text style={{ color: '#FF453A' }}>×</Text>
                </Pressable>
              )}
            </View>
          ))}

          <Pressable
            style={[styles.addSetButton, { borderColor: colors.backgroundSelected }]}
            onPress={onAddSet}>
            <Text style={{ color: '#007AFF', fontWeight: '600' }}>+ Ajouter une série</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  exerciseName: {
    fontSize: 16,
    fontWeight: '700',
  },
  setRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  colIndex: {
    width: 24,
    textAlign: 'center',
    fontSize: 13,
  },
  colInput: {
    flex: 1,
    marginHorizontal: 4,
    textAlign: 'center',
  },
  colDone: {
    width: 32,
    textAlign: 'center',
    fontSize: 13,
  },
  colDelete: {
    width: 28,
    alignItems: 'center',
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 16,
    textAlign: 'center',
  },
  doneButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneCheck: {
    color: '#fff',
    fontWeight: '800',
  },
  addSetButton: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
    marginTop: 2,
  },
});
