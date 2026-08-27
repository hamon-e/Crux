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
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';

import { SIDE_LABELS } from '@/components/workout-exercise-card';
import {
  getExerciseById,
  getDefaultExercises,
  getExerciseMatchTargets,
  getExerciseHistory,
  getExerciseProgression,
  getExerciseSteps,
  matchDefaultExerciseToExercise,
  matchCustomExerciseToDefault,
  updateExerciseImage,
  updateExerciseMuscle,
} from '@/db/queries';
import { MUSCLES, MUSCLE_LABELS } from '@/db/types';
import type { Exercise } from '@/db/types';
import { ExerciseImage, getExerciseImageSource } from '@/components/exercise-image';
import { ExerciseOriginTag } from '@/components/exercise-origin-tag';
import { getStepImageSource } from '@/db/skill-images';
import { useTheme } from '@/hooks/use-theme';
import { alert, confirm } from '@/lib/alert';

type History = Awaited<ReturnType<typeof getExerciseHistory>>;
type ProgressionReference = Awaited<ReturnType<typeof getExerciseProgression>>;

export default function ExerciseScreen() {
  const db = useSQLiteContext();
  const colors = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [exercise, setExercise] = useState<Awaited<ReturnType<typeof getExerciseById>>>(null);
  const [history, setHistory] = useState<History>([]);
  const [progression, setProgression] = useState<ProgressionReference>(null);
  const [coverImage, setCoverImage] = useState<ReturnType<typeof getStepImageSource>>(null);
  const [muscleOpen, setMuscleOpen] = useState(false);
  const [matchOpen, setMatchOpen] = useState(false);
  const [matchExercises, setMatchExercises] = useState<Exercise[]>([]);
  const [matchSearch, setMatchSearch] = useState('');
  const [isMatching, setIsMatching] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const selectedExercise = await getExerciseById(db, Number(id));
        // Une progression a sa propre vue : elle ne doit jamais être présentée
        // comme un exercice, même si une ancienne URL y mène.
        if (selectedExercise?.category) {
          router.replace(`/progression/${selectedExercise.id}`);
          return;
        }
        setExercise(selectedExercise);
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

  async function openMatchPicker() {
    try {
      setMatchExercises(
        currentExercise.is_custom
          ? await getDefaultExercises(db)
          : await getExerciseMatchTargets(db, currentExercise.id),
      );
      setMatchSearch('');
      setMatchOpen(true);
    } catch (error) {
      console.warn('Impossible de charger les exercices à associer', error);
      alert('Erreur', 'Les exercices ne peuvent pas être chargés.');
    }
  }

  function confirmMatch(target: Exercise) {
    const customToDefault = currentExercise.is_custom === 1;
    confirm(
      'Associer cet exercice ?',
      customToDefault
        ? `L’historique et les routines de « ${currentExercise.name} » seront transférés vers « ${target.name} ». L’exercice personnalisé sera ensuite supprimé.`
        : `L’historique, les records et les routines de « ${currentExercise.name} » seront transférés vers « ${target.name} ». L’exercice de l’App restera disponible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: customToDefault ? 'Associer et supprimer' : 'Associer et conserver',
          style: customToDefault ? 'destructive' : 'default',
          onPress: () => void handleMatch(target),
        },
      ],
    );
  }

  async function handleMatch(target: Exercise) {
    setIsMatching(true);
    try {
      if (currentExercise.is_custom) {
        await matchCustomExerciseToDefault(db, currentExercise.id, target.id);
      } else {
        await matchDefaultExerciseToExercise(db, currentExercise.id, target.id);
      }
      setMatchOpen(false);
      router.replace(`/exercice/${target.id}`);
    } catch (error) {
      console.warn('Impossible d’associer les exercices', error);
      alert('Association impossible', 'Les données de cet exercice n’ont pas été modifiées.');
    } finally {
      setIsMatching(false);
    }
  }

  function openMedia(url: string) {
    void Linking.openURL(url).catch((error) => {
      console.warn("Impossible d'ouvrir la vidéo de l'exercice", error);
    });
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
  const videoUrl = exercise.video_url?.trim();
  const hasVideo = Boolean(videoUrl);
  const canOpenVideo = hasImage && hasVideo;
  const canUploadImage = !hasImage;
  const handleImagePress = canOpenVideo
    ? () => openMedia(videoUrl!)
    : canUploadImage
      ? handleUploadImage
      : undefined;
  const matchingExercises = matchExercises.filter((candidate) =>
    candidate.name.toLocaleLowerCase().includes(matchSearch.toLocaleLowerCase().trim()),
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <Pressable
          onPress={handleImagePress}
          disabled={!canOpenVideo && !canUploadImage}
          accessibilityRole={canOpenVideo || canUploadImage ? 'button' : undefined}
          accessibilityLabel={
            canOpenVideo
              ? 'Voir la vidéo de l’exercice'
              : canUploadImage
                ? 'Ajouter une image'
                : undefined
          }
          accessibilityHint={canUploadImage ? "Ouvre le sélecteur d'images" : undefined}>
          {coverImage ? (
            <View>
              <Image source={coverImage} style={styles.hero} resizeMode="cover" />
              {hasVideo && (
                <View style={styles.playBadge}>
                  <Text style={styles.playIcon}>▶</Text>
                  <Text style={styles.playLabel}>Voir la vidéo</Text>
                </View>
              )}
            </View>
          ) : (
            <View>
              <ExerciseImage
                name={exercise.name}
                muscle={exercise.muscle}
                imageUri={imageUri}
                emptyLabel={!hasImage ? 'Ajouter une image' : undefined}
                fullWidth
                radius={14}
              />
              {hasImage && hasVideo && (
                <View style={styles.playBadge}>
                  <Text style={styles.playIcon}>▶</Text>
                  <Text style={styles.playLabel}>Voir la vidéo</Text>
                </View>
              )}
            </View>
          )}
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>{exercise.name}</Text>
        <Pressable onPress={() => setMuscleOpen(true)}>
          <Text style={{ color: colors.textSecondary }}>
            {MUSCLE_LABELS[exercise.muscle] ?? exercise.muscle} · {exercise.equipment} ✏️
          </Text>
        </Pressable>
        <ExerciseOriginTag isCustom={exercise.is_custom} />

        {exercise.is_custom === 1 && (
          <Pressable
            style={[styles.matchButton, { borderColor: colors.backgroundSelected }]}
            onPress={() => void openMatchPicker()}
            accessibilityRole="button"
            accessibilityLabel="Associer à un exercice par défaut">
            <Text style={[styles.matchButtonTitle, { color: colors.text }]}>⇄ Associer à un exercice par défaut</Text>
            <Text style={{ color: colors.textSecondary }}>
              Transfère l’historique puis supprime cet exercice.
            </Text>
          </Pressable>
        )}

        {exercise.is_custom === 0 && (
          <Pressable
            style={[styles.matchButton, { borderColor: colors.backgroundSelected }]}
            onPress={() => void openMatchPicker()}
            accessibilityRole="button"
            accessibilityLabel="Associer à un autre exercice">
            <Text style={[styles.matchButtonTitle, { color: colors.text }]}>⇄ Associer à un autre exercice</Text>
            <Text style={{ color: colors.textSecondary }}>
              Transfère l’historique et les stats sans supprimer l’exercice de l’App.
            </Text>
          </Pressable>
        )}

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
                        : `${sideDetails?.right?.best_set_reps ?? 0} reps`}
                      {' · '}
                      {SIDE_LABELS.left} :{' '}
                      {showSideWeights
                        ? `${sideDetails?.left?.top_weight ?? 0} kg`
                        : `${sideDetails?.left?.best_set_reps ?? 0} reps`}
                    </Text>
                  </>
                ) : (
                  <>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: colors.text }}>{h.date}</Text>
                      <Text style={{ color: colors.textSecondary }}>
                        max {h.top_weight} kg · {h.best_set_reps} reps
                      </Text>
                    </View>
                    {sideDetails && (
                      <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'right' }}>
                        {SIDE_LABELS.right} : {sideDetails.right?.best_set_reps ?? 0} reps
                        {' · '}
                        {SIDE_LABELS.left} : {sideDetails.left?.best_set_reps ?? 0} reps
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

      <Modal visible={matchOpen} animationType="slide" onRequestClose={() => setMatchOpen(false)}>
        <SafeAreaView style={[styles.matchModal, { backgroundColor: colors.background }]}>
          <View style={styles.matchHeader}>
            <Text style={[styles.modalTitle, { color: colors.text, marginBottom: 0 }]}>
              {currentExercise.is_custom ? 'Exercice par défaut' : 'Exercice de la base'}
            </Text>
            <Pressable onPress={() => setMatchOpen(false)} disabled={isMatching} accessibilityRole="button">
              <Text style={{ color: colors.textSecondary }}>Annuler</Text>
            </Pressable>
          </View>
          <Text style={{ color: colors.textSecondary }}>
            Choisis l’exercice qui recevra l’historique de « {currentExercise.name} ».
          </Text>
          <TextInput
            value={matchSearch}
            onChangeText={setMatchSearch}
            placeholder="Rechercher un exercice"
            placeholderTextColor={colors.textSecondary}
            style={[styles.searchInput, { borderColor: colors.backgroundSelected, color: colors.text }]}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <ScrollView contentContainerStyle={styles.matchList} keyboardShouldPersistTaps="handled">
            {matchingExercises.map((candidate) => (
              <Pressable
                key={candidate.id}
                style={[styles.matchItem, { backgroundColor: colors.backgroundElement }]}
                onPress={() => confirmMatch(candidate)}
                disabled={isMatching}
                accessibilityRole="button"
                accessibilityLabel={`Associer à ${candidate.name}`}>
                <Text style={[styles.matchItemTitle, { color: colors.text }]}>{candidate.name}</Text>
                <Text style={{ color: colors.textSecondary }}>
                  {MUSCLE_LABELS[candidate.muscle] ?? candidate.muscle} · {candidate.equipment}
                </Text>
                <ExerciseOriginTag isCustom={candidate.is_custom} compact />
              </Pressable>
            ))}
            {matchingExercises.length === 0 && (
              <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>Aucun exercice trouvé.</Text>
            )}
          </ScrollView>
        </SafeAreaView>
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
  matchButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  matchButtonTitle: { fontWeight: '800' },
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
  matchModal: { flex: 1, padding: 24, gap: 16 },
  matchHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  searchInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  matchList: { gap: 8, paddingBottom: 24 },
  matchItem: { borderRadius: 12, padding: 14, gap: 3 },
  matchItemTitle: { fontWeight: '700', fontSize: 16 },
});
