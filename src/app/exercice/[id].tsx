import { useCallback, useState } from 'react';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import {
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';

import { SIDE_LABELS } from '@/components/workout-exercise-card';
import { getExerciseById, getExerciseHistory, getExerciseSteps, updateExerciseMuscle } from '@/db/queries';
import { MUSCLES, MUSCLE_LABELS } from '@/db/types';
import { ExerciseImage } from '@/components/exercise-image';
import { ExerciseOriginTag } from '@/components/exercise-origin-tag';
import { getStepImageSource } from '@/db/skill-images';
import { useTheme } from '@/hooks/use-theme';

type History = Awaited<ReturnType<typeof getExerciseHistory>>;

const CHART_HEIGHT = 130;
const LABEL_SPACE = 34;
const BAR_MAX = CHART_HEIGHT - LABEL_SPACE;

export default function ExerciseScreen() {
  const db = useSQLiteContext();
  const colors = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [exercise, setExercise] = useState<Awaited<ReturnType<typeof getExerciseById>>>(null);
  const [history, setHistory] = useState<History>([]);
  const [coverImage, setCoverImage] = useState<ReturnType<typeof getStepImageSource>>(null);
  const [muscleOpen, setMuscleOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        setExercise(await getExerciseById(db, Number(id)));
        setHistory(await getExerciseHistory(db, Number(id)));
        getExerciseSteps(db, Number(id))
          .then((steps) => setCoverImage(getStepImageSource(steps.find((s) => s.image)?.image)))
          .catch((e) => console.warn('Impossible de lire les étapes', e));
      })();
    }, [db, id])
  );

  if (!exercise) return null;

  const recent = history.slice(-12);
  const max1rm = Math.max(1, ...recent.map((h) => h.best_1rm));

  async function handleMuscleChange(muscle: string) {
    await updateExerciseMuscle(db, exercise!.id, muscle);
    setMuscleOpen(false);
    setExercise({ ...exercise!, muscle });
  }

  function openMedia() {
    const url = exercise?.video_url;
    if (url) void Linking.openURL(url);
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <Pressable onPress={openMedia} disabled={!exercise.video_url}>
          {coverImage ? (
            <View>
              <Image source={coverImage} style={styles.hero} resizeMode="cover" />
              {!!exercise.video_url && (
                <View style={styles.playBadge}>
                  <Text style={styles.playIcon}>▶</Text>
                  <Text style={styles.playLabel}>Voir la vidéo</Text>
                </View>
              )}
            </View>
          ) : (
            <ExerciseImage name={exercise.name} muscle={exercise.muscle} fullWidth radius={14} />
          )}
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>{exercise.name}</Text>
        <Pressable onPress={() => setMuscleOpen(true)}>
          <Text style={{ color: colors.textSecondary }}>
            {MUSCLE_LABELS[exercise.muscle] ?? exercise.muscle} · {exercise.equipment} ✏️
          </Text>
        </Pressable>
        <ExerciseOriginTag isCustom={exercise.is_custom} />

        <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
          <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 12 }}>
            1RM estimé par séance
          </Text>
          <View style={styles.chartRow}>
            {recent.length === 0 && (
              <Text style={{ color: colors.textSecondary }}>Pas encore de données.</Text>
            )}
            {recent.map((h) => (
              <View key={h.started_at} style={styles.barColumn}>
                <Text style={{ fontSize: 9, color: colors.textSecondary }}>
                  {Math.round(h.best_1rm)}
                </Text>
                <View
                  style={[
                    styles.bar,
                    {
                      height: Math.max(4, (h.best_1rm / max1rm) * BAR_MAX),
                      backgroundColor: '#007AFF',
                    },
                  ]}
                />
                <Text style={{ fontSize: 9, color: colors.textSecondary }}>
                  {h.date.slice(8, 10)}/{h.date.slice(5, 7)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.backgroundElement, gap: 6 }]}>
          <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 4 }}>
            Historique complet
          </Text>
          {history.length === 0 && (
            <Text style={{ color: colors.textSecondary }}>Aucune série validée.</Text>
          )}
          {[...history].reverse().map((h) => (
            <View key={h.started_at}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.text }}>{h.date}</Text>
                <Text style={{ color: colors.textSecondary }}>
                  max {h.top_weight} kg · {h.total_reps} reps
                </Text>
              </View>
              {h.side_details && (
                <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'right' }}>
                  {SIDE_LABELS.right} : {h.side_details.right?.total_reps ?? 0} reps
                  {' · '}
                  {SIDE_LABELS.left} : {h.side_details.left?.total_reps ?? 0} reps
                  {(!h.side_details.left || !h.side_details.right) ? ' (côté manquant)' : ''}
                </Text>
              )}
            </View>
          ))}
        </View>
      </ScrollView>

      <Modal visible={muscleOpen} animationType="slide" transparent onRequestClose={() => setMuscleOpen(false)}>
        <Pressable style={[styles.modalBackdrop, { backgroundColor: '#0009' }]} onPress={() => setMuscleOpen(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Groupe musculaire</Text>
            <View style={styles.optionRow}>
              {[...MUSCLES].map((m) => (
                <TouchableOpacity key={m} onPress={() => void handleMuscleChange(m)}>
                  <Text
                    style={[
                      styles.chip,
                      exercise.muscle === m && styles.chipActive,
                      { borderColor: colors.backgroundSelected, color: colors.text },
                    ]}>
                    {MUSCLE_LABELS[m] ?? m}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Pressable onPress={() => setMuscleOpen(false)} style={{ marginTop: 16 }}>
              <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>Annuler</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, gap: 12 },
  title: { fontSize: 26, fontWeight: '800' },
  hero: {
    width: '100%',
    height: 210,
    borderRadius: 14,
    backgroundColor: '#0001',
  },
  playBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#000a',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  playIcon: { color: '#fff', fontSize: 13 },
  playLabel: { color: '#fff', fontWeight: '700', fontSize: 13 },
  card: { borderRadius: 14, padding: 16 },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 130,
    gap: 6,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
    gap: 4,
  },
  bar: {
    width: '100%',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 12,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 13,
    overflow: 'hidden',
  },
  chipActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
    color: '#fff',
  },
});
