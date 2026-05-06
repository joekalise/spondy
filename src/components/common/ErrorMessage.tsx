import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';
import { Colors } from '@/constants/colors';
import { FontSize, Spacing, BorderRadius } from '@/constants/theme';

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorMessage({
  message,
  onRetry,
  retryLabel = 'Try again',
}: ErrorMessageProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <Text style={styles.icon}>!</Text>
      <Text style={[styles.message, isDark && styles.messageDark]}>{message}</Text>
      {onRetry ? (
        <TouchableOpacity onPress={onRetry} style={styles.retryButton}>
          <Text style={styles.retryLabel}>{retryLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  containerDark: {
    backgroundColor: '#450A0A',
    borderColor: '#7F1D1D',
  },
  icon: {
    fontSize: FontSize.xl,
    color: Colors.error,
    fontWeight: '700',
    width: 28,
    height: 28,
    textAlign: 'center',
    lineHeight: 28,
    backgroundColor: '#FECACA',
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  message: {
    fontSize: FontSize.sm,
    color: '#991B1B',
    textAlign: 'center',
    lineHeight: 20,
  },
  messageDark: {
    color: '#FCA5A5',
  },
  retryButton: {
    marginTop: Spacing.xs,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.error,
    borderRadius: BorderRadius.sm,
  },
  retryLabel: {
    fontSize: FontSize.sm,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
