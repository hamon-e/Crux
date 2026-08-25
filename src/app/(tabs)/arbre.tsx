import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { File, Paths } from 'expo-file-system';

import { getSkillExercises } from '@/db/queries';
import { getStepImageSource } from '@/db/skill-images';
import { useTheme } from '@/hooks/use-theme';
import {
  TIER_COLORS,
  TIER_ICONS,
  TIER_LABELS,
  buildSkillTree,
  type SkillNode,
} from '@/lib/skill-tree';

// Les fondamentaux sont affichés en premier (base de l'arbre).
const DISPLAY_ORDER = ['fundamental', 'beginner', 'intermediate', 'advanced', 'ultimate'] as const;

type DisplayTier = (typeof DISPLAY_ORDER)[number];
type SkillFilter = 'all' | 'mastered' | 'unmastered';

const SKILL_FILTERS: { value: SkillFilter; label: string }[] = [
  { value: 'all', label: 'Tous les exos' },
  { value: 'mastered', label: 'Juste les réussis' },
  { value: 'unmastered', label: 'Masquer les réussis' },
];

const COLLAPSED_FILE = 'arbre-collapsed.json';

async function loadCollapsedTiers(): Promise<Partial<Record<DisplayTier, boolean>>> {
  try {
    const file = new File(Paths.document, COLLAPSED_FILE);
    if (!file.exists) return {};
    return JSON.parse(await file.text());
  } catch {
    return {};
  }
}

function saveCollapsedTiers(collapsed: Partial<Record<DisplayTier, boolean>>) {
  try {
    const file = new File(Paths.document, COLLAPSED_FILE);
    file.write(JSON.stringify(collapsed));
  } catch (e) {
    console.warn('Arbre : impossible de sauvegarder les niveaux repliés', e);
  }
}

export default function SkillTreeScreen() {
  const db = useSQLiteContext();
  const colors = useTheme();
  const [skills, setSkills] = useState<SkillNode[]>([]);
  const [collapsed, setCollapsed] = useState<Partial<Record<DisplayTier, boolean>>>({});
  const [skillFilter, setSkillFilter] = useState<SkillFilter>('all');

  useEffect(() => {
    void loadCollapsedTiers().then(setCollapsed);
  }, []);

  const toggleTier = useCallback((tier: DisplayTier) => {
    setCollapsed((prev) => {
      const next = { ...prev, [tier]: !prev[tier] };
      saveCollapsedTiers(next);
      return next;
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        try {
          setSkills(Object.values(buildSkillTree(await getSkillExercises(db))).flat());
        } catch (e) {
          console.warn('Arbre : impossible de lire les compétences', e);
        }
      })();
    }, [db])
  );

  const tree = buildSkillTree(skills);
  const masteredCount = skills.filter((s) => s.mastered).length;
  const unlockedCount = skills.filter((s) => s.unlocked).length;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>Arbre de compétences</Text>
        <Text style={{ color: colors.textSecondary }}>
          {masteredCount}/{skills.length} maîtrisées · {unlockedCount} débloquées
        </Text>

        <View
          style={[styles.filterControl, { borderColor: colors.backgroundSelected }]}
          accessibilityRole="radiogroup"
          accessibilityLabel="Filtrer les exercices">
          {SKILL_FILTERS.map((filter) => {
            const selected = skillFilter === filter.value;
            return (
              <Pressable
                key={filter.value}
                style={[
                  styles.filterOption,
                  selected && { backgroundColor: colors.backgroundSelected },
                ]}
                onPress={() => setSkillFilter(filter.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}>
                <Text
                  style={[
                    styles.filterOptionText,
                    { color: selected ? colors.text : colors.textSecondary },
                    selected && styles.filterOptionTextSelected,
                  ]}>
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {DISPLAY_ORDER.map((tier, sectionIdx) => {
          const allNodes = tree[tier];
          if (allNodes.length === 0) return null;
          const nodes =
            skillFilter === 'mastered'
              ? allNodes.filter((n) => n.mastered)
              : skillFilter === 'unmastered'
                ? allNodes.filter((n) => !n.mastered)
                : allNodes;
          const tierColor = TIER_COLORS[tier];
          const isCollapsed = !!collapsed[tier];
          if (nodes.length === 0 && isCollapsed) return null;
          return (
            <View key={tier}>
              {sectionIdx > 0 && (
                <View style={[styles.connector, { backgroundColor: colors.backgroundSelected }]} />
              )}
              <Pressable
                style={styles.sectionHeader}
                onPress={() => toggleTier(tier)}
                accessibilityRole="button"
                accessibilityState={{ expanded: !isCollapsed }}>
                <Text style={styles.sectionIcon}>{TIER_ICONS[tier]}</Text>
                <Text style={[styles.sectionTitle, { color: tierColor }]}>{TIER_LABELS[tier]}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  {allNodes.filter((n) => n.mastered).length}/{allNodes.length}
                </Text>
                <Text style={[styles.chevron, { color: colors.textSecondary }]}>
                  {isCollapsed ? '▸' : '▾'}
                </Text>
              </Pressable>
              {!isCollapsed &&
                (nodes.length > 0 ? (
                  <View style={styles.grid}>
                    {nodes.map((node) => (
                      <SkillCard
                        key={node.id}
                        node={node}
                        onPress={() => router.push(`/progression/${node.id}`)}
                      />
                    ))}
                  </View>
                ) : (
                  <Text style={{ color: colors.textSecondary, fontSize: 13, fontStyle: 'italic' }}>
                    {skillFilter === 'mastered' ? 'Aucun exercice réussi ici.' : 'Tout est maîtrisé ici 🎉'}
                  </Text>
                ))}
            </View>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function SkillCard({ node, onPress }: { node: SkillNode; onPress: () => void }) {
  const colors = useTheme();
  const tierColor = TIER_COLORS[node.tier];

  return (
      <Pressable
        style={[
          styles.card,
          { backgroundColor: colors.backgroundElement },
          !node.unlocked && styles.locked,
        ]}
        onPress={onPress}>
        <View style={styles.cardHeader}>
          {(() => {
            const src = getStepImageSource(node.cover_image ?? null);
            return src ? (
              <Image source={src} style={styles.cardImage} resizeMode="cover" />
            ) : (
              <View style={[styles.cardImagePlaceholder, { backgroundColor: colors.backgroundSelected }]}>
                <Text style={{ fontSize: 18 }}>{TIER_ICONS[node.tier]}</Text>
              </View>
            );
          })()}
          <Text
            style={[
              styles.cardName,
              { color: node.unlocked ? colors.text : colors.textSecondary },
            ]}
            numberOfLines={2}>
            {node.name}
          </Text>
          <Text style={styles.statusIcon}>{node.mastered ? '✅' : node.unlocked ? '🔓' : '🔒'}</Text>
        </View>
      <View style={[styles.track, { backgroundColor: colors.backgroundSelected }]}>
        <View
          style={[
            styles.fill,
            {
              backgroundColor: node.mastered ? '#34c759' : tierColor,
              width: `${Math.round(node.progress * 100)}%`,
              opacity: node.unlocked ? 1 : 0.35,
            },
          ]}
        />
      </View>
      <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 4 }}>
        {node.mastered ? 'Skill validé' : node.unlocked ? 'Skill à valider' : 'Skill verrouillé'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, gap: 10 },
  title: { fontSize: 32, fontWeight: '800' },
  connector: { width: 3, height: 22, borderRadius: 2, alignSelf: 'center' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    marginBottom: 6,
  },
  sectionIcon: { fontSize: 18 },
  sectionTitle: { fontSize: 17, fontWeight: '800', textTransform: 'uppercase', flex: 1 },
  chevron: { fontSize: 14 },
  filterControl: {
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 3,
    alignSelf: 'stretch',
  },
  filterOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  filterOptionText: {
    fontSize: 12,
    textAlign: 'center',
  },
  filterOptionTextSelected: {
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    flexGrow: 1,
    flexBasis: '46%',
    maxWidth: '48%',
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  locked: { opacity: 0.55 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  cardImage: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#0001',
  },
  cardImagePlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardName: { fontWeight: '700', fontSize: 13, flex: 1 },
  statusIcon: { fontSize: 13 },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 3 },
});
