import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Svg, Path } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKS = 26;
const CELL = 14;
const GAP = 3;
const FALLBACK_COLOR = '#4a90d9';

export const HEATMAP_CARD_WIDTH = WEEKS * (CELL - GAP) + (WEEKS - 1) * GAP + 16 * 2;

export interface DayInfo {
  count: number;
  colors: string[];
}

/** Les dates en base sont au format UTC (toISOString), on travaille donc aussi en UTC ici. */
function keyOf(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Quart de cercle (part de camembert) entre deux angles, en radians. */
function slicePath(size: number, start: number, end: number) {
  const c = size / 2;
  const r = c;
  const x0 = c + r * Math.cos(start);
  const y0 = c + r * Math.sin(start);
  const x1 = c + r * Math.cos(end);
  const y1 = c + r * Math.sin(end);
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${c} ${c} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
}

function DayCell({ info, maxCount }: { info: DayInfo; maxCount: number }) {
  const size = CELL - GAP;
  const colors = info.colors.filter(Boolean);
  const base = colors.length ? colors : [FALLBACK_COLOR];
  const opacity = opacityFor(info.count, maxCount);

  if (base.length <= 1) {
    return (
      <View
        style={[
          styles.cell,
          { backgroundColor: base[0], opacity },
        ]}
      />
    );
  }

  // Plusieurs séances dans la journée : la cellule est découpée en quartiers,
  // un par séance, coloré avec la couleur de chacune.
  return (
    <Svg width={size} height={size} style={{ opacity }}>
      {base.map((color, i) => (
        <Path
          key={i}
          d={slicePath(
            size,
            (i / base.length) * Math.PI * 2 - Math.PI / 2,
            ((i + 1) / base.length) * Math.PI * 2 - Math.PI / 2
          )}
          fill={color}
        />
      ))}
    </Svg>
  );
}

export function WorkoutHeatmap({ days }: { days: Map<string, DayInfo> }) {
  const colors = useTheme();

  const weeks = useMemo(() => {
    const todayMs = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
    // Lundi de la semaine actuelle (1re colonne) ; lignes lundi → dimanche
    const currentWeekStart = todayMs - ((new Date(todayMs).getUTCDay() + 6) % 7) * DAY_MS;
    const oldestWeekStart = currentWeekStart - (WEEKS - 1) * 7 * DAY_MS;

    const cols: ({ key: string; info: DayInfo | null } | null)[][] = [];
    for (let w = 0; w < WEEKS; w++) {
      const colStart = currentWeekStart - w * 7 * DAY_MS;
      if (colStart < oldestWeekStart) break;
      const col: ({ key: string; info: DayInfo | null } | null)[] = [];
      for (let d = 0; d < 7; d++) {
        const ms = colStart + d * DAY_MS;
        if (ms > todayMs) {
          col.push(null);
          continue;
        }
        const info = days.get(keyOf(ms)) ?? null;
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

  return (
    <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
      <Text style={[styles.title, { color: colors.text }]}>Séances</Text>
      <View style={styles.grid}>
        {weeks.map((col, i) => (
          <View key={i} style={styles.col}>
            {col.map((cell, j) => {
              if (!cell) return null;
              if (!cell.info) {
                return (
                  <View
                    key={cell.key}
                    style={[styles.cell, { backgroundColor: colors.backgroundSelected }]}
                  />
                );
              }
              return <DayCell key={cell.key} info={cell.info} maxCount={maxCount} />;
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

function opacityFor(count: number, maxCount: number) {
  if (count <= maxCount / 4) return 0.6;
  if (count <= maxCount / 2) return 0.75;
  if (count <= (maxCount * 3) / 4) return 0.9;
  return 1;
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
