import { useEffect, useState } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';

import { ExerciseImage } from '@/components/exercise-image';
import { ExerciseOriginTag } from '@/components/exercise-origin-tag';
import { addSet, addTemplateExercise, createExercise, getActiveWorkout, getExercises } from '@/db/queries';
import { EQUIPMENT, MUSCLES, MUSCLE_LABELS, type Exercise } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';
import { alert } from '@/lib/alert';
import { beginExerciseTreeSelection } from '@/lib/exercise-tree-selection';

const TAGS = [
  { value: 'strength', label: 'Force' },
  { value: 'mobility', label: 'Mobilité' },
];

export default function AddExerciseScreen() {
  const db = useSQLiteContext();
  const colors = useTheme();
  const params = useLocalSearchParams<{ mode?: string; templateId?: string }>();
  const mode = params.mode ?? 'workout';

  const [search, setSearch] = useState('');
  const [muscleFilter, setMuscleFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMuscle, setNewMuscle] = useState<string>('chest');
  const [newEquipment, setNewEquipment] = useState<string>('barbell');

  useEffect(() => {
    void getExercises(db, search || undefined, muscleFilter ?? undefined, tagFilter ?? undefined).then(setExercises);
  }, [db, search, muscleFilter, tagFilter]);

  async function pick(exercise: Exercise) {
    if (mode === 'template' && params.templateId) {
      await addTemplateExercise(db, Number(params.templateId), exercise.id);
    } else {
      const active = await getActiveWorkout(db);
      if (!active) {
        alert('Erreur', 'Aucune séance en cours.');
        return;
      }
      await addSet(db, active.id, exercise.id);
    }
    router.back();
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      const id = await createExercise(db, newName.trim(), newMuscle, newEquipment);
      setCreateOpen(false);
      setNewName('');
      await pick({
        id,
        name: newName.trim(),
        muscle: newMuscle,
        equipment: newEquipment,
        is_custom: 1,
      });
    } catch {
      alert('Erreur', 'Un exercice porte déjà ce nom.');
    }
  }

  function searchInSkillTree() {
    if (mode !== 'template' || !params.templateId) return;
    const templateId = Number(params.templateId);

    beginExerciseTreeSelection({
      title: 'Ajouter à la routine',
      onSelect: async (exerciseId) => {
        await addTemplateExercise(db, templateId, exerciseId);
        router.dismissTo(`/routines/${templateId}`);
      },
    });
    const treeSearch = search.trim();
    router.push({
      pathname: '/(tabs)/arbre',
      params: treeSearch
        ? { search: treeSearch, selectExercise: '1' }
        : { selectExercise: '1' },
    });
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.searchRow}>
        <TextInput
          style={[styles.searchInput, { color: colors.text, borderColor: colors.backgroundSelected, backgroundColor: colors.backgroundElement }]}
          placeholder="Rechercher un exercice…"
          placeholderTextColor={colors.textSecondary}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
        />
        {mode === 'template' && params.templateId && (
          <Pressable onPress={searchInSkillTree} accessibilityRole="button">
            <Text style={{ color: '#007AFF', fontWeight: '600' }}>Arbre</Text>
          </Pressable>
        )}
        <Pressable onPress={() => setCreateOpen(true)}>
          <Text style={{ color: '#007AFF', fontWeight: '600' }}>+ Créer</Text>
        </Pressable>
      </View>

      <View style={styles.filters}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={TAGS}
          keyExtractor={(t) => t.value}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => setTagFilter(tagFilter === item.value ? null : item.value)}>
              <Text
                style={[
                  styles.chip,
                  {
                    color: colors.text,
                    borderColor: colors.backgroundSelected,
                    backgroundColor: colors.backgroundElement,
                  },
                  tagFilter === item.value && styles.chipActive,
                ]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
        />
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[null, ...MUSCLES]}
          keyExtractor={(m) => m ?? '__all__'}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => setMuscleFilter(muscleFilter === item ? null : item)}>
              <Text
                style={[
                  styles.chip,
                  {
                    color: colors.text,
                    borderColor: colors.backgroundSelected,
                    backgroundColor: colors.backgroundElement,
                  },
                  muscleFilter === item && styles.chipActive,
                ]}>
                {item === null ? 'Tous' : MUSCLE_LABELS[item] ?? item}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      <FlatList
        style={{ flex: 1 }}
        data={exercises}
        keyExtractor={(e) => String(e.id)}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => pick(item)}>
            <ExerciseImage name={item.name} muscle={item.muscle} width={64} radius={6} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ color: colors.text, fontSize: 16 }}>{item.name}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                {MUSCLE_LABELS[item.muscle] ?? item.muscle} · {item.equipment}
                {item.tags?.includes('mobility') ? ' · mobilité' : ''}
              </Text>
              <ExerciseOriginTag isCustom={item.is_custom} compact />
            </View>
            <Text style={{ color: '#007AFF' }}>+</Text>
          </Pressable>
        )}
      />

      <Modal visible={createOpen} animationType="slide" transparent onRequestClose={() => setCreateOpen(false)}>
        <View style={[styles.modalBackdrop, { backgroundColor: '#0009' }]}>
          <View style={[styles.modalCard, { backgroundColor: colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Nouvel exercice</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.backgroundSelected }]}
              placeholder="Nom de l'exercice"
              placeholderTextColor={colors.textSecondary}
              value={newName}
              onChangeText={setNewName}
            />
            <Text style={{ color: colors.textSecondary, marginTop: 12 }}>Muscle</Text>
            <View style={styles.optionRow}>
              {[...MUSCLES].map((m) => (
                <TouchableOpacity key={m} onPress={() => setNewMuscle(m)}>
                  <Text
                    style={[
                      styles.chip,
                      {
                        color: colors.text,
                        borderColor: colors.backgroundSelected,
                        backgroundColor: colors.backgroundElement,
                      },
                      newMuscle === m && styles.chipActive,
                    ]}
                  >
                    {MUSCLE_LABELS[m]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={{ color: colors.textSecondary, marginTop: 12 }}>Matériel</Text>
            <View style={styles.optionRow}>
              {[...EQUIPMENT].map((eq) => (
                <TouchableOpacity key={eq} onPress={() => setNewEquipment(eq)}>
                  <Text
                    style={[
                      styles.chip,
                      {
                        color: colors.text,
                        borderColor: colors.backgroundSelected,
                        backgroundColor: colors.backgroundElement,
                      },
                      newEquipment === eq && styles.chipActive,
                    ]}
                  >
                    {eq}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalActions}>
              <Pressable onPress={() => setCreateOpen(false)}>
                <Text style={{ color: colors.textSecondary }}>Annuler</Text>
              </Pressable>
              <Pressable onPress={handleCreate}>
                <Text style={{ color: '#007AFF', fontWeight: '700' }}>Créer et ajouter</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
  },
  filters: {
    paddingLeft: 24,
    paddingBottom: 4,
  },
  chip: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginHorizontal: 4,
    marginVertical: 4,
    fontSize: 13,
    overflow: 'hidden',
  },
  chipActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
    color: '#fff',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#8884',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    gap: 6,
    maxHeight: '85%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
});
