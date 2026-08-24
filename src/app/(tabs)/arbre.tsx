import { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { getSkillExercises } from '@/db/queries';
import { getStepImageSource } from '@/db/skill-images';
import { useTheme } from '@/hooks/use-theme';
import {
  MASTERY_SESSIONS,
  TIER_COLORS,
  TIER_ICONS,
  TIER_LABELS,
  buildSkillTree,
  type SkillNode,
} from '@/lib/skill-tree';

// Les compétences ultimes sont affichées en premier (première page de l'arbre).
const DISPLAY_ORDER = ['ultimate', 'advanced', 'intermediate', 'beginner', 'fundamental'] as const;

export default function SkillTreeScreen() {
  const db = useSQLiteContext();
  const colors = useTheme();
  const [skills, setSkills] = useState<SkillNode[]>([]);

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

        {DISPLAY_ORDER.map((tier, sectionIdx) => {
          const nodes = tree[tier];
          if (nodes.length === 0) return null;
          const tierColor = TIER_COLORS[tier];
          return (
            <View key={tier}>
              {sectionIdx > 0 && (
                <View style={[styles.connector, { backgroundColor: colors.backgroundSelected }]} />
              )}
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionIcon}>{TIER_ICONS[tier]}</Text>
                <Text style={[styles.sectionTitle, { color: tierColor }]}>{TIER_LABELS[tier]}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  {nodes.filter((n) => n.mastered).length}/{nodes.length}
                </Text>
              </View>
              <View style={styles.grid}>
                {nodes.map((node) => (
                  <SkillCard
                    key={node.id}
                    node={node}
                    onPress={() => router.push(`/progression/${node.id}`)}
                  />
                ))}
              </View>
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
        {node.mastered
          ? `Maîtrisée (${MASTERY_SESSIONS} séances)`
          : `${node.sessions}/${MASTERY_SESSIONS} séances`}
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
