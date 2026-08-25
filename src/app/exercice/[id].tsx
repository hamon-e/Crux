import { useCallback, useState } from 'react';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import {
  Image,
  Linking,
  Modal,
  Platform,
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
import {
  getExerciseById,
  getExerciseHistory,
  getExerciseProgression,
  getExerciseSteps,
  updateExerciseImage,
  updateExerciseMuscle,
} from '@/db/queries';
import { MUSCLES, MUSCLE_LABELS } from '@/db/types';
import { ExerciseImage, getExerciseImageSource } from '@/components/exercise-image';
import { ExerciseOriginTag } from '@/components/exercise-origin-tag';
import { getStepImageSource } from '@/db/skill-images';
import { useTheme } from '@/hooks/use-theme';
import { alert } from '@/lib/alert';

type History = Awaited<ReturnType<typeof getExerciseHistory>>;
type ExerciseProgression = Awaited<ReturnType<typeof getExerciseProgression>>;

export default function ExerciseScreen() {
  const db = useSQLiteContext();
  const colors = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [exercise, setExercise] = useState<Awaited<ReturnType<typeof getExerciseById>>>(null);
  const [history, setHistory] = useState<History>([]);
  const [progression, setProgression] = useState<ExerciseProgression>(null);
  const [coverImage, setCoverImage] = useState<ReturnType<typeof getStepImageSource>>(null);
  const [muscleOpen, setMuscleOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        setExercise(await getExerciseById(db, Number(id)));
        setHistory(await getExerciseHistory(db, Number(id)));
        setProgression(await getExerciseProgression(db, Number(id)));
        getExerciseSteps(db, Number(id))
          .then((steps) => setCoverImage(getStepImageSource(steps.find((s) => s.image)?.image)))
          .catch((e) => console.warn('Impossible de lire les étapes', e));
      })();
    }, [db, id])
  );

  if (!exercise) return null;
  const currentExercise = exercise;

  async function handleMuscleChange(muscle: string) {
    await updateExerciseMuscle(db, exercise!.id, muscle);
    setMuscleOpen(false);
    setExercise({ ...exercise!, muscle });
  }

  function openMedia() {
    const url = exercise?.video_url;
    if (url) void Linking.openURL(url);
  }

  async function handleUploadImage() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      let imageUri = asset.uri;
      if (Platform.OS !== 'web') {
        const imageDirectory = new Directory(Paths.document, 'exercise-images');
        imageDirectory.create({ idempotent: true, intermediates: true });
        const imageFile = new File(
          imageDirectory,
          `${currentExercise.id}-${Date.now()}${getImageExtension(asset.name, asset.mimeType)}`
        );
        await new File(asset.uri).copy(imageFile);
        imageUri = imageFile.uri;
      }

      await updateExerciseImage(db, currentExercise.id, imageUri);
      setExercise({ ...currentExercise, image_uri: imageUri });
    } catch (error) {
      console.warn("Impossible d'importer l'image", error);
      alert('Image non ajoutée', "Le fichier n'a pas pu être enregistré.");
    }
  }

  const bundledImage = getExerciseImageSource(exercise.name);
  const imageUri = exercise.image_uri || undefined;
  const hasImage = Boolean(coverImage || imageUri || bundledImage);
  const handleImagePress = hasImage ? openMedia : handleUploadImage;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <Pressable
          onPress={() => void handleImagePress()}
          disabled={hasImage && !exercise.video_url}
          accessibilityRole="button"
          accessibilityLabel={hasImage ? 'Voir la vidéo de l’exercice' : 'Ajouter une image'}
          accessibilityHint={hasImage ? undefined : "Ouvre le sélecteur d'images"}>
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
            <ExerciseImage
              name={exercise.name}
              muscle={exercise.muscle}
              imageUri={imageUri}
              emptyLabel={!hasImage ? 'Ajouter une image' : undefined}
              fullWidth
              radius={14}
            />
          )}
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>{exercise.name}</Text>
        <Pressable onPress={() => setMuscleOpen(true)}>
          <Text style={{ color: colors.textSecondary }}>
            {MUSCLE_LABELS[exercise.muscle] ?? exercise.muscle} · {exercise.equipment} ✏️
          </Text>
        </Pressable>
        <ExerciseOriginTag isCustom={exercise.is_custom} />

        {progression && (
          <Pressable
            style={[styles.progressionButton, { borderColor: colors.backgroundSelected }]}
            onPress={() => router.push(`/progression/${progression.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`Voir la progression ${progression.name}`}>
            <Text style={[styles.progressionButtonTitle, { color: colors.text }]}>↗ Voir la progression</Text>
            <Text style={{ color: colors.textSecondary }}>{progression.name}</Text>
          </Pressable>
        )}

        <View style={[styles.card, { backgroundColor: colors.backgroundElement, gap: 6 }]}>
          <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 4 }}>
            Historique complet
          </Text>
          {history.length === 0 && (
            <Text style={{ color: colors.textSecondary }}>Aucune série validée.</Text>
          )}
          {[...history].reverse().map((h) => {
            const sideDetails = h.side_details;
            const hasBothSides = Boolean(sideDetails?.left && sideDetails?.right);
            const showSideWeights = h.top_weight > 0;

            return (
              <View key={h.started_at}>
                {hasBothSides ? (
                  <>
                    <Text style={{ color: colors.text }}>{h.date}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'right' }}>
                      {SIDE_LABELS.right} :{' '}
                      {showSideWeights
                        ? `${sideDetails?.right?.top_weight ?? 0} kg`
                        : `${sideDetails?.right?.total_reps ?? 0} reps`}
                      {' · '}
                      {SIDE_LABELS.left} :{' '}
                      {showSideWeights
                        ? `${sideDetails?.left?.top_weight ?? 0} kg`
                        : `${sideDetails?.left?.total_reps ?? 0} reps`}
                    </Text>
                  </>
                ) : (
                  <>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: colors.text }}>{h.date}</Text>
                      <Text style={{ color: colors.textSecondary }}>
                        max {h.top_weight} kg · {h.total_reps} reps
                      </Text>
                    </View>
                    {sideDetails && (
                      <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'right' }}>
                        {SIDE_LABELS.right} : {sideDetails.right?.total_reps ?? 0} reps
                        {' · '}
                        {SIDE_LABELS.left} : {sideDetails.left?.total_reps ?? 0} reps
                        {!sideDetails.left || !sideDetails.right ? ' (côté manquant)' : ''}
                      </Text>
                    )}
                  </>
                )}
              </View>
            );
          })}
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

function getImageExtension(name: string, mimeType?: string | null): string {
  const match = name.match(/\.[a-z0-9]+$/i);
  if (match) return match[0].toLowerCase();
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/webp') return '.webp';
  return '.jpg';
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
  progressionButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  progressionButtonTitle: { fontWeight: '800' },
  card: { borderRadius: 14, padding: 16 },
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
