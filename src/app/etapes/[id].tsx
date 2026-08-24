import { useCallback, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { getExerciseById, getExerciseSteps } from '@/db/queries';
import type { Exercise } from '@/db/types';
import { getStepImageSource } from '@/db/skill-images';
import { useTheme } from '@/hooks/use-theme';
import { TIER_COLORS, TIER_ICONS, TIER_LABELS, tierOf } from '@/lib/skill-tree';

export default function EtapesScreen() {
  const db = useSQLiteContext();
  const colors = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const exerciseId = Number(id);
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [steps, setSteps] = useState<Awaited<ReturnType<typeof getExerciseSteps>>>([]);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        try {
          setExercise(await getExerciseById(db, exerciseId));
          setSteps(await getExerciseSteps(db, exerciseId));
        } catch (e) {
          console.warn('Impossible de lire la progression', e);
        }
      })();
    }, [db, exerciseId])
  );

  if (!exercise) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textSecondary, padding: 24 }}>Chargement…</Text>
      </SafeAreaView>
    );
  }

  const tier = tierOf(exercise.difficulty ?? '');
  const tierColor = TIER_COLORS[tier];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 22 }}>{TIER_ICONS[tier]}</Text>
          <Text style={[styles.title, { color: colors.text }]}>{exercise.name}</Text>
        </View>
        <Text style={{ color: colors.textSecondary }}>
          {TIER_LABELS[tier]} · Progression en {steps.length} étape{steps.length > 1 ? 's' : ''}
        </Text>

        {steps.map((step, i) => (
          <View key={step.id} style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
            <View style={styles.header}>
              <View style={[styles.badge, { backgroundColor: tierColor }]}>
                <Text style={styles.badgeText}>{i + 1}</Text>
              </View>
              <Text style={[styles.stepName, { color: colors.text }]}>{step.name}</Text>
              {!!step.reps && (
                <View style={styles.repsChip}>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700' }}>{step.reps}</Text>
                </View>
              )}
            </View>
            {(() => {
              const src = getStepImageSource(step.image);
              if (!src) return null;
              return (
                <Pressable
                  onPress={() => step.video && void Linking.openURL(step.video)}
                  disabled={!step.video}>
                  <Image source={src} style={styles.image} resizeMode="cover" />
                  {!!step.video && (
                    <View style={styles.vidBadge}>
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>▶ Voir la vidéo</Text>
                    </View>
                  )}
                </Pressable>
              );
            })()}
            {!step.image && !!step.video && (
              <Pressable style={[styles.vidLink, { borderColor: colors.backgroundSelected }]} onPress={() => void Linking.openURL(step.video)}>
                <Text style={{ color: '#007AFF', fontWeight: '600' }}>▶ Voir la vidéo de l&rsquo;étape</Text>
              </Pressable>
            )}
            {!!step.instructions && (
              <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
                {step.instructions.trim()}
              </Text>
            )}
          </View>
        ))}

        {steps.length === 0 && (
          <Text style={{ color: colors.textSecondary }}>Aucune étape enregistrée pour cet exercice.</Text>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 10 },
  title: { fontSize: 24, fontWeight: '800', flexShrink: 1 },
  card: {
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  stepName: { fontWeight: '700', flex: 1, flexWrap: 'wrap' },
  repsChip: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#8884',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  image: {
    width: '100%',
    height: 180,
    borderRadius: 10,
    backgroundColor: '#0001',
  },
  vidBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: '#000a',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  vidLink: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
});
