import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function formatFrDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${iso}T12:00:00`));
}

/** Sélecteur de date passé (aujourd'hui maximum), pour valider une séance rétroactivement. */
export function PastDatePickerModal({
  visible,
  value,
  title = 'Choisir une date',
  onClose,
  onConfirm,
}: {
  visible: boolean;
  value: string;
  title?: string;
  onClose: () => void;
  onConfirm: (date: string) => void;
}) {
  const colors = useTheme();
  const maxIso = todayISO();
  const [temp, setTemp] = useState(value);
  const [prevVisible, setPrevVisible] = useState(visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) setTemp(value);
  }

  function shift(days: number) {
    const d = new Date(`${temp}T12:00:00`);
    d.setDate(d.getDate() + days);
    const iso = toISODate(d);
    if (iso > maxIso) return;
    setTemp(iso < minIso ? minIso : iso);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <View style={styles.row}>
            <Pressable hitSlop={8} disabled={temp <= minIso} onPress={() => shift(-1)}>
              <Text style={[styles.arrow, { color: temp <= minIso ? colors.textSecondary : '#007AFF' }]}>←</Text>
            </Pressable>
            <Text style={[styles.dateText, { color: colors.text }]}>{formatFrDate(temp)}</Text>
            <Pressable hitSlop={8} disabled={temp >= maxIso} onPress={() => shift(1)}>
              <Text style={[styles.arrow, { color: temp >= maxIso ? colors.textSecondary : '#007AFF' }]}>→</Text>
            </Pressable>
          </View>
          <View style={styles.quickRow}>
            {[1, 2, 3].map((n) => {
              const d = new Date();
              d.setDate(d.getDate() - n);
              const iso = toISODate(d);
              return (
                <Pressable
                  key={n}
                  style={[
                    styles.chip,
                    temp === iso ? { backgroundColor: '#007AFF' } : { borderColor: colors.backgroundSelected, borderWidth: 1.5 },
                  ]}
                  onPress={() => setTemp(iso)}>
                  <Text
                    style={{
                      color: temp === iso ? '#fff' : colors.text,
                      fontWeight: '600',
                      fontSize: 13,
                    }}>
                    {n === 1 ? 'Hier' : `Il y a ${n} jours`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.actions}>
            <Pressable onPress={onClose}>
              <Text style={{ color: colors.textSecondary }}>Annuler</Text>
            </Pressable>
            <Pressable onPress={() => onConfirm(temp)}>
              <Text style={{ color: '#007AFF', fontWeight: '700' }}>Valider</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const MIN_DAYS_AGO = 365;
const minIso = (() => {
  const d = new Date();
  d.setDate(d.getDate() - MIN_DAYS_AGO);
  return toISODate(d);
})();

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#0009',
    padding: 32,
  },
  card: {
    borderRadius: 20,
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  arrow: {
    fontSize: 24,
    fontWeight: '700',
    paddingHorizontal: 8,
  },
  dateText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  quickRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderColor: 'transparent',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
});
