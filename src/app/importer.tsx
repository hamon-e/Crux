import { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useSQLiteContext } from 'expo-sqlite';

import {
  getExercises,
  getUnmatchedImportExercises,
  importStrongWorkouts,
  type ImportStats,
} from '@/db/queries';
import { MUSCLES, MUSCLE_LABELS, type Exercise, type Muscle } from '@/db/types';
import { parseStrongCsv, type ParsedWorkout } from '@/lib/strong-csv';
import { useTheme } from '@/hooks/use-theme';

async function pickCsv(): Promise<{ name: string; text: string } | null> {
  if (Platform.OS === 'android') {
    // Le picker natif de expo-file-system renvoie un File directement lisible
    const picked = await File.pickFileAsync({
      mimeTypes: ['text/csv', 'text/plain', 'application/csv', '*/*'],
    });
    if (picked.canceled) return null;
    const file = Array.isArray(picked.result) ? picked.result[0] : picked.result;
    return { name: file.name, text: await file.text() };
  }

  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'public.comma-separated-values-text'],
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  if (Platform.OS === 'web') {
    // expo-file-system n'est pas disponible sur web : on lit le blob via fetch
    const text = await (await fetch(asset.uri)).text();
    return { name: asset.name, text };
  }
  const file = new File(asset.uri);
  return { name: asset.name, text: await file.text() };
}

export default function ImportScreen() {
  const db = useSQLiteContext();
  const colors = useTheme();
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedWorkout[] | null>(null);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  /** nom CSV -> id d'exercice existant (absent = créer un nouvel exercice). */
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  /** nom CSV -> groupe musculaire pour les nouveaux exercices créés à l'import. */
  const [newMuscles, setNewMuscles] = useState<Record<string, Muscle>>({});
  const [musclePickName, setMusclePickName] = useState<string | null>(null);
  const [exerciseList, setExerciseList] = useState<Exercise[]>([]);
  const [mappingName, setMappingName] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [busy, setBusy] = useState(false);

  const filteredExercises = useMemo(() => {
    if (!search.trim()) return exerciseList;
    const q = search.toLowerCase();
    return exerciseList.filter((e) => e.name.toLowerCase().includes(q));
  }, [exerciseList, search]);

  const exerciseById = useMemo(
    () => new Map(exerciseList.map((e) => [e.id, e])),
    [exerciseList]
  );

  const unilateralCount = parsed
    ? new Set(
        parsed
          .filter((w) => w.sets.some((s) => s.side === 'left') && w.sets.some((s) => s.side === 'right'))
          .flatMap((w) =>
            [...new Set(w.sets.filter((s) => s.side).map((s) => s.exerciseName))].map(
              (name) => `${w.startedAt}|${name}`
            )
          )
      ).size
    : 0;

  async function pickAndParse() {
    setError(null);
    setStats(null);
    setParsed(null);
    setUnmatched([]);
    setOverrides({});
    setFileName(null);

    setBusy(true);
    try {
      const picked = await pickCsv();
      if (!picked) return;
      const parsedWorkouts = parseStrongCsv(picked.text);
      if (parsedWorkouts.length === 0) {
        setError(
          "Aucune séance trouvée dans ce fichier. Vérifie que c'est bien un export CSV de Strong."
        );
        return;
      }
      const [unmatchedNames, exercises] = await Promise.all([
        getUnmatchedImportExercises(db, parsedWorkouts),
        getExercises(db),
      ]);
      setFileName(picked.name);
      setParsed(parsedWorkouts);
      setUnmatched(unmatchedNames);
      setExerciseList(exercises);
    } catch (e) {
      setError(`Impossible de lire ce fichier.${e instanceof Error ? ` (${e.message})` : ''}`);
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    if (!parsed) return;
    setBusy(true);
    try {
      const s = await importStrongWorkouts(db, parsed, overrides, newMuscles);
      setStats(s);
      setParsed(null);
      setUnmatched([]);
      setOverrides({});
      setNewMuscles({});
      setFileName(null);
      setError(null);
    } catch (e) {
      setError(`Erreur pendant l'import.${e instanceof Error ? ` (${e.message})` : ''}`);
    } finally {
      setBusy(false);
    }
  }

  function openMapping(name: string) {
    setSearch('');
    setMappingName(name);
  }

  function chooseExercise(id: number | null) {
    if (!mappingName) return;
    const name = mappingName;
    setOverrides((prev) => {
      const next = { ...prev };
      if (id === null) delete next[name];
      else next[name] = id;
      return next;
    });
    setMappingName(null);
    // Nouvel exercice : on demande directement son groupe musculaire cible
    if (id === null) setMusclePickName(name);
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>Importer depuis Strong</Text>
        <Text style={{ color: colors.textSecondary }}>
          Dans l&apos;app Strong : Réglages → Exporter les données → Format CSV. Sélectionne ensuite
          le fichier ici. Les séances déjà présentes sont ignorées automatiquement et une routine est
          créée pour chaque nom de séance (droite puis gauche pour les exercices unilatéraux).
        </Text>

        <Pressable
          style={[styles.button, { backgroundColor: '#007AFF' }, busy && styles.disabled]}
          disabled={busy}
          onPress={() => void pickAndParse()}>
          <Text style={styles.buttonText}>1. Choisir un fichier CSV</Text>
        </Pressable>

        {parsed && (
          <>
            <Text style={{ color: colors.text }}>
              {fileName} — {parsed.length} séances détectées
            </Text>
            {unilateralCount > 0 && (
              <Text style={{ color: colors.textSecondary }}>
                {unilateralCount} exercice{unilateralCount > 1 ? 's' : ''} unilatéral
                {unilateralCount > 1 ? 'aux' : ''} détecté
                {unilateralCount > 1 ? 's' : ''} : le 1er bloc de séries = côté droit, le 2e = côté
                gauche.
              </Text>
            )}
            {unmatched.length > 0 && (
              <View>
                <Text style={{ color: colors.text, fontWeight: '700' }}>
                  Nouveaux exercices ({unmatched.length})
                </Text>
                <Text style={{ color: colors.textSecondary }}>
                  Associe-les à un exercice existant ou choisis leur groupe musculaire, sinon ils
                  seront créés en Full body.
                </Text>
                {unmatched.map((name) => {
                  const target = overrides[name] ? exerciseById.get(overrides[name]) : null;
                  return (
                    <View key={name} style={styles.matchRow}>
                      <Pressable style={{ flex: 1 }} onPress={() => openMapping(name)}>
                        <Text style={{ color: colors.text }} numberOfLines={1}>
                          {name}
                        </Text>
                        <Text
                          style={{
                            color: target ? '#30D158' : colors.textSecondary,
                            fontWeight: '600',
                          }}
                          numberOfLines={1}>
                          {target ? `→ ${target.name} ›` : 'Nouvel exercice ›'}
                        </Text>
                      </Pressable>
                      {!target && (
                        <Pressable
                          style={[styles.muscleChip, { borderColor: colors.backgroundSelected }]}
                          onPress={() => {
                            setSearch('');
                            setMusclePickName(name);
                          }}>
                          <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>
                            {MUSCLE_LABELS[newMuscles[name] ?? 'fullbody']}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
            <Pressable
              style={[styles.button, { backgroundColor: '#30D158' }, busy && styles.disabled]}
              disabled={busy}
              onPress={() => void runImport()}>
              <Text style={styles.buttonText}>2. Importer</Text>
            </Pressable>
          </>
        )}

        {error && <Text style={{ color: '#FF453A' }}>{error}</Text>}

        {stats && (
          <Text style={{ color: colors.text }}>
            ✓ {stats.imported} séances importées · {stats.setsImported} séries ·{' '}
            {stats.exercisesCreated} nouveaux exercices
            {stats.routinesCreated > 0 ? ` · ${stats.routinesCreated} routines créées` : ''}
            {stats.skipped > 0 ? ` · ${stats.skipped} doublons ignorés` : ''}
          </Text>
        )}
      </ScrollView>

      <Modal visible={mappingName !== null} animationType="slide" transparent onRequestClose={() => setMappingName(null)}>
        <Pressable
          style={[styles.modalBackdrop, { backgroundColor: '#0009' }]}
          onPress={() => setMappingName(null)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]} numberOfLines={1}>
              Associer « {mappingName} »
            </Text>
            <TextInput
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.backgroundSelected, marginBottom: 10 },
              ]}
              placeholder="Rechercher un exercice…"
              placeholderTextColor={colors.textSecondary}
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
            />
            <FlatList
              style={{ maxHeight: 380 }}
              data={filteredExercises}
              keyExtractor={(e) => String(e.id)}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable style={styles.matchRow} onPress={() => chooseExercise(item.id)}>
                  <Text style={{ color: colors.text, flex: 1 }} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={{ color: colors.textSecondary }}>{item.muscle}</Text>
                </Pressable>
              )}
              ListEmptyComponent={
                <Text style={{ color: colors.textSecondary, textAlign: 'center', padding: 12 }}>
                  Aucun exercice trouvé.
                </Text>
              }
            />
            <Pressable style={styles.matchRow} onPress={() => chooseExercise(null)}>
              <Text style={{ color: '#FF9F0A', fontWeight: '600', flex: 1 }}>
                Créer un nouvel exercice
              </Text>
              <Text style={{ color: colors.textSecondary }}>›</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={musclePickName !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setMusclePickName(null)}>
        <Pressable
          style={[styles.modalBackdrop, { backgroundColor: '#0009' }]}
          onPress={() => setMusclePickName(null)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]} numberOfLines={1}>
              Groupe musculaire de « {musclePickName} »
            </Text>
            <View style={styles.chipWrap}>
              {MUSCLES.map((m) => {
                const active =
                  musclePickName !== null && (newMuscles[musclePickName] ?? 'fullbody') === m;
                return (
                  <Pressable
                    key={m}
                    style={[
                      styles.chip,
                      { borderColor: colors.backgroundSelected },
                      active && styles.chipActive,
                    ]}
                    onPress={() => {
                      if (!musclePickName) return;
                      setNewMuscles((prev) => ({ ...prev, [musclePickName]: m }));
                      setMusclePickName(null);
                    }}>
                    <Text style={{ color: active ? '#fff' : colors.text }}>
                      {MUSCLE_LABELS[m]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, gap: 14 },
  title: { fontSize: 28, fontWeight: '800' },
  button: { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.5 },
  input: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 11,
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
    maxHeight: '85%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12,
  },
  muscleChip: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
});
