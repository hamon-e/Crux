import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  KeyboardAvoidingView,
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
import { useSQLiteContext } from 'expo-sqlite';

import {
  createActivityType,
  getActivityTypes,
  logActivityWorkout,
} from '@/db/queries';
import type { ActivityType } from '@/db/types';
import { ROUTINE_COLORS } from '@/app/(tabs)/plus';
import { useTheme } from '@/hooks/use-theme';
import { alert } from '@/lib/alert';

export default function AddActivityScreen() {
  const db = useSQLiteContext();
  const colors = useTheme();

  const [types, setTypes] = useState<ActivityType[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);
  const [durationMin, setDurationMin] = useState('60');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(ROUTINE_COLORS[0]);

  async function reloadTypes() {
    setTypes(await getActivityTypes(db));
  }

  useFocusEffect(
    useCallback(() => {
      void reloadTypes();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [db])
  );

  const selectedType = types.find((t) => t.id === selectedTypeId) ?? null;

  async function handleSave() {
    if (!selectedType) {
      alert('Champs manquants', 'Choisis un type d’activité ou crée-en un nouveau.');
      return;
    }
    const mins = parseInt(durationMin, 10);
    if (!Number.isFinite(mins) || mins <= 0) {
      alert('Champs manquants', 'Saisis une durée valide.');
      return;
    }
    setSaving(true);
    try {
      await logActivityWorkout(db, selectedType.name, mins, notes.trim(), selectedType.color);
      router.back();
    } catch (e) {
      setSaving(false);
      const message = e instanceof Error ? e.message : String(e);
      alert("Erreur d'enregistrement", message);
      console.error(e);
    }
  }

  function openCreate() {
    setNewName('');
    setNewColor(ROUTINE_COLORS[0]);
    setCreateOpen(true);
  }

  async function handleCreateType() {
    const name = newName.trim();
    if (!name) return;
    try {
      const id = await createActivityType(db, name, newColor);
      await reloadTypes();
      setSelectedTypeId(id);
      setCreateOpen(false);
    } catch {
      alert('Erreur', 'Un type d’activité porte déjà ce nom.');
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Type d’activité</Text>
          <View style={[styles.typeList, { backgroundColor: colors.backgroundElement }]}>
            {types.map((type, i) => (
              <Pressable
                key={type.id}
                style={[styles.typeRow, i > 0 && styles.typeRowDivider]}
                onPress={() =>
                  setSelectedTypeId(selectedTypeId === type.id ? null : type.id)
                }>
                <View style={[styles.typeDot, { backgroundColor: type.color || '#8e8e93' }]} />
                <Text style={[styles.typeName, { color: colors.text }]}>{type.name}</Text>
                <Text style={[styles.check, { opacity: selectedTypeId === type.id ? 1 : 0, color: '#007AFF' }]}>
                  ✓
                </Text>
              </Pressable>
            ))}
            <Pressable
              style={[
                styles.typeRow,
                styles.createRow,
                types.length > 0 && styles.typeRowDivider,
              ]}
              onPress={openCreate}>
              <Text style={{ color: '#007AFF', fontWeight: '600', fontSize: 15 }}>+ Créer un nouveau type</Text>
            </Pressable>
          </View>

          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Durée</Text>
          <View style={styles.durationRow}>
            <TextInput
              style={[
                styles.durationInput,
                { backgroundColor: colors.backgroundElement, color: colors.text },
              ]}
              placeholder="60"
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              value={durationMin}
              onChangeText={setDurationMin}
            />
            <Text style={{ color: colors.textSecondary }}>minutes</Text>
          </View>

          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            Description (optionnel)
          </Text>
          <TextInput
            style={[
              styles.input,
              styles.notesInput,
              { backgroundColor: colors.backgroundElement, color: colors.text },
            ]}
            placeholder="Ex : 12 blocs cotation 5e-6c, bonne session…"
            placeholderTextColor={colors.textSecondary}
            multiline
            textAlignVertical="top"
            value={notes}
            onChangeText={setNotes}
          />

          <Pressable
            style={[styles.primaryButton, { backgroundColor: '#007AFF', opacity: saving ? 0.6 : 1 }]}
            onPress={handleSave}
            disabled={saving}>
            <Text style={styles.primaryButtonText}>Ajouter la séance</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={createOpen} animationType="slide" transparent onRequestClose={() => setCreateOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Nouveau type d’activité</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.backgroundElement, color: colors.text }]}
              placeholder="Nom (ex : Grimpe bloc, Vélo…)"
              placeholderTextColor={colors.textSecondary}
              value={newName}
              onChangeText={setNewName}
            />
            <Text style={{ color: colors.textSecondary, marginTop: 12 }}>Couleur</Text>
            <View style={styles.chipWrap}>
              {ROUTINE_COLORS.map((c) => (
                <Pressable
                  key={c}
                  style={[
                    styles.colorSwatch,
                    {
                      backgroundColor: c,
                      borderWidth: newColor === c ? 3 : 0,
                      borderColor: colors.text,
                    },
                  ]}
                  onPress={() => setNewColor(c)}
                />
              ))}
            </View>
            <View style={styles.modalActions}>
              <Pressable onPress={() => setCreateOpen(false)}>
                <Text style={{ color: colors.textSecondary }}>Annuler</Text>
              </Pressable>
              <Pressable onPress={handleCreateType}>
                <Text style={{ color: '#007AFF', fontWeight: '700' }}>Créer et utiliser</Text>
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
  content: {
    padding: 24,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
  },
  typeList: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  typeRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#8884',
  },
  createRow: {
    justifyContent: 'center',
  },
  typeDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: 12,
  },
  typeName: {
    flex: 1,
    fontSize: 16,
  },
  check: {
    fontSize: 16,
    fontWeight: '700',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 6,
  },
  colorSwatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  input: {
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
  },
  notesInput: {
    minHeight: 100,
    paddingTop: 14,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  durationInput: {
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    width: 120,
    textAlign: 'center',
  },
  primaryButton: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: '#0009',
  },
  modalCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    gap: 6,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  modalInput: {
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
});
