import { useCallback, useState } from 'react';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import type { PanGesture } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { ExerciseImage } from '@/components/exercise-image';
import { ROUTINE_COLORS } from '@/constants/routine-colors';
import {
  deleteTemplate,
  getTemplateDetail,
  removeTemplateExercise,
  renameTemplate,
  reorderTemplateExercises,
  setTemplateExerciseSetCount,
  startWorkout,
  updateTemplateColor,
  updateTemplateExercise,
  updateTemplateSet,
  validateRoutineOnDate,
} from '@/db/queries';
import type { Exercise, SetType, TemplateExercise, TemplateSet } from '@/db/types';
import { PastDatePickerModal, formatFrDate } from '@/components/past-date-picker';
import { useTheme } from '@/hooks/use-theme';
import { confirm } from '@/lib/alert';

type Detail = NonNullable<Awaited<ReturnType<typeof getTemplateDetail>>>;
type Te = TemplateExercise & { exercise: Exercise; sets: TemplateSet[] };

const CARD_GAP = 12;

type Slot = { id: number; y: number; h: number };
type SlotSV = SharedValue<Slot[]>;

export default function RoutineEditorScreen() {
  const db = useSQLiteContext();
  const colors = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [pastDateOpen, setPastDateOpen] = useState(false);

  // État du drag & drop partagé entre toutes les cartes (UI thread).
  const slots = useSharedValue<Slot[]>([]);
  const dragId = useSharedValue<number | null>(null);
  const fromIndex = useSharedValue(-1);
  const hoverIndex = useSharedValue(-1);
  const dragY = useSharedValue(0);
  const dragH = useSharedValue(0);

  function makePan(te: Te) {
    return Gesture.Pan()
      .activateAfterLongPress(250)
      .onStart(() => {
        const me = slots.value.find((s) => s.id === te.id);
        if (!me) return;
        dragId.value = te.id;
        dragH.value = me.h;
        dragY.value = 0;
        const idx = slots.value.findIndex((s) => s.id === te.id);
        fromIndex.value = idx;
        hoverIndex.value = idx;
      })
      .onUpdate((e) => {
        if (dragId.value !== te.id) return;
        dragY.value = e.translationY;
        const me = slots.value.find((s) => s.id === te.id);
        if (!me) return;
        const center = me.y + me.h / 2 + e.translationY;
        let idx = 0;
        for (const s of slots.value) {
          if (s.id === te.id) continue;
          if (s.y + s.h / 2 < center) idx++;
        }
        hoverIndex.value = Math.min(idx, Math.max(0, slots.value.length - 1));
      })
      .onEnd(() => {
        if (dragId.value !== te.id) return;
        const to = hoverIndex.value;
        dragId.value = null;
        dragY.value = 0;
        hoverIndex.value = -1;
        fromIndex.value = -1;
        if (to >= 0) runOnJS(handleDrop)(te.id, to);
      });
  }

  function handleSlotLayout(slotId: number, y: number, h: number) {
    const next = [...slots.value];
    const i = next.findIndex((s) => s.id === slotId);
    const entry = { id: slotId, y, h };
    if (i >= 0) next[i] = entry;
    else next.push(entry);
    next.sort((a, b) => a.y - b.y);
    slots.value = next;
  }

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

  async function handleColor(color: string) {
    await updateTemplateColor(db, detail!.id, color);
    await getTemplateDetail(db, detail!.id).then(setDetail);
  }

  function handleValidatePastPress() {
    setPastDateOpen(true);
  }

  function handleValidatePast(date: string) {
    setPastDateOpen(false);
    confirm(
      'Valider la séance',
      `Marquer « ${detail!.name} » comme faite le ${formatFrDate(date)} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Valider',
          onPress: async () => {
            await validateRoutineOnDate(db, detail!.id, date);
            router.back();
          },
        },
      ]
    );
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

  function handleDrop(draggedId: number, toIndex: number) {
    const cur = detail;
    if (!cur) return;
    const arr = [...cur.exercises];
    const from = arr.findIndex((e) => e.id === draggedId);
    if (from < 0) return;
    const [item] = arr.splice(from, 1);
    const target = Math.max(0, Math.min(toIndex, arr.length));
    if (target === from) return;
    arr.splice(target, 0, item);
    setDetail({ ...cur, exercises: arr });
    void reorderTemplateExercises(db, arr.map((e) => e.id));
  }

  return (
    <GestureHandlerRootView style={styles.container}>
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollView
        bottomOffset={16}
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        <TextInput
          style={[styles.nameInput, { color: colors.text }]}
          defaultValue={detail.name}
          onEndEditing={(e) => handleRename(e.nativeEvent.text)}
        />

        <View style={styles.colorRow}>
          {ROUTINE_COLORS.map((c) => (
            <Pressable
              key={c}
              style={[
                styles.colorSwatch,
                {
                  backgroundColor: c,
                  borderWidth: (detail.color || ROUTINE_COLORS[0]) === c ? 3 : 0,
                  borderColor: colors.text,
                },
              ]}
              onPress={() => void handleColor(c)}
            />
          ))}
        </View>

        {detail.exercises.length === 0 && (
          <Text style={{ color: colors.textSecondary }}>
            Ajoute des exercices pour composer ta routine.
          </Text>
        )}
        {detail.exercises.map((te) => (
          <SortableExercise
            key={te.id}
            te={te}
            colors={colors}
            slots={slots}
            dragId={dragId}
            fromIndex={fromIndex}
            hoverIndex={hoverIndex}
            dragY={dragY}
            dragH={dragH}
            pan={makePan(te)}
            onSlotLayout={handleSlotLayout}
            onDrop={handleDrop}
            onRemove={() => void removeTe(te)}
            onChangeSetCount={(delta) => void changeSetCount(te, Math.max(1, te.sets.length + delta))}
            onChangeType={(t) => void changeType(te, t)}
            onUpdateSet={(ts, updates) => void updateTs(ts, updates)}
          />
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
              router.dismissTo('/');
            }}>
            <Text style={styles.buttonText}>Démarrer avec cette routine</Text>
          </Pressable>
          <Pressable style={[styles.deleteButton]} onPress={handleValidatePastPress}>
            <Text style={{ color: '#007AFF', fontWeight: '600' }}>Valider pour un jour passé</Text>
          </Pressable>
          <Pressable style={[styles.deleteButton]} onPress={handleDelete}>
            <Text style={{ color: '#FF453A', fontWeight: '600' }}>Supprimer</Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>

      <PastDatePickerModal
        visible={pastDateOpen}
        value={new Date().toISOString().slice(0, 10)}
        title="Séance faite le…"
        onClose={() => setPastDateOpen(false)}
        onConfirm={handleValidatePast}
      />
    </SafeAreaView>
    </GestureHandlerRootView>
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

  async function changeType(te: TemplateExercise & { exercise: Exercise; sets: TemplateSet[] }, type: SetType) {
    await updateTemplateExercise(db, te.id, { set_type: type });
    if (type === 'time') {
      // Amorce les séries existantes sans durée avec une cible par défaut.
      const seed = te.sets.find((ts) => ts.target_seconds > 0)?.target_seconds ?? 30;
      for (const ts of te.sets) {
        if (!ts.target_seconds) await updateTemplateSet(db, ts.id, { target_seconds: seed });
      }
    }
    await getTemplateDetail(db, Number(id)).then(setDetail);
  }

  async function updateTs(ts: TemplateSet, updates: { target_reps?: number; target_weight?: number; target_seconds?: number }) {
    await updateTemplateSet(db, ts.id, updates);
    await getTemplateDetail(db, Number(id)).then(setDetail);
  }
}

function SortableExercise({
  te,
  colors,
  slots,
  dragId,
  fromIndex,
  hoverIndex,
  dragY,
  dragH,
  pan,
  onSlotLayout,
  onDrop,
  onRemove,
  onChangeSetCount,
  onChangeType,
  onUpdateSet,
}: {
  te: Te;
  colors: ReturnType<typeof useTheme>;
  slots: SlotSV;
  dragId: SharedValue<number | null>;
  fromIndex: SharedValue<number>;
  hoverIndex: SharedValue<number>;
  dragY: SharedValue<number>;
  dragH: SharedValue<number>;
  pan: PanGesture;
  onSlotLayout: (slotId: number, y: number, h: number) => void;
  onDrop: (draggedId: number, toIndex: number) => void;
  onRemove: () => void;
  onChangeSetCount: (delta: number) => void;
  onChangeType: (type: SetType) => void;
  onUpdateSet: (ts: TemplateSet, updates: { target_reps?: number; target_weight?: number; target_seconds?: number }) => void;
}) {
  const animated = useAnimatedStyle(() => {
    const list = slots.value;
    const idx = list.findIndex((s) => s.id === te.id);
    if (idx < 0 || dragId.value === null) return { transform: [{ translateY: 0 }] };
    if (dragId.value === te.id) {
      return {
        transform: [{ translateY: dragY.value }],
        zIndex: 100,
        elevation: 24,
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 6 },
        opacity: 0.95,
      };
    }
    const from = fromIndex.value;
    const to = hoverIndex.value;
    const dist = dragH.value + CARD_GAP;
    let shift = 0;
    if (from < to && idx > from && idx <= to) shift = -dist;
    else if (to < from && idx >= to && idx < from) shift = dist;
    return { transform: [{ translateY: shift }] };
  });

  return (
    <Animated.View
      style={[styles.card, { backgroundColor: colors.backgroundElement }, animated]}
      onLayout={(e) => {
        const { y, height } = e.nativeEvent.layout;
        onSlotLayout(te.id, y, height);
      }}>
      <View style={styles.cardHeader}>
        <GestureDetector gesture={pan}>
          <Pressable hitSlop={12} style={styles.dragHandle}>
            <Text style={{ color: colors.textSecondary, fontSize: 20, fontWeight: '700' }}>☰</Text>
          </Pressable>
        </GestureDetector>
        <Pressable
          style={styles.exerciseLink}
          onPress={() => router.push(`/exercice/${te.exercise.id}`)}
          accessibilityRole="link"
          accessibilityLabel={`Ouvrir l’exercice ${te.exercise.name}`}>
          <ExerciseImage name={te.exercise.name} muscle={te.exercise.muscle} width={48} radius={6} />
          <Text style={[styles.exerciseName, { color: colors.text }]}>
            {te.exercise.name}
            {te.side ? ` (${te.side === 'right' ? 'droite' : 'gauche'})` : ''}
          </Text>
        </Pressable>
        <Pressable hitSlop={8} onPress={onRemove}>
          <Text style={{ color: '#FF453A' }}>×</Text>
        </Pressable>
      </View>
      <Stepper
        label="séries"
        value={te.sets.length}
        min={1}
        colors={colors}
        onChange={onChangeSetCount}
      />
      <View style={styles.typeRow}>
        {(['reps', 'time'] as const).map((t) => (
          <Pressable
            key={t}
            style={[
              styles.typeButton,
              te.set_type === t ? { backgroundColor: '#007AFF' } : { borderColor: colors.backgroundSelected, borderWidth: 1.5 },
            ]}
            onPress={() => onChangeType(t)}>
            <Text style={{ color: te.set_type === t ? '#fff' : colors.textSecondary, fontWeight: '600' }}>
              {t === 'reps' ? 'Répétitions' : 'Temps'}
            </Text>
          </Pressable>
        ))}
      </View>
      {te.sets.map((ts, i) => (
        <View key={ts.id} style={styles.setRow}>
          <Text style={{ color: colors.textSecondary, width: 28 }}>S{i + 1}</Text>
          {te.set_type === 'time' ? (
            <Stepper
              label="s"
              value={ts.target_seconds || 0}
              min={5}
              step={(ts.target_seconds || 0) >= 60 ? 30 : 5}
              colors={colors}
              onChange={(delta) =>
                onUpdateSet(ts, { target_seconds: Math.max(5, (ts.target_seconds || 0) + delta) })
              }
            />
          ) : (
            <>
              <Stepper
                label="reps"
                value={ts.target_reps}
                min={1}
                step={ts.target_reps >= 20 ? 5 : 1}
                colors={colors}
                onChange={(delta) => onUpdateSet(ts, { target_reps: Math.max(1, ts.target_reps + delta) })}
              />
              <Stepper
                label="kg"
                value={ts.target_weight ?? 0}
                min={0}
                step={2.5}
                format={(v) => Number.isInteger(v) ? String(v) : v.toFixed(1)}
                colors={colors}
                onChange={(delta) =>
                  onUpdateSet(ts, {
                    target_weight: Math.max(0, Math.round(((ts.target_weight ?? 0) + delta) * 10) / 10),
                  })
                }
              />
            </>
          )}
        </View>
      ))}
    </Animated.View>
  );
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
  colorRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginTop: 4 },
  colorSwatch: { width: 32, height: 32, borderRadius: 16 },
  card: {
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dragHandle: { paddingVertical: 4 },
  exerciseLink: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  exerciseName: { flex: 1, fontWeight: '700' },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeButton: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderColor: 'transparent',
  },
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
