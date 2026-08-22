import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';

import {
  getMuscleVolume,
  getPersonalRecords,
  getTotalStats,
} from '@/db/queries';
import { useTheme } from '@/hooks/use-theme';

type PRs = Awaited<ReturnType<typeof getPersonalRecords>>;
type Muscle = Awaited<ReturnType<typeof getMuscleVolume>>;
type Totals = NonNullable<Awaited<ReturnType<typeof getTotalStats>>>;

const MUSCLE_LABELS: Record<string, string> = {
  chest: 'Pectoraux',
  back: 'Dos',
  traps: 'Trapèzes',
  shoulders: 'Épaules',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Avant-bras',
  fingers: 'Doigts',
  core: 'Abdos',
  quads: 'Quadriceps',
  hamstrings: 'Ischios',
  glutes: 'Fessiers',
  calves: 'Mollets',
  fullbody: 'Full body',
  cardio: 'Cardio',
};

const PERIODS: { label: string; days?: number }[] = [
  { label: '1 mois', days: 30 },
  { label: '3 mois', days: 90 },
  { label: '1 an', days: 365 },
  { label: 'Tout' },
];

export default function StatsScreen() {
  const db = useSQLiteContext();
  const colors = useTheme();
  const [totals, setTotals] = useState<Totals | null>(null);
  const [prs, setPrs] = useState<PRs>([]);
  const [muscles, setMuscles] = useState<Muscle>([]);
  const [period, setPeriod] = useState(PERIODS[0]);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        setTotals(await getTotalStats(db));
        setPrs(await getPersonalRecords(db, period.days));
        setMuscles(await getMuscleVolume(db, 30));
      })();
    }, [db, period])
  );

  const maxMuscleSets = Math.max(1, ...muscles.map((m) => m.set_count));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>Statistiques</Text>

        <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
          <View style={styles.statsRow}>
            <StatBox label="Séances" value={String(totals?.total_workouts ?? 0)} color={colors.text} />
            <StatBox label="Séries" value={String(totals?.total_sets ?? 0)} color={colors.text} />
            <StatBox
              label="Volume total"
              value={`${Math.round(totals?.total_volume ?? 0).toLocaleString('fr-FR')} kg`}
              color={colors.text}
            />
            <StatBox
              label="Temps total"
              value={`${Math.round((totals?.total_duration ?? 0) / 3600000)} h`}
              color={colors.text}
            />
          </View>
        </View>

        <SectionTitle text="Répartition par muscle (30 jours)" color={colors.textSecondary} />
        <View style={[styles.card, { backgroundColor: colors.backgroundElement, gap: 8 }]}>
          {muscles.length === 0 && (
            <Text style={{ color: colors.textSecondary }}>Pas encore de données.</Text>
          )}
          {muscles.map((m) => (
            <View key={m.muscle}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                <Text style={{ color: colors.text }}>{MUSCLE_LABELS[m.muscle] ?? m.muscle}</Text>
                <Text style={{ color: colors.textSecondary }}>
                  {m.set_count} séries · {Math.round(m.volume).toLocaleString('fr-FR')} kg
                </Text>
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.backgroundSelected }}>
                <View
                  style={{
                    width: `${(m.set_count / maxMuscleSets) * 100}%` as `${number}%`,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: '#007AFF',
                  }}
                />
              </View>
            </View>
          ))}
        </View>

        <SectionTitle text="Records personnels" color={colors.textSecondary} />
        <View style={styles.periodRow}>
          {PERIODS.map((p) => {
            const active = p.label === period.label;
            return (
              <Pressable
                key={p.label}
                onPress={() => setPeriod(p)}
                style={[
                  styles.periodPill,
                  { backgroundColor: active ? '#007AFF' : colors.backgroundElement },
                ]}>
                <Text style={{ color: active ? '#fff' : colors.textSecondary, fontWeight: '600', fontSize: 12 }}>
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {prs.length === 0 && (
          <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
            <Text style={{ color: colors.textSecondary }}>
              Aucun record sur cette période.
            </Text>
          </View>
        )}
        {prs.map((pr) => (
          <Pressable
            key={pr.exercise_id}
            style={[styles.prCard, { backgroundColor: colors.backgroundElement }]}
            onPress={() => router.push(`/exercice/${pr.exercise_id}`)}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{pr.name}</Text>
              <Text style={{ color: colors.textSecondary }}>{pr.date}</Text>
            </View>
            {pr.top_weight_left != null && pr.top_weight_right != null ? (
              <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-end' }}>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: '#007AFF', fontWeight: '800' }}>
                    {Math.round(pr.top_weight_left)} kg
                  </Text>
                  <Text style={{ color: colors.textSecondary }}>Gauche</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: '#007AFF', fontWeight: '800' }}>
                    {Math.round(pr.top_weight_right)} kg
                  </Text>
                  <Text style={{ color: colors.textSecondary }}>Droite</Text>
                </View>
              </View>
            ) : (
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: '#007AFF', fontWeight: '800' }}>
                  {Math.round(pr.top_weight)} kg
                </Text>
                <Text style={{ color: colors.textSecondary }}>Max</Text>
              </View>
            )}
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Text style={{ color, fontWeight: '800', fontSize: 16 }}>{value}</Text>
      <Text style={{ color: '#888', fontSize: 11 }}>{label}</Text>
    </View>
  );
}

function SectionTitle({ text, color }: { text: string; color: string }) {
  return (
    <Text style={{ color, fontWeight: '700', textTransform: 'uppercase', fontSize: 12, marginTop: 8 }}>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, gap: 10 },
  title: { fontSize: 32, fontWeight: '800', marginBottom: 4 },
  card: { borderRadius: 14, padding: 16 },
  prCard: {
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statsRow: { flexDirection: 'row' },
  periodRow: { flexDirection: 'row', gap: 8 },
  periodPill: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
});
