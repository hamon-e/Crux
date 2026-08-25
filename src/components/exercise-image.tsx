import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { EXERCISE_IMAGES } from '@/db/exercise-images';
import { MOBILITY_IMAGES } from '@/db/mobility-images';
import { useTheme } from '@/hooks/use-theme';

interface Props {
  name: string;
  muscle?: string;
  imageUri?: string;
  /** largeur en px ; hauteur = largeur * 2/3 (format 3:2 des images) */
  width?: number;
  radius?: number;
  /** pleine largeur du parent, ratio 3:2 conservé */
  fullWidth?: boolean;
  /** Libellé affiché dans le repli quand aucune image n'est disponible. */
  emptyLabel?: string;
  style?: object;
}

const FALLBACK_LABELS: Record<string, string> = {
  chest: 'PEC',
  back: 'DOS',
  traps: 'TRAP',
  shoulders: 'ÉPA',
  biceps: 'BIC',
  triceps: 'TRI',
  forearms: 'AVB',
  fingers: 'DOIG',
  core: 'ABS',
  quads: 'QUA',
  hamstrings: 'ISCH',
  glutes: 'FES',
  calves: 'MOL',
  fullbody: 'FULL',
  cardio: 'CARDIO',
};

/** Image d'un exercice (base free-exercise-db, domaine public) avec repli silhouette. */
export function ExerciseImage({
  name,
  muscle,
  imageUri,
  width,
  radius = 8,
  fullWidth,
  emptyLabel,
  style,
}: Props) {
  const colors = useTheme();
  const source = imageUri ? { uri: imageUri } : getExerciseImageSource(name);
  const sizeStyle = fullWidth
    ? { alignSelf: 'stretch' as const, aspectRatio: 3 / 2 }
    : { width, height: Math.round(((width ?? 0) * 2) / 3) };

  if (source) {
    return (
      <Image
        source={source}
        style={[styles.img, sizeStyle, { borderRadius: radius }, style]}
        contentFit="cover"
        recyclingKey={imageUri ?? name}
      />
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        sizeStyle,
        {
          borderRadius: radius,
          backgroundColor: colors.backgroundSelected,
        },
        style,
      ]}>
      <Text style={{ color: colors.textSecondary, fontSize: emptyLabel ? 15 : Math.max(9, (width ?? 64) / 7), fontWeight: '700' }}>
        {emptyLabel ?? FALLBACK_LABELS[muscle ?? ''] ?? '—'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  img: {
    backgroundColor: '#ddd',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

let normalizedIndex: Map<string, number> | null = null;

export function getExerciseImageSource(name: string): number | undefined {
  return EXERCISE_IMAGES[name] ?? MOBILITY_IMAGES[name] ?? lookupNormalized(name);
}

/** Retrouve une image même si le nom diffère par la casse ou les accents. */
function lookupNormalized(name: string): number | undefined {
  if (!normalizedIndex) {
    normalizedIndex = new Map(
      [...Object.entries(EXERCISE_IMAGES), ...Object.entries(MOBILITY_IMAGES)].map(
        ([key, module]) => [normalizeKey(key), module]
      )
    );
  }
  return normalizedIndex.get(normalizeKey(name));
}
