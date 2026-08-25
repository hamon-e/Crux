import { useCallback, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import {
  getExerciseSteps,
  getProgressions,
  toggleExerciseStepValidation,
  validateProgressionsManually,
} from '@/db/queries';
import { getStepImageSource } from '@/db/skill-images';
import { useTheme } from '@/hooks/use-theme';
import {
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
  const [refreshKey, setRefreshKey] = useState(0);
  const [validating, setValidating] = useState(false);
  const [hideMastered, setHideMastered] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        try {
          const tree = buildSkillTree(await getProgressions(db));
          setNodes(Object.values(tree).flat());
        } catch (e) {
          console.warn('Progression : impossible de lire les compétences', e);
        }
      })();
      // refreshKey force le rechargement après une validation manuelle.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [db, refreshKey])
  );

  async function handleManualValidate(progressionId: number) {
    if (validating) return;
    try {
      setValidating(true);
      const selected = nodes.find((node) => node.id === progressionId);
      if (!selected) return;

      const selectedTierIdx = TIERS.indexOf(selected.tier);
      const progressionsToValidate = nodes
        .filter(
          (node) =>
            node.category === selected.category &&
            TIERS.indexOf(node.tier) <= selectedTierIdx &&
            !node.mastered
        )
        .map((node) => node.id);
      await validateProgressionsManually(db, progressionsToValidate);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      console.warn('Progression : validation manuelle impossible', e);
    } finally {
      setValidating(false);
    }
  }

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
  const prerequisites = sameCategory.filter(
    (n) => TIERS.indexOf(n.tier) < currentTierIdx && (!hideMastered || !n.mastered)
  );
  const unlocks = sameCategory.filter(
    (n) => TIERS.indexOf(n.tier) > currentTierIdx && (!hideMastered || !n.mastered)
  );
  const hasMasteredAround = sameCategory.some((n) => n.mastered && n.id !== current.id);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={{ color: '#007AFF', fontWeight: '600' }}>‹ Arbre</Text>
        </Pressable>

        {hasMasteredAround && (
          <Pressable
            style={[styles.filterButton, { borderColor: colors.backgroundSelected }]}
            onPress={() => setHideMastered((h) => !h)}
            accessibilityRole="button"
            accessibilityState={{ selected: hideMastered }}>
            <Text style={{ fontSize: 14 }}>{hideMastered ? '☑' : '☐'}</Text>
            <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>
              Masquer les progressions validées
            </Text>
          </Pressable>
        )}

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
            <SectionLabel text="Ce qui mène à cette progression" color={colors.textSecondary} />
            {prerequisites.map((node) => (
              <PathNode key={node.id} node={node} onPress={() => router.push(`/progression/${node.id}`)} />
            ))}
            <View style={[styles.linkLine, { backgroundColor: colors.backgroundSelected }]} />
          </>
        )}

        <SectionLabel text="Progression sélectionnée" color={TIER_COLORS[current.tier]} />
        <CurrentNode node={current} />

        {unlocks.length > 0 && (
          <>
            <SectionLabel text="Ce que cette progression débloque" color={colors.textSecondary} />
            {unlocks.map((node) => (
              <PathNode key={node.id} node={node} onPress={() => router.push(`/progression/${node.id}`)} />
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
        style={[
          styles.pathCard,
          { backgroundColor: node.mastered ? '#34c75922' : colors.backgroundElement },
          !node.unlocked && styles.locked,
        ]}
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
          {node.mastered ? '✅ Progression validée' : node.unlocked ? '🔓 À valider' : '🔒 Verrouillée'}
        </Text>
      </Pressable>
    );
  }

  function CurrentNode({ node }: { node: SkillNode }) {
    return (
      <View
        style={[
          styles.currentCard,
          {
            backgroundColor: node.mastered ? '#34c75922' : colors.backgroundElement,
            borderColor: TIER_COLORS[node.tier],
          },
        ]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 20 }}>{node.mastered ? '✅' : node.unlocked ? '🔓' : '🔒'}</Text>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16, flex: 1 }}>{node.name}</Text>
        </View>
        <Text style={{ color: colors.textSecondary, marginTop: 6 }}>
          {node.mastered ? 'Progression validée' : 'Progression non validée'}
        </Text>
        {!node.mastered && (
          <Pressable
            style={[styles.detailButton, { borderColor: TIER_COLORS[node.tier], opacity: validating ? 0.5 : 1 }]}
            onPress={() => void handleManualValidate(node.id)}
            disabled={validating}>
            <Text style={{ color: TIER_COLORS[node.tier], fontWeight: '700' }}>
              {validating ? 'Validation…' : '✓ Valider la progression'}
            </Text>
          </Pressable>
        )}
        <StepsList exerciseId={node.id} tierColor={TIER_COLORS[node.tier]} />
      </View>
    );
  }

  function StepsList({ exerciseId, tierColor }: { exerciseId: number; tierColor: string }) {
    const [steps, setSteps] = useState<Awaited<ReturnType<typeof getExerciseSteps>>>([]);
    const [validatingStep, setValidatingStep] = useState<number | null>(null);
    const [expandedSteps, setExpandedSteps] = useState<Record<number, boolean>>({});
    useFocusEffect(
      useCallback(() => {
        getExerciseSteps(db, exerciseId)
          .then(setSteps)
          .catch((e) => console.warn('Progression : impossible de lire les étapes', e));
      }, [exerciseId])
    );
    if (steps.length === 0) return null;
    const validatedSteps = steps.filter((step) => step.validated === 1).length;
    const validationPercent = Math.round((validatedSteps / steps.length) * 100);
    return (
      <View style={{ marginTop: 12, gap: 8 }}>
        <Pressable onPress={() => setStepsOpen((o) => !o)} hitSlop={6}>
          <Text style={{ color: '#007AFF', fontWeight: '700' }}>
            {stepsOpen ? '▾' : '▸'} Étapes de progression ({steps.length})
          </Text>
        </Pressable>
        <View style={styles.stepsProgress}>
          <View style={styles.stepsProgressHeader}>
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700' }}>
              Validation des étapes
            </Text>
            <Text style={{ color: validationPercent === 100 ? '#34c759' : tierColor, fontSize: 12, fontWeight: '800' }}>
              {validationPercent}% ({validatedSteps}/{steps.length})
            </Text>
          </View>
          <View style={[styles.stepProgressTrack, { backgroundColor: colors.backgroundSelected }]}>
            <View
              style={[
                styles.stepProgressFill,
                { width: `${validationPercent}%`, backgroundColor: validationPercent === 100 ? '#34c759' : tierColor },
              ]}
            />
          </View>
        </View>
        {stepsOpen &&
          steps.map((step, i) => (
            <Pressable
              key={step.id}
              style={[styles.stepCard, { backgroundColor: colors.backgroundSelected }]}
              onPress={() => setExpandedSteps((current) => ({ ...current, [step.id]: !current[step.id] }))}
              accessibilityRole="button"
              accessibilityState={{ expanded: !!expandedSteps[step.id] }}>
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
                <Pressable
                  style={[styles.stepValidateButton, { borderColor: step.validated ? '#34c759' : tierColor }]}
                  disabled={validatingStep === step.step_order}
                  onPress={() => {
                    setValidatingStep(step.step_order);
                    void toggleExerciseStepValidation(db, exerciseId, step.step_order)
                      .then(() => getExerciseSteps(db, exerciseId).then(setSteps))
                      .catch((e) => console.warn('Progression : validation de l’étape impossible', e))
                      .finally(() => setValidatingStep(null));
                  }}>
                  <Text style={{ color: step.validated ? '#34c759' : tierColor, fontWeight: '700', fontSize: 11 }}>
                    {step.validated ? '✓ Validée' : validatingStep === step.step_order ? '…' : 'Valider'}
                  </Text>
                </Pressable>
              </View>
              {expandedSteps[step.id] && (
                <View style={styles.stepDetails}>
                  {!!step.instructions && (
                    <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
                      {step.instructions.trim()}
                    </Text>
                  )}
                </View>
              )}
            </Pressable>
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
  content: { padding: 20, gap: 6 },  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  title: { fontSize: 26, fontWeight: '800' },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
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
  stepValidateButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  stepCard: {
    borderRadius: 10,
    padding: 10,
  },
  stepsProgress: { gap: 5 },
  stepsProgressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stepProgressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  stepProgressFill: { height: '100%', borderRadius: 3 },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepDetails: { gap: 6, marginTop: 6 },
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
