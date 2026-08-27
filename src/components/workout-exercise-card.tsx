import { useRef, useState } from 'react';
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

interface CenteredNumberInputProps {
  value: string;
  keyboardType: 'decimal-pad' | 'number-pad';
  color: string;
  borderColor: string;
  onEndEditing: (value: string) => void;
}

function CenteredNumberInput({
  value: initialValue,
  keyboardType,
  color,
  borderColor,
  onEndEditing,
}: CenteredNumberInputProps) {
  const inputRef = useRef<TextInput>(null);
  const [editedValue, setEditedValue] = useState({ initialValue, value: initialValue });
  const value = editedValue.initialValue === initialValue ? editedValue.value : initialValue;

  // `textAlign: 'center'` blocks a parent ScrollView from taking over a drag on Android.
  // Instead, keep the native input left-aligned and center its content-sized box.
  const inputWidth = Math.max(24, Math.min(84, value.length * 10 + 8));

  return (
    <Pressable
      style={[styles.inputShell, { borderColor }]}
      onPress={() => inputRef.current?.focus()}>
      <TextInput
        ref={inputRef}
        style={[styles.input, { color, width: inputWidth }]}
        keyboardType={keyboardType}
        rejectResponderTermination={false}
        value={value}
        onChangeText={(nextValue) => setEditedValue({ initialValue, value: nextValue })}
        onEndEditing={(event) => onEndEditing(event.nativeEvent.text)}
      />
    </Pressable>
  );
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
          </Text>
          {side && (
            <View style={styles.sideTag}>
              <Text style={styles.sideTagText}>{SIDE_LABELS[side]}</Text>
            </View>
          )}
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
              <Text
                style={[styles.colInput, styles.centeredLabel, { color: colors.textSecondary }]}>
                Durée (s)
              </Text>
            ) : (
              <>
                <Text
                  style={[styles.colInput, styles.centeredLabel, { color: colors.textSecondary }]}>
                  Poids (kg)
                </Text>
                <Text
                  style={[styles.colInput, styles.centeredLabel, { color: colors.textSecondary }]}>
                  Reps
                </Text>
              </>
            )}
            <Text style={[styles.colDone, { color: colors.textSecondary }]}>✓</Text>
            {onDeleteSet && <View style={styles.colDelete} />}
          </View>

          {sets.map((s, i) => (
            <View key={s.id} style={styles.setRow}>
              <Text style={[styles.colIndex, { color: colors.text }]}>{i + 1}</Text>
              {timed ? (
                <CenteredNumberInput
                  value={String(s.duration ?? 0)}
                  keyboardType="number-pad"
                  color={colors.text}
                  borderColor={colors.backgroundSelected}
                  onEndEditing={(text) => {
                    const v = parseInt(text, 10);
                    if (!Number.isNaN(v)) onUpdateSet(s.id, { duration: Math.max(0, v) });
                  }}
                />
              ) : (
                <>
                  <CenteredNumberInput
                    value={String(s.weight)}
                    keyboardType="decimal-pad"
                    color={colors.text}
                    borderColor={colors.backgroundSelected}
                    onEndEditing={(text) => {
                      const v = parseFloat(text.replace(',', '.'));
                      if (!Number.isNaN(v)) onUpdateSet(s.id, { weight: v });
                    }}
                  />
                  <CenteredNumberInput
                    value={String(s.reps)}
                    keyboardType="number-pad"
                    color={colors.text}
                    borderColor={colors.backgroundSelected}
                    onEndEditing={(text) => {
                      const v = parseInt(text, 10);
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
  sideTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#007AFF22',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  sideTagText: { color: '#007AFF', fontSize: 11, fontWeight: '800' },
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
  },
  centeredLabel: {
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
  inputShell: {
    flex: 1,
    minHeight: 38,
    marginHorizontal: 4,
    borderWidth: 1.5,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    fontSize: 16,
    padding: 0,
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
