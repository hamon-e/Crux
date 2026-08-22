import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKS = 26;
const CELL = 14;
const GAP = 3;
const FALLBACK_COLOR = '#4a90d9';

export interface DayInfo {
  count: number;
  color: string;
}

/** Les dates en base sont au format UTC (toISOString), on travaille donc aussi en UTC ici. */
function keyOf(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function WorkoutHeatmap({ days }: { days: Map<string, DayInfo> }) {
  const colors = useTheme();

  const weeks = useMemo(() => {
    const todayMs = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
    // Lundi de la semaine actuelle (1re colonne) ; lignes lundi → dimanche
    const currentWeekStart = todayMs - ((new Date(todayMs).getUTCDay() + 6) % 7) * DAY_MS;
    const oldestWeekStart = currentWeekStart - (WEEKS - 1) * 7 * DAY_MS;

    const cols: ({ key: string; info: DayInfo } | null)[][] = [];
    for (let w = 0; w < WEEKS; w++) {
      const colStart = currentWeekStart - w * 7 * DAY_MS;
      if (colStart < oldestWeekStart) break;
      const col: ({ key: string; info: DayInfo } | null)[] = [];
      for (let d = 0; d < 7; d++) {
        const ms = colStart + d * DAY_MS;
        if (ms > todayMs) {
          col.push(null);
          continue;
        }
        const info = days.get(keyOf(ms));
        if (!info) continue;
        col.push({ key: keyOf(ms), info });
      }
      cols.push(col);
    }
    return cols;
  }, [days]);

  const maxCount = useMemo(
    () => Math.max(1, ...[...days.values()].map((d) => d.count)),
    [days]
  );

  function opacity(count: number) {
    if (count <= maxCount / 4) return 0.35;
    if (count <= maxCount / 2) return 0.55;
    if (count <= (maxCount * 3) / 4) return 0.78;
    return 1;
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
      <Text style={[styles.title, { color: colors.text }]}>Activité</Text>
      <View style={styles.grid}>
        {weeks.map((col, i) => (
          <View key={i} style={styles.col}>
            {col.map((cell, j) =>
              cell ? (
                <View
                  key={cell.key}
                  style={[
                    styles.cell,
                    {
                      backgroundColor: cell.info.color || FALLBACK_COLOR,
                      opacity: opacity(cell.info.count),
                    },
                  ]}
                />
              ) : (
                <View key={`empty-${j}`} style={styles.cell} />
              )
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    gap: GAP,
  },
  col: {
    gap: GAP,
  },
  cell: {
    width: CELL - GAP,
    height: CELL - GAP,
    borderRadius: 7,
  },
});
