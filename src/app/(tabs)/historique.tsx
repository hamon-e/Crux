import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';

import {
  getWorkouts,
  getWorkoutDaysGrouped,
  getCurrentWeekDailyVolume,
} from '@/db/queries';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/use-theme';
import { WorkoutHeatmap, HEATMAP_CARD_WIDTH, type DayInfo } from '@/components/workout-heatmap';
import { ROUTINE_COLORS } from '@/constants/routine-colors';

type WorkoutRow = Awaited<ReturnType<typeof getWorkouts>>[number];
type WeekDays = Awaited<ReturnType<typeof getCurrentWeekDailyVolume>>;

const DAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function formatDate(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function HistoryScreen() {
  const db = useSQLiteContext();
  const colors = useTheme();
  const [workouts, setWorkouts] = useState<WorkoutRow[]>([]);
  const [days, setDays] = useState<Map<string, DayInfo>>(new Map());
  const [weekly, setWeekly] = useState<WeekDays>([]);

  useFocusEffect(
    useCallback(() => {
      void getWorkouts(db)
        .then((rows) => rows.filter((w) => w.completed === 1))
        .then(setWorkouts);
      void getWorkoutDaysGrouped(db).then(setDays);
      void getCurrentWeekDailyVolume(db).then(setWeekly);
    }, [db])
  );

  const weekDays = (() => {
    const toISO = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`;
    const byDay = new Map(weekly.map((d) => [d.day, d]));
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return DAY_LABELS.map((label, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const iso = toISO(d);
      const data = byDay.get(iso);
      return {
        iso,
        label,
        volume: data?.volume ?? 0,
        trained: (data?.workout_count ?? 0) > 0,
        isToday: iso === toISO(now),
      };
    });
  })();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>Historique</Text>
      <FlatList
        style={{ flex: 1 }}
        data={workouts}
        keyExtractor={(w) => String(w.id)}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            <WorkoutHeatmap days={days} />
            <Text
              style={{
                color: colors.textSecondary,
                fontWeight: '700',
                textTransform: 'uppercase',
                fontSize: 12,
                marginTop: 16,
                marginBottom: 8,
              }}>
              Volume hebdomadaire
            </Text>
            <View
              style={[
                styles.card,
                styles.weekCard,
                { backgroundColor: colors.backgroundElement },
              ]}>
              <View style={styles.chartRow}>
                {weekDays.map((d) => (
                  <View key={d.iso} style={styles.dayColumn}>
                    <View style={styles.dayLabel}>
                      {d.trained && (
                        <Ionicons name="checkmark-circle" size={15} color="#34C759" />
                      )}
                    </View>
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: d.isToday ? '800' : '400',
                        color: d.isToday ? colors.text : colors.textSecondary,
                      }}>
                      {d.label}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        }
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', color: colors.textSecondary, marginTop: 40 }}>
            Aucune séance terminée pour le moment.
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={[styles.card, { backgroundColor: colors.backgroundElement }]}
            onPress={() => router.push(`/historique/${item.id}`)}>
            <View style={{ flex: 1 }}>
              <View style={styles.workoutTitle}>
                <View
                  style={[
                    styles.routineDot,
                    { backgroundColor: item.color || ROUTINE_COLORS[0] },
                  ]}
                />
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16, flexShrink: 1 }}>
                  {item.name || 'Séance'}
                </Text>
              </View>
              <Text style={{ color: colors.textSecondary }}>{formatDate(item.date)}</Text>
              <Text style={{ color: colors.textSecondary }}>
                {item.set_count > 0
                  ? `${item.set_count} séries · ${Math.round(item.total_volume).toLocaleString('fr-FR')} kg de volume`
                  : item.duration_min
                    ? `${item.duration_min} min`
                    : 'Séance'}
              </Text>
            </View>
            <Text style={{ color: '#007AFF', fontSize: 20 }}>›</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 8,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chartRow: {
    flexDirection: 'row',
    gap: 6,
  },
  weekCard: {
    width: HEATMAP_CARD_WIDTH,
    alignSelf: 'flex-start',
  },
  dayColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  dayLabel: {
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workoutTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
