import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

interface Props {
  isCustom: number;
  compact?: boolean;
}

/** Identifie l'origine d'un exercice sans se baser sur son nom ou ses tags métier. */
export function ExerciseOriginTag({ isCustom, compact = false }: Props) {
  const colors = useTheme();
  const custom = isCustom === 1;

  return (
    <View
      style={[
        styles.tag,
        compact && styles.compact,
        {
          backgroundColor: custom ? '#FF9F0A22' : '#007AFF22',
          borderColor: custom ? '#FF9F0A88' : '#007AFF88',
        },
      ]}
      accessibilityLabel={custom ? 'Exercice personnel' : "Exercice inclus dans l'application"}>
      <Text
        style={[
          styles.label,
          compact && styles.compactLabel,
          { color: custom ? '#B76E00' : '#0066CC' },
          colors.text === '#ffffff' && { color: custom ? '#FFB340' : '#66B3FF' },
        ]}>
        {custom ? 'Personnel' : "Dans l'app"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  compact: {
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
  },
  compactLabel: {
    fontSize: 11,
  },
});
