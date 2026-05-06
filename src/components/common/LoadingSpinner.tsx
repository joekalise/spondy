import React from 'react';
import {
  View,
  ActivityIndicator,
  Text,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { Colors } from '@/constants/colors';
import { FontSize, Spacing } from '@/constants/theme';

interface LoadingSpinnerProps {
  message?: string;
  size?: 'small' | 'large';
  fullScreen?: boolean;
}

export function LoadingSpinner({
  message,
  size = 'large',
  fullScreen = false,
}: LoadingSpinnerProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <View style={[styles.container, fullScreen && styles.fullScreen]}>
      <ActivityIndicator size={size} color={Colors.primary} />
      {message ? (
        <Text style={[styles.message, isDark && styles.messageDark]}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  fullScreen: {
    flex: 1,
  },
  message: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  messageDark: {
    color: Colors.textSecondaryDark,
  },
});
