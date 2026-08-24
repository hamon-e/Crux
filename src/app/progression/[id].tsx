import { useCallback, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { getExerciseSteps, getSkillExercises } from '@/db/queries';
import { getStepImageSource } from '@/db/skill-images';
import { useTheme } from '@/hooks/use-theme';
import {
  MASTERY_SESSIONS,
  TIERS,
  TIER_COLORS,
  TIER_ICONS,
  TIER_LABELS,
  buildSkillTree,
  type SkillNode,
} from '@/lib/skill-tree';

export default function ProgressionScreen() {
  const db = useSQLiteContext();
  const colors = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const exerciseId = Number(id);
  const [nodes, setNodes] = useState<SkillNode[]>([]);
  const [stepsOpen, setStepsOpen] = useState(true);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        try {
          const tree = buildSkillTree(await getSkillExercises(db));
          setNodes(Object.values(tree).flat());
        } catch (e) {
          console.warn('Progression : impossible de lire les compétences', e);
        }
      })();
    }, [db])
  );

  const current = nodes.find((n) => n.id === exerciseId);

  if (!current) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text, padding: 24 }}>Compétence introuvable.</Text>
      </SafeAreaView>
    );
  }

  const currentTierIdx = TIERS.indexOf(current.tier);
  const sameCategory = nodes
    .filter((n) => n.category === current.category)
    .sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) || a.name.localeCompare(b.name));
  const prerequisites = sameCategory.filter((n) => TIERS.indexOf(n.tier) < currentTierIdx);
  const unlocks = sameCategory.filter((n) => TIERS.indexOf(n.tier) > currentTierIdx);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={{ color: '#007AFF', fontWeight: '600' }}>‹ Arbre</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={{ fontSize: 28 }}>{TIER_ICONS[current.tier]}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.text }]}>{current.name}</Text>
            <Text style={{ color: TIER_COLORS[current.tier], fontWeight: '700', fontSize: 12, textTransform: 'uppercase' }}>
              {TIER_LABELS[current.tier]} · {current.category}
            </Text>
          </View>
        </View>

        {prerequisites.length > 0 && (
          <>
            <SectionLabel text="Ce qui mène à cet exercice" color={colors.textSecondary} />
            {prerequisites.map((node) => (
              <PathNode key={node.id} node={node} onPress={() => router.push(`/exercice/${node.id}`)} />
            ))}
            <View style={[styles.linkLine, { backgroundColor: colors.backgroundSelected }]} />
          </>
        )}

        <SectionLabel text="Exercice sélectionné" color={TIER_COLORS[current.tier]} />
        <CurrentNode node={current} />

        {unlocks.length > 0 && (
          <>
            <SectionLabel text="Ce que cet exercice débloque" color={colors.textSecondary} />
            {unlocks.map((node) => (
              <PathNode key={node.id} node={node} onPress={() => router.push(`/exercice/${node.id}`)} />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );

  function PathNode({ node, onPress }: { node: SkillNode; onPress: () => void }) {
    const cover = getStepImageSource(node.cover_image ?? null);
    return (
      <Pressable
        style={[styles.pathCard, { backgroundColor: colors.backgroundElement }, !node.unlocked && styles.locked]}
        onPress={onPress}>
        {cover ? (
          <Image source={cover} style={styles.nodeImage} resizeMode="cover" />
        ) : (
          <Text style={styles.nodeIcon}>{node.mastered ? '✅' : node.unlocked ? '🔓' : '🔒'}</Text>
        )}
        <View style={{ flex: 1, gap: 4 }}>
          <Text numberOfLines={1} style={{ color: node.unlocked ? colors.text : colors.textSecondary, fontWeight: '700' }}>
            {node.name}
          </Text>
          <View style={[styles.track, { backgroundColor: colors.backgroundSelected }]}>
            <View
              style={{
                width: `${Math.round(node.progress * 100)}%`,
                height: '100%',
                borderRadius: 3,
                backgroundColor: node.mastered ? '#34c759' : TIER_COLORS[node.tier],
                opacity: node.unlocked ? 1 : 0.35,
              }}
            />
          </View>
        </View>
        <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
          {node.mastered ? '✅' : node.unlocked ? '🔓' : '🔒'} {node.sessions}/{MASTERY_SESSIONS}
        </Text>
      </Pressable>
    );
  }

  function CurrentNode({ node }: { node: SkillNode }) {
    return (
      <View style={[styles.currentCard, { borderColor: TIER_COLORS[node.tier] }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 20 }}>{node.mastered ? '✅' : node.unlocked ? '🔓' : '🔒'}</Text>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16, flex: 1 }}>{node.name}</Text>
        </View>
        <Text style={{ color: colors.textSecondary, marginTop: 6 }}>
          {node.sessions}/{MASTERY_SESSIONS} séances validées
          {node.mastered ? ' — maîtrisée !' : ''}
        </Text>
        <StepsList exerciseId={node.id} tierColor={TIER_COLORS[node.tier]} />
      </View>
    );
  }

  function StepsList({ exerciseId, tierColor }: { exerciseId: number; tierColor: string }) {
    const [steps, setSteps] = useState<Awaited<ReturnType<typeof getExerciseSteps>>>([]);
    useFocusEffect(
      useCallback(() => {
        getExerciseSteps(db, exerciseId)
          .then(setSteps)
          .catch((e) => console.warn('Progression : impossible de lire les étapes', e));
      }, [exerciseId])
    );
    if (steps.length === 0) return null;
    return (
      <View style={{ marginTop: 12, gap: 8 }}>
        <Pressable onPress={() => setStepsOpen((o) => !o)} hitSlop={6}>
          <Text style={{ color: '#007AFF', fontWeight: '700' }}>
            {stepsOpen ? '▾' : '▸'} Étapes de progression ({steps.length})
          </Text>
        </Pressable>
        {stepsOpen &&
          steps.map((step, i) => (
            <View key={step.id} style={[styles.stepCard, { backgroundColor: colors.backgroundSelected }]}>
              <View style={styles.stepHeader}>
                {(() => {
                  const src = getStepImageSource(step.image);
                  return src ? (
                    <Pressable onPress={() => void Linking.openURL(step.video || step.image)}>
                      <Image source={src} style={styles.stepImage} resizeMode="cover" />
                      {!!step.video && (
                        <View style={styles.vidBadge}>
                          <Text style={{ color: '#fff', fontSize: 10 }}>▶</Text>
                        </View>
                      )}
                    </Pressable>
                  ) : (
                    <View style={[styles.stepBadge, { backgroundColor: tierColor }]}>
                      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{i + 1}</Text>
                    </View>
                  );
                })()}
                <Text style={{ color: colors.text, fontWeight: '700', flex: 1 }}>{step.name}</Text>
                {!!step.reps && (
                  <View style={styles.repsChip}>
                    <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700' }}>{step.reps}</Text>
                  </View>
                )}
              </View>
              {!!step.instructions && (
                <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 6 }}>
                  {step.instructions.trim()}
                </Text>
              )}
            </View>
          ))}
      </View>
    );
  }
}

function SectionLabel({ text, color }: { text: string; color: string }) {
  return (
    <Text style={{ color, fontWeight: '800', textTransform: 'uppercase', fontSize: 12, marginTop: 18, marginBottom: 6 }}>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 6 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  title: { fontSize: 26, fontWeight: '800' },
  linkLine: { width: 3, height: 16, borderRadius: 2, alignSelf: 'center', marginLeft: 30 },
  pathCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    padding: 12,
    marginBottom: 6,
  },
  locked: { opacity: 0.55 },
  nodeIcon: { fontSize: 16 },
  nodeImage: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#0001',
  },
  track: { height: 5, borderRadius: 3, overflow: 'hidden' },
  currentCard: {
    borderWidth: 2,
    borderRadius: 14,
    padding: 14,
  },
  detailButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  stepCard: {
    borderRadius: 10,
    padding: 10,
  },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepImage: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: '#0001',
  },
  vidBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#000a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  repsChip: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#8884',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
});
