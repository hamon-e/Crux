import { Alert, Platform } from 'react-native';

export interface AlertButton {
  text: string;
  style?: 'cancel' | 'destructive' | 'default';
  onPress?: () => void;
}

export function alert(title: string, message?: string) {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

export function confirm(title: string, message: string, buttons: AlertButton[]) {
  if (Platform.OS === 'web') {
    const ok = window.confirm(message ? `${title}\n\n${message}` : title);
    const positive = buttons.find((b) => b.style !== 'cancel') ?? buttons[0];
    const cancel = buttons.find((b) => b.style === 'cancel');
    if (ok) positive?.onPress?.();
    else cancel?.onPress?.();
    return;
  }
  Alert.alert(title, message, buttons);
}
