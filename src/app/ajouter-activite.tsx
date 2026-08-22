import { useState } from 'react';
import { router } from 'expo-router';
import {
  KeyboardAvoidingView,
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

import { logActivityWorkout } from '@/db/queries';
import { ROUTINE_COLORS } from '@/app/(tabs)/plus';
import { useTheme } from '@/hooks/use-theme';
import { alert } from '@/lib/alert';

export default function AddActivityScreen() {
  const db = useSQLiteContext();
  const colors = useTheme();

  const [activity, setActivity] = useState('');
  const [durationMin, setDurationMin] = useState('60');
  const [notes, setNotes] = useState('');
  const [color, setColor] = useState(ROUTINE_COLORS[0]);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const name = activity.trim();
    const mins = parseInt(durationMin, 10);
    if (!name || !Number.isFinite(mins) || mins <= 0) {
      alert('Champs manquants', 'Saisis un nom d’activité et une durée valide.');
      return;
    }
    setSaving(true);
    try {
      const id = await logActivityWorkout(db, name, mins, notes.trim(), color);
      router.replace(`/historique/${id}`);
    } catch (e) {
      setSaving(false);
      const message = e instanceof Error ? e.message : String(e);
      alert("Erreur d'enregistrement", message);
      console.error(e);
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Activité</Text>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: colors.backgroundElement, color: colors.text },
            ]}
            placeholder="Nom de l'activité (ex : Grimpe bloc, Vélo…)"
            placeholderTextColor={colors.textSecondary}
            value={activity}
            onChangeText={setActivity}
          />

          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Couleur</Text>
          <View style={styles.chipWrap}>
            {ROUTINE_COLORS.map((c) => (
              <Pressable
                key={c}
                style={[
                  styles.colorSwatch,
                  {
                    backgroundColor: c,
                    borderWidth: color === c ? 3 : 0,
                    borderColor: colors.text,
                  },
                ]}
                onPress={() => setColor(c)}
              />
            ))}
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
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
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
});
