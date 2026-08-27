import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  BackHandler,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

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
  const [chronoVisible, setChronoVisible] = useState(true);
  const [chronoExpanded, setChronoExpanded] = useState(false);
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
      setChronoMs(chronoBase.current);
      setChronoRunning(false);
    } else {
      // « Start » démarre toujours un nouveau chronomètre, même après un stop.
      chronoBase.current = 0;
      chronoStart.current = Date.now();
      chronoTimer.current = setInterval(() => {
        setChronoMs(chronoBase.current + (chronoStart.current !== null ? Date.now() - chronoStart.current : 0));
      }, 200);
      setChronoMs(0);
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

  const handleDiscard = useCallback(async () => {
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
  }, [db, reload, resetChrono, workout]);

  useFocusEffect(
    useCallback(() => {
      if (!workout) return;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        void handleDiscard();
        return true;
      });
      return () => subscription.remove();
    }, [handleDiscard, workout])
  );

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
      <View style={{ flex: 1 }}>
        <View style={styles.header}>
          <TextInput
            style={[styles.nameInput, { color: colors.text }]}
            placeholder="Nom de la séance"
            placeholderTextColor={colors.textSecondary}
            rejectResponderTermination={false}
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

        <KeyboardAwareScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.listContent}
          bottomOffset={16}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {workout.exercises.length === 0 && (
            <Text style={{ textAlign: 'center', color: colors.textSecondary, marginTop: 40 }}>
              Ajoute ton premier exercice pour commencer.
            </Text>
          )}
          {workout.exercises.map((item) => (
            <WorkoutExerciseCard
              key={`${item.exercise.id}|${item.side ?? ''}`}
              exercise={item.exercise}
              sets={item.sets}
              side={item.side}
              onAddSet={async () => {
                await addSet(db, workout.id, item.exercise.id, 0, 0, item.side);
                await reload();
              }}
              onUpdateSet={(setId, updates) => handleUpdateSet(setId, updates)}
            />
          ))}
        </KeyboardAwareScrollView>

        {chronoVisible ? (
          <View style={styles.chronoBar}>
            <View style={styles.chronoTitleRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Masquer le chronomètre"
                accessibilityState={{ expanded: true }}
                hitSlop={8}
                onPress={() => setChronoVisible(false)}
                style={({ pressed }) => [styles.chronoIcon, pressed && styles.chronoIconPressed]}>
                <Text style={styles.chronoIconText}>⏱</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Agrandir le chronomètre"
                onPress={() => setChronoExpanded(true)}
                style={({ pressed }) => [styles.chronoSummary, pressed && styles.chronoSummaryPressed]}>
                <Text style={styles.chronoLabel} numberOfLines={1}>Chronomètre</Text>
                <Text style={styles.chronoTime}>{formatElapsed(chronoMs)}</Text>
              </Pressable>
            </View>
            <Pressable
              style={({ pressed }) => [styles.chronoButton, pressed && styles.chronoButtonPressed]}
              onPress={toggleChrono}>
              <Text style={styles.chronoButtonText}>{chronoRunning ? 'Stop' : 'Start'}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.chronoToggleDock}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Afficher le chronomètre"
              accessibilityState={{ expanded: false }}
              onPress={() => setChronoVisible(true)}
              style={({ pressed }) => [styles.chronoIcon, styles.chronoToggle, pressed && styles.chronoIconPressed]}>
              <Text style={styles.chronoIconText}>⏱</Text>
            </Pressable>
          </View>
        )}

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
      </View>

      <Modal
        visible={chronoExpanded}
        animationType="slide"
        onRequestClose={() => setChronoExpanded(false)}>
        <SafeAreaView style={styles.chronoExpandedScreen}>
          <View style={styles.chronoExpandedContent}>
            <Text style={styles.chronoExpandedLabel}>Chronomètre</Text>
            <Text accessibilityLiveRegion="polite" style={styles.chronoExpandedTime}>
              {formatElapsed(chronoMs)}
            </Text>
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.chronoExpandedStartButton, pressed && styles.chronoButtonPressed]}
              onPress={toggleChrono}>
              <Text style={styles.chronoExpandedStartText}>{chronoRunning ? 'Stop' : 'Start'}</Text>
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remettre le chronomètre en bas"
            style={({ pressed }) => [styles.chronoCollapseButton, pressed && styles.chronoCollapseButtonPressed]}
            onPress={() => setChronoExpanded(false)}>
            <Text style={styles.chronoCollapseButtonText}>Remettre en bas</Text>
          </Pressable>
        </SafeAreaView>
      </Modal>

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
    marginHorizontal: 16,
    marginBottom: 4,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    backgroundColor: '#FFD60A',
    shadowColor: '#9A7600',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  chronoTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 6,
  },
  chronoSummary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  chronoSummaryPressed: {
    opacity: 0.7,
  },
  chronoIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF3A6',
  },
  chronoIconText: {
    fontSize: 16,
  },
  chronoIconPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.94 }],
  },
  chronoToggleDock: {
    alignItems: 'flex-start',
    marginHorizontal: 16,
    marginBottom: 4,
  },
  chronoToggle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFD60A',
    shadowColor: '#9A7600',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  chronoLabel: {
    color: '#1C1C1E',
    fontSize: 14,
    fontWeight: '800',
  },
  chronoTime: {
    color: '#1C1C1E',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.25,
    fontVariant: ['tabular-nums'],
  },
  chronoButton: {
    minHeight: 36,
    minWidth: 58,
    borderRadius: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1C1C1E',
  },
  chronoButtonText: {
    color: '#FFD60A',
    fontWeight: '700',
    fontSize: 15,
  },
  chronoButtonPressed: {
    opacity: 0.78,
  },
  chronoExpandedScreen: {
    flex: 1,
    backgroundColor: '#FFD60A',
    padding: 24,
  },
  chronoExpandedContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  chronoExpandedLabel: {
    color: '#1C1C1E',
    fontSize: 20,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  chronoExpandedTime: {
    color: '#1C1C1E',
    fontSize: 72,
    fontWeight: '900',
    letterSpacing: -2,
    fontVariant: ['tabular-nums'],
  },
  chronoExpandedStartButton: {
    minWidth: 150,
    borderRadius: 16,
    paddingHorizontal: 28,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1C1C1E',
  },
  chronoExpandedStartText: {
    color: '#FFD60A',
    fontSize: 18,
    fontWeight: '800',
  },
  chronoCollapseButton: {
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#1C1C1E',
    borderRadius: 14,
    paddingVertical: 15,
  },
  chronoCollapseButtonPressed: {
    backgroundColor: '#E8C000',
  },
  chronoCollapseButtonText: {
    color: '#1C1C1E',
    fontSize: 16,
    fontWeight: '800',
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
