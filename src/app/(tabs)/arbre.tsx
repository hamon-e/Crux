import { useCallback, useEffect, useState } from "react";
import { BackHandler, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { File, Paths } from "expo-file-system";

import { getExercises, getProgressions } from "@/db/queries";
import type { Exercise } from "@/db/types";
import { getStepImageSource } from "@/db/skill-images";
import { useTheme } from "@/hooks/use-theme";
import { alert } from "@/lib/alert";
import {
  completeExerciseTreeSelection,
  getExerciseTreeSelection,
} from "@/lib/exercise-tree-selection";
import {
  TIER_COLORS,
  TIER_ICONS,
  TIER_LABELS,
  buildSkillTree,
  progressionMatchesSearch,
  type SkillNode,
} from "@/lib/skill-tree";
import { normalizeSkillName, SKILL_STEPS } from "@/db/skill-steps";

// Les fondamentaux sont affichés en premier (base de l'arbre).
const DISPLAY_ORDER = ["fundamental", "beginner", "intermediate", "advanced", "ultimate"] as const;

type DisplayTier = (typeof DISPLAY_ORDER)[number];
type SkillFilter = "mastered" | "unmastered" | "in-progress" | null;

const SKILL_FILTERS: { value: SkillFilter; label: string }[] = [
  { value: "mastered", label: "Validés" },
  { value: "unmastered", label: "À valider" },
  { value: "in-progress", label: "En cours" },
];

const COLLAPSED_FILE = "arbre-collapsed.json";

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
    console.warn("Arbre : impossible de sauvegarder les niveaux repliés", e);
  }
}

export default function SkillTreeScreen() {
  const db = useSQLiteContext();
  const colors = useTheme();
  const { search, selectExercise: selectExerciseParam, templateId } = useLocalSearchParams<{
    search?: string;
    selectExercise?: string;
    templateId?: string;
  }>();
  const [skills, setSkills] = useState<SkillNode[]>([]);
  const [collapsed, setCollapsed] = useState<Partial<Record<DisplayTier, boolean>>>({});
  const [skillFilter, setSkillFilter] = useState<SkillFilter>(null);
  const [selectingId, setSelectingId] = useState<number | null>(null);
  const [selectedProgressionId, setSelectedProgressionId] = useState<number | null>(null);
  const [stepExercises, setStepExercises] = useState<Exercise[]>([]);

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
      setSelectedProgressionId(null);
      void (async () => {
        try {
          const [progressions, exercises] = await Promise.all([
            getProgressions(db),
            getExercises(db, undefined, undefined, undefined, true),
          ]);
          setSkills(Object.values(buildSkillTree(progressions)).flat());
          setStepExercises(exercises);
        } catch (e) {
          console.warn("Arbre : impossible de lire les compétences", e);
        }
      })();
    }, [db]),
  );

  const tree = buildSkillTree(skills);
  const treeSearch = typeof search === "string" ? search.trim() : "";
  const selectionRequest = selectExerciseParam === "1" ? getExerciseTreeSelection() : null;
  const isSelectionMode = selectionRequest !== null;
  const masteredCount = skills.filter((s) => s.mastered).length;
  const unlockedCount = skills.filter((s) => s.unlocked).length;
  const stepExerciseIdByName = new Map(
    stepExercises.map((exercise) => [normalizeSkillName(exercise.name), exercise.id]),
  );
  const selectedProgression = skills.find((skill) => skill.id === selectedProgressionId) ?? null;
  const selectedProgressionSteps = selectedProgression
    ? (
        SKILL_STEPS.find((item) => item.key === normalizeSkillName(selectedProgression.name))
          ?.steps ?? []
      ).flatMap((step) => {
        const exerciseId = stepExerciseIdByName.get(normalizeSkillName(step.name));
        return exerciseId ? [{ exerciseId, name: step.name }] : [];
      })
    : [];

  function selectExercise(exerciseId: number) {
    setSelectingId(exerciseId);
    void completeExerciseTreeSelection(exerciseId)
      .then((completed) => {
        if (!completed) {
          alert("Sélection expirée", "Reviens à l'écran précédent et rouvre l'arbre.");
          setSelectingId(null);
        }
      })
      .catch(() => {
        alert("Erreur", "Impossible de sélectionner cet exercice.");
        setSelectingId(null);
      });
  }

  const returnToExerciseSearch = useCallback(() => {
    if (!templateId) {
      router.back();
      return;
    }

    router.navigate({
      pathname: "/ajouter-exercice",
      params: {
        mode: "template",
        templateId,
        ...(treeSearch ? { search: treeSearch } : {}),
      },
    });
  }, [templateId, treeSearch]);

  useFocusEffect(
    useCallback(() => {
      if (!isSelectionMode) return;

      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        if (selectedProgressionId !== null) {
          setSelectedProgressionId(null);
        } else {
          returnToExerciseSearch();
        }
        return true;
      });

      return () => subscription.remove();
    }, [isSelectionMode, returnToExerciseSearch, selectedProgressionId]),
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>Arbre de compétences</Text>
        <Text style={{ color: colors.textSecondary }}>
          {masteredCount}/{skills.length} maîtrisées · {unlockedCount} débloquées
        </Text>

        {isSelectionMode && (
          <View
            style={[
              styles.selectionNotice,
              { backgroundColor: colors.backgroundElement, borderColor: "#007AFF" },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: "800" }}>
                {selectionRequest.title}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                {selectedProgression
                  ? `Choisis une étape de « ${selectedProgression.name} ».`
                  : "Choisis d’abord une progression."}
              </Text>
            </View>
            <Pressable
              onPress={() =>
                selectedProgression ? setSelectedProgressionId(null) : returnToExerciseSearch()
              }
              accessibilityRole="button"
              accessibilityLabel={
                selectedProgression
                  ? "Revenir aux progressions"
                  : "Revenir à la recherche classique"
              }
            >
              <Text style={{ color: "#007AFF", fontWeight: "700" }}>
                {selectedProgression ? "Progressions" : "Précédent"}
              </Text>
            </Pressable>
          </View>
        )}

        {isSelectionMode && selectedProgression ? (
          <View style={{ gap: 10 }}>
            <View style={styles.stepPickerHeader}>
              <Text style={{ fontSize: 24 }}>{TIER_ICONS[selectedProgression.tier]}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.stepPickerTitle, { color: colors.text }]}>
                  {selectedProgression.name}
                </Text>
                <Text
                  style={{
                    color: TIER_COLORS[selectedProgression.tier],
                    fontWeight: "700",
                    fontSize: 12,
                  }}
                >
                  {TIER_LABELS[selectedProgression.tier]}
                </Text>
              </View>
            </View>
            {selectedProgressionSteps.length > 0 ? (
              <View style={styles.grid}>
                {selectedProgressionSteps.map((step) => (
                  <StepSelectionCard
                    key={step.exerciseId}
                    name={step.name}
                    parent={selectedProgression.name}
                    node={selectedProgression}
                    selecting={selectingId === step.exerciseId}
                    onPress={() => selectExercise(step.exerciseId)}
                  />
                ))}
              </View>
            ) : (
              <Text style={{ color: colors.textSecondary, fontStyle: "italic" }}>
                Aucun exercice sélectionnable dans cette progression.
              </Text>
            )}
          </View>
        ) : (
          <>
            {treeSearch && (
              <View
                style={[
                  styles.searchNotice,
                  { backgroundColor: colors.backgroundElement, borderColor: colors.border },
                ]}
              >
                <Text style={{ color: colors.text, flex: 1 }} numberOfLines={1}>
                  Résultats pour « {treeSearch} »
                </Text>
                <Pressable
                  onPress={() => router.setParams({ search: undefined })}
                  accessibilityRole="button"
                  accessibilityLabel="Effacer la recherche dans l'arbre"
                >
                  <Text style={{ color: "#007AFF", fontWeight: "700" }}>Effacer</Text>
                </Pressable>
              </View>
            )}

            <View
              style={[
                styles.filterControl,
                { backgroundColor: colors.backgroundElement, borderColor: colors.border },
              ]}
              accessibilityRole="radiogroup"
              accessibilityLabel="Filtrer les progressions"
            >
              {SKILL_FILTERS.map((filter) => {
                const selected = skillFilter === filter.value;
                return (
                  <Pressable
                    key={filter.value}
                    style={[
                      styles.filterOption,
                      {
                        backgroundColor: selected ? colors.text : colors.background,
                        borderColor: selected ? colors.text : colors.border,
                      },
                    ]}
                    onPress={() => setSkillFilter(selected ? null : filter.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    <Text
                      style={[
                        styles.filterOptionText,
                        { color: selected ? colors.background : colors.text },
                        selected && styles.filterOptionTextSelected,
                      ]}
                    >
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
                skillFilter === "mastered"
                  ? allNodes.filter((n) => n.mastered)
                  : skillFilter === "unmastered"
                    ? allNodes.filter((n) => !n.mastered)
                    : skillFilter === "in-progress"
                      ? allNodes.filter((n) => !n.mastered && n.validationProgress > 0)
                      : allNodes;
              const matchingNodes = nodes.filter((node) =>
                progressionMatchesSearch(node, treeSearch),
              );
              const tierColor = TIER_COLORS[tier];
              const isCollapsed = !!collapsed[tier];
              if (matchingNodes.length === 0 && isCollapsed) return null;
              return (
                <View key={tier}>
                  {sectionIdx > 0 && (
                    <View
                      style={[styles.connector, { backgroundColor: colors.backgroundSelected }]}
                    />
                  )}
                  <Pressable
                    style={styles.sectionHeader}
                    onPress={() => toggleTier(tier)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: !isCollapsed }}
                  >
                    <Text style={styles.sectionIcon}>{TIER_ICONS[tier]}</Text>
                    <Text style={[styles.sectionTitle, { color: tierColor }]}>
                      {TIER_LABELS[tier]}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                      {allNodes.filter((n) => n.mastered).length}/{allNodes.length}
                    </Text>
                    <Text style={[styles.chevron, { color: colors.textSecondary }]}>
                      {isCollapsed ? "▸" : "▾"}
                    </Text>
                  </Pressable>
                  {!isCollapsed &&
                    (matchingNodes.length > 0 ? (
                      <View style={styles.grid}>
                        {matchingNodes.map((node) => (
                          <SkillCard
                            key={node.id}
                            node={node}
                            selecting={false}
                            selectionMode={isSelectionMode}
                            onPress={() =>
                              isSelectionMode
                                ? setSelectedProgressionId(node.id)
                                : router.push(`/progression/${node.id}`)
                            }
                          />
                        ))}
                      </View>
                    ) : (
                      <Text
                        style={{ color: colors.textSecondary, fontSize: 13, fontStyle: "italic" }}
                      >
                        {treeSearch
                          ? "Aucune progression ne correspond dans ce niveau."
                          : skillFilter === "mastered"
                            ? "Aucune progression validée ici."
                            : skillFilter === "unmastered"
                              ? "Aucune progression à valider ici."
                              : skillFilter === "in-progress"
                                ? "Aucune progression en cours ici."
                                : "Tout est maîtrisé ici 🎉"}
                      </Text>
                    ))}
                </View>
              );
            })}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function SkillCard({
  node,
  onPress,
  selectionMode,
  selecting,
}: {
  node: SkillNode;
  onPress: () => void;
  selectionMode: boolean;
  selecting: boolean;
}) {
  const colors = useTheme();
  const tierColor = TIER_COLORS[node.tier];

  return (
    <Pressable
      style={[
        styles.card,
        { backgroundColor: colors.backgroundElement },
        !node.unlocked && styles.locked,
      ]}
      onPress={onPress}
      disabled={selecting}
    >
      <View style={styles.cardHeader}>
        {(() => {
          const src = getStepImageSource(node.cover_image ?? null);
          return src ? (
            <Image source={src} style={styles.cardImage} resizeMode="cover" />
          ) : (
            <View
              style={[styles.cardImagePlaceholder, { backgroundColor: colors.backgroundSelected }]}
            >
              <Text style={{ fontSize: 18 }}>{TIER_ICONS[node.tier]}</Text>
            </View>
          );
        })()}
        <Text
          style={[styles.cardName, { color: node.unlocked ? colors.text : colors.textSecondary }]}
          numberOfLines={2}
        >
          {node.name}
        </Text>
        <Text style={styles.statusIcon}>
          {selectionMode
            ? selecting
              ? "…"
              : "＋"
            : node.mastered
              ? "✅"
              : node.unlocked
                ? "🔓"
                : "🔒"}
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.backgroundSelected }]}>
        <View
          style={[
            styles.fill,
            {
              backgroundColor: node.mastered ? "#34c759" : tierColor,
              width: `${Math.round(node.validationProgress * 100)}%`,
              opacity: node.unlocked ? 1 : 0.35,
            },
          ]}
        />
      </View>
      <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 4 }}>
        {node.mastered
          ? "Progression validée"
          : node.unlocked
            ? "Progression à valider"
            : "Progression verrouillée"}
      </Text>
    </Pressable>
  );
}

function StepSelectionCard({
  name,
  parent,
  node,
  selecting,
  onPress,
}: {
  name: string;
  parent: string;
  node: SkillNode;
  selecting: boolean;
  onPress: () => void;
}) {
  const colors = useTheme();
  return (
    <Pressable
      style={[
        styles.card,
        { backgroundColor: colors.backgroundElement },
        !node.unlocked && styles.locked,
      ]}
      onPress={onPress}
      disabled={selecting}
    >
      <View style={styles.cardHeader}>
        <Text style={{ fontSize: 18 }}>{selecting ? "…" : "＋"}</Text>
        <View style={{ flex: 1 }}>
          <Text
            style={[styles.cardName, { color: node.unlocked ? colors.text : colors.textSecondary }]}
            numberOfLines={2}
          >
            {name}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 11 }} numberOfLines={1}>
            {parent}
          </Text>
        </View>
      </View>
      <Text style={{ color: "#007AFF", fontSize: 11, fontWeight: "700" }}>Étape d’exercice</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, gap: 10 },
  title: { fontSize: 32, fontWeight: "800" },
  connector: { width: 3, height: 22, borderRadius: 2, alignSelf: "center" },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    marginBottom: 6,
  },
  sectionIcon: { fontSize: 18 },
  sectionTitle: { fontSize: 17, fontWeight: "800", textTransform: "uppercase", flex: 1 },
  chevron: { fontSize: 14 },
  filterControl: {
    flexDirection: "row",
    gap: 4,
    borderWidth: 1,
    borderRadius: 10,
    padding: 4,
    alignSelf: "stretch",
  },
  filterOption: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 7,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 7,
  },
  filterOptionText: {
    fontSize: 12,
    textAlign: "center",
  },
  filterOptionTextSelected: {
    fontWeight: "700",
  },
  searchNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectionNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  stepPickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  stepPickerTitle: { fontSize: 20, fontWeight: "800" },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  card: {
    flexGrow: 1,
    flexBasis: "46%",
    maxWidth: "48%",
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  locked: { opacity: 0.55 },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  cardImage: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#0001",
  },
  cardImagePlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  cardName: { fontWeight: "700", fontSize: 13, flex: 1 },
  statusIcon: { fontSize: 13 },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: 3 },
});
