import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  FlatList,
  KeyboardAvoidingView,
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
  deleteSet,
  deleteWorkout,
  finishWorkout,
  getActiveWorkout,
  getSetting,
  getTemplates,
  getWorkoutDetail,
  startWorkout,
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
  const [restRemaining, setRestRemaining] = useState<number | null>(null);
  const restInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const stopRest = useCallback(() => {
    if (restInterval.current) clearInterval(restInterval.current);
    restInterval.current = null;
    setRestRemaining(null);
  }, []);

  useEffect(() => () => stopRest(), [stopRest]);

  const startRest = useCallback(async () => {
    const saved = await getSetting(db, 'rest_seconds');
    const seconds = saved ? parseInt(saved, 10) : 90;
    stopRest();
    setRestRemaining(seconds);
    restInterval.current = setInterval(() => {
      setRestRemaining((r) => {
        if (r === null || r <= 1) {
          if (restInterval.current) clearInterval(restInterval.current);
          restInterval.current = null;
          return null;
        }
        return r - 1;
      });
    }, 1000);
  }, [db, stopRest]);

  async function handleStart(templateId?: number) {
    await startWorkout(db, templateId);
    await reload();
  }

  function handleFinish() {
    if (!workout) return;
    confirm('Terminer la séance', 'Enregistrer et clôturer cette séance ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Terminer',
        onPress: async () => {
          stopRest();
          await finishWorkout(db, workout.id);
          await reload();
          router.push(`/historique/${workout.id}`);
        },
      },
    ]);
  }

  async function handleDiscard() {
    if (!workout) return;
    confirm('Abandonner', 'Supprimer cette séance en cours ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Abandonner',
        style: 'destructive',
        onPress: async () => {
          stopRest();
          await deleteWorkout(db, workout.id);
          await reload();
        },
      },
    ]);
  }

  async function handleUpdateSet(setId: number, updates: SetUpdates & Record<string, unknown>) {
    await updateSet(db, setId, updates as SetUpdates);
    if ((updates as { done?: number }).done === 1) void startRest();
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
              onDeleteSet={async (setId) => {
                await deleteSet(db, setId);
                await reload();
              }}
              onRemoveExercise={async () => {
                for (const s of item.sets) await deleteSet(db, s.id);
                await reload();
              }}
            />
          )}
        />

        {restRemaining !== null && (
          <Pressable style={[styles.restBar, { backgroundColor: '#FF9F0A' }]} onPress={stopRest}>
            <Text style={styles.restText}>Repos : {formatElapsed(restRemaining * 1000)} — touche pour passer</Text>
          </Pressable>
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
      </KeyboardAvoidingView>
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
  restBar: {
    position: 'absolute',
    bottom: 96,
    alignSelf: 'center',
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  restText: {
    color: '#fff',
    fontWeight: '700',
  },
});
