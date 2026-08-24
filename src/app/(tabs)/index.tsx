import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';

import { WorkoutExerciseCard } from '@/components/workout-exercise-card';
import {
  addSet,
  deleteWorkout,
  finishWorkout,
  getActiveWorkout,
  getTemplates,
  getWorkoutDetail,
  startWorkout,
  syncTemplateFromWorkout,
  updateSet,
  updateWorkoutName,
  type SetUpdates,
 WorkoutDetail } from '@/db/queries';
import type { Template } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';
import { confirm } from '@/lib/alert';

function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

const SEANCE_TYPES = ['Grimpe bloc', 'Grimpe voie', 'Vélo', 'Course', 'Natation', 'Randonnée'];

export default function SessionScreen() {
  const db = useSQLiteContext();
  const colors = useTheme();

  const [workout, setWorkout] = useState<WorkoutDetail | null>(null);
  const [templates, setTemplates] = useState<(Template & { exercise_count: number })[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [finishOpen, setFinishOpen] = useState(false);
  const [chronoRunning, setChronoRunning] = useState(false);
  const [chronoMs, setChronoMs] = useState(0);
  const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const chronoTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const chronoStart = useRef<number | null>(null);
  const chronoBase = useRef(0);

  const reload = useCallback(async () => {
    const active = await getActiveWorkout(db);
    if (active) {
      const detail = await getWorkoutDetail(db, active.id);
      setWorkout(detail);
      if (detail?.started_at) {
        setElapsed(Date.now() - detail.started_at);
      }
    } else {
      setWorkout(null);
    }
    setTemplates(await getTemplates(db));
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  useEffect(() => {
    if (!workout?.started_at) return;
    elapsedTimer.current = setInterval(() => {
      if (workout.started_at) setElapsed(Date.now() - workout.started_at);
    }, 1000);
    return () => {
      if (elapsedTimer.current) clearInterval(elapsedTimer.current);
    };
  }, [workout?.id, workout?.started_at]);

  const stopChronoInterval = useCallback(() => {
    if (chronoTimer.current) clearInterval(chronoTimer.current);
    chronoTimer.current = null;
  }, []);

  const toggleChrono = useCallback(() => {
    if (chronoRunning) {
      if (chronoStart.current !== null) chronoBase.current += Date.now() - chronoStart.current;
      chronoStart.current = null;
      stopChronoInterval();
      setChronoRunning(false);
    } else {
      chronoStart.current = Date.now();
      chronoTimer.current = setInterval(() => {
        setChronoMs(chronoBase.current + (chronoStart.current !== null ? Date.now() - chronoStart.current : 0));
      }, 200);
      setChronoMs(chronoBase.current);
      setChronoRunning(true);
    }
  }, [chronoRunning, stopChronoInterval]);

  const resetChrono = useCallback(() => {
    stopChronoInterval();
    chronoStart.current = null;
    chronoBase.current = 0;
    setChronoMs(0);
    setChronoRunning(false);
  }, [stopChronoInterval]);

  useEffect(() => () => resetChrono(), [resetChrono]);

  async function handleStart(templateId?: number) {
    await startWorkout(db, templateId);
    await reload();
  }

  function handleFinish() {
    if (!workout) return;
    if (!workout.template_id) {
      confirm('Terminer la séance', 'Enregistrer et clôturer cette séance ?', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Terminer', onPress: () => void doFinish(false) },
      ]);
      return;
    }
    setFinishOpen(true);
  }

  async function doFinish(syncRoutine: boolean) {
    if (!workout) return;
    const templateId = workout.template_id;
    setFinishOpen(false);
    resetChrono();
    if (templateId && syncRoutine) {
      await syncTemplateFromWorkout(db, templateId, workout.id);
    }
    await finishWorkout(db, workout.id);
    await reload();
    router.push(`/historique/${workout.id}`);
  }

  async function handleDiscard() {
    if (!workout) return;
    confirm('Abandonner', 'Supprimer cette séance en cours ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Abandonner',
        style: 'destructive',
        onPress: async () => {
          resetChrono();
          await deleteWorkout(db, workout.id);
          await reload();
        },
      },
    ]);
  }

  async function handleUpdateSet(setId: number, updates: SetUpdates & Record<string, unknown>) {
    await updateSet(db, setId, updates as SetUpdates);
    await reload();
  }

  // ---- État vide : démarrage / ajout de séance ----
  if (!workout) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.emptyContent}>
          <Text style={[styles.title, { color: colors.text }]}>Prêt pour la séance ?</Text>

          <Pressable
            style={[styles.primaryButton, { backgroundColor: '#007AFF' }]}
            onPress={() => router.push('/ajouter-seance')}>
            <Text style={styles.primaryButtonText}>Ajouter une séance</Text>
          </Pressable>
          <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>
            {SEANCE_TYPES.slice(0, -1).join(', ').toLowerCase()}…
          </Text>

          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            Démarrer depuis une routine
          </Text>
          {templates.length === 0 && (
            <Text style={{ color: colors.textSecondary }}>
              Aucune routine. Crée-en une dans l&apos;onglet Plus.
            </Text>
          )}
          {templates.map((t) => (
            <Pressable
              key={t.id}
              style={[styles.templateRow, { backgroundColor: colors.backgroundElement }]}
              onPress={() => handleStart(t.id)}>
              <Text style={{ color: colors.text, fontWeight: '600', flex: 1 }}>{t.name}</Text>
              <Text style={{ color: colors.textSecondary }}>{t.exercise_count} ex.</Text>
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---- Séance en cours ----
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TextInput
            style={[styles.nameInput, { color: colors.text }]}
            placeholder="Nom de la séance"
            placeholderTextColor={colors.textSecondary}
            defaultValue={workout.name}
            onEndEditing={(e) => updateWorkoutName(db, workout.id, e.nativeEvent.text)}
          />
          <View style={styles.headerMeta}>
            <Text style={[styles.elapsed, { color: colors.text }]}>⏱ {formatElapsed(elapsed)}</Text>
            <Pressable onPress={handleDiscard} hitSlop={8}>
              <Text style={{ color: '#FF453A', fontSize: 13 }}>Abandonner</Text>
            </Pressable>
          </View>
        </View>

        <FlatList
          style={{ flex: 1 }}
          data={workout.exercises}
          keyExtractor={(item) => `${item.exercise.id}|${item.side ?? ''}`}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListEmptyComponent={
            <Text style={{ textAlign: 'center', color: colors.textSecondary, marginTop: 40 }}>
              Ajoute ton premier exercice pour commencer.
            </Text>
          }
          renderItem={({ item }) => (
            <WorkoutExerciseCard
              exercise={item.exercise}
              sets={item.sets}
              side={item.side}
              onAddSet={async () => {
                await addSet(db, workout.id, item.exercise.id, 0, 0, item.side);
                await reload();
              }}
              onUpdateSet={(setId, updates) => handleUpdateSet(setId, updates)}
            />
          )}
        />

        <View style={[styles.chronoBar, { backgroundColor: colors.backgroundElement }]}>
          <Text style={[styles.chronoTime, { color: colors.text }]}>{formatElapsed(chronoMs)}</Text>
          <View style={styles.chronoActions}>
            <Pressable
              style={[
                styles.chronoButton,
                chronoRunning ? { backgroundColor: '#FF9F0A' } : { backgroundColor: '#007AFF' },
              ]}
              onPress={toggleChrono}>
              <Text style={styles.chronoButtonText}>{chronoRunning ? 'Pause' : chronoMs > 0 ? 'Reprendre' : 'Démarrer'}</Text>
            </Pressable>
            <Pressable
              style={[styles.chronoButton, styles.chronoResetButton]}
              onPress={resetChrono}
              disabled={chronoMs === 0 && !chronoRunning}>
              <Text
                style={[
                  styles.chronoResetText,
                  { color: chronoMs === 0 && !chronoRunning ? colors.textSecondary : '#FF453A' },
                ]}>
                Reset
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.footer}>
          <Pressable
            style={[styles.secondaryButton, { borderColor: colors.backgroundSelected }]}
            onPress={() => router.push({ pathname: '/ajouter-exercice', params: { mode: 'workout' } })}>
            <Text style={{ color: '#007AFF', fontWeight: '600' }}>+ Exercice</Text>
          </Pressable>
          <Pressable style={[styles.primaryButton, { backgroundColor: '#007AFF', flex: 1 }]} onPress={handleFinish}>
            <Text style={styles.primaryButtonText}>Terminer</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={finishOpen} transparent animationType="fade" onRequestClose={() => setFinishOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setFinishOpen(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.backgroundElement }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Terminer la séance</Text>
            <Text style={[styles.modalMessage, { color: colors.textSecondary }]}>
              Enregistrer les modifications dans la routine{' '}
              {templates.find((t) => t.id === workout?.template_id)?.name ? `« ${templates.find((t) => t.id === workout?.template_id)?.name} »` : ''} ?
            </Text>
            <Pressable
              style={[styles.finishButton, { backgroundColor: '#007AFF' }]}
              onPress={() => void doFinish(true)}>
              <Text style={styles.primaryButtonText}>Enregistrer dans la routine</Text>
            </Pressable>
            <Pressable
              style={[styles.finishButton, { borderColor: '#007AFF' }]}
              onPress={() => void doFinish(false)}>
              <Text style={{ color: '#007AFF', fontWeight: '700', fontSize: 16 }}>Terminer sans enregistrer</Text>
            </Pressable>
            <Pressable style={styles.cancelButton} onPress={() => setFinishOpen(false)}>
              <Text style={{ color: colors.textSecondary, fontSize: 16 }}>Annuler</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyContent: {
    padding: 24,
    gap: 16,
    alignItems: 'stretch',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 48,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
  },
  templateRow: {
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 4,
  },
  nameInput: {
    fontSize: 22,
    fontWeight: '800',
  },
  headerMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  elapsed: {
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 4,
  },
  chronoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#8884',
  },
  chronoTime: {
    fontSize: 24,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  chronoActions: {
    flexDirection: 'row',
    gap: 8,
  },
  chronoButton: {
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  chronoButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  chronoResetButton: {
    borderWidth: 1.5,
    borderColor: '#FF453A55',
  },
  chronoResetText: {
    fontWeight: '700',
    fontSize: 14,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#8884',
  },
  primaryButton: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  secondaryButton: {
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#0009',
    padding: 32,
  },
  modalCard: {
    borderRadius: 20,
    padding: 24,
    gap: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  modalMessage: {
    fontSize: 15,
    marginBottom: 8,
  },
  finishButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 6,
  },
});
