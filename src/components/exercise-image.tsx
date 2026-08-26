import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';

import { EXERCISE_IMAGES } from '@/db/exercise-images';
import { MOBILITY_IMAGES } from '@/db/mobility-images';
import { CLIMBING_IMAGES } from '@/db/climbing-images';
import { getStepImageSource } from '@/db/skill-images';
import { SKILL_STEPS } from '@/db/skill-steps';
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
let skillImageIndex: Map<string, number | { uri: string }> | null = null;

export function getExerciseImageSource(name: string): number | { uri: string } | undefined {
  return (
    MOBILITY_IMAGES[name] ??
    CLIMBING_IMAGES[name] ??
    lookupSkillImage(name) ??
    EXERCISE_IMAGES[name] ??
    lookupNormalized(name)
  );
}

/** Retrouve une image même si le nom diffère par la casse ou les accents. */
function lookupNormalized(name: string): number | undefined {
  if (!normalizedIndex) {
    normalizedIndex = new Map(
      [...Object.entries(EXERCISE_IMAGES), ...Object.entries(MOBILITY_IMAGES), ...Object.entries(CLIMBING_IMAGES)].map(
        ([key, module]) => [normalizeKey(key), module]
      )
    );
  }
  return normalizedIndex.get(normalizeKey(name));
}

/**
 * Les étapes des compétences sont aussi proposées comme exercices de routine.
 * Leurs images sont stockées avec le contenu de progression, pas dans les
 * catalogues force/mobilité : on les indexe donc par nom ici.
 */
function lookupSkillImage(name: string): number | { uri: string } | undefined {
  if (!skillImageIndex) {
    skillImageIndex = new Map();

    for (const skill of SKILL_STEPS) {
      const cover = skill.steps
        .map((step) => toExerciseImageSource(getStepImageSource(step.image)))
        .find((source): source is number | { uri: string } => source !== null);

      if (cover) skillImageIndex.set(normalizeKey(skill.key), cover);

      for (const step of skill.steps) {
        // Certaines étapes n'ont pas d'illustration propre : la couverture
        // de leur compétence reste plus utile que la tuile générique.
        const source = toExerciseImageSource(getStepImageSource(step.image)) ?? cover;
        if (source) skillImageIndex.set(normalizeKey(step.name), source);
      }
    }
  }

  return skillImageIndex.get(normalizeKey(name));
}

function toExerciseImageSource(
  source: ImageSourcePropType | null,
): number | { uri: string } | null {
  if (typeof source === 'number') return source;
  if (source && !Array.isArray(source) && typeof source.uri === 'string')
    return { uri: source.uri };
  return null;
}
