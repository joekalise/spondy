import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  useColorScheme,
  ViewStyle,
} from 'react-native';
import { Colors } from '@/constants/colors';
import { FontSize, Spacing, BorderRadius } from '@/constants/theme';

interface OptionCardProps {
  label: string;
  isSelected: boolean;
  onPress: () => void;
  style?: ViewStyle;
}

export function OptionCard({ label, isSelected, onPress, style }: OptionCardProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[
        styles.card,
        isDark ? styles.cardDark : styles.cardLight,
        isSelected && styles.cardSelected,
        style,
      ]}
    >
      <Text
        style={[
          styles.label,
          isDark ? styles.labelDark : styles.labelLight,
          isSelected && styles.labelSelected,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderWidth: 1.5,
    marginBottom: Spacing.sm,
    alignItems: 'flex-start',
  },
  cardLight: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
  },
  cardDark: {
    backgroundColor: Colors.surfaceDark,
    borderColor: Colors.borderDark,
  },
  cardSelected: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  label: {
    fontSize: FontSize.md,
    lineHeight: 22,
  },
  labelLight: {
    color: Colors.textPrimary,
  },
  labelDark: {
    color: Colors.textPrimaryDark,
  },
  labelSelected: {
    color: Colors.primaryDark,
    fontWeight: '600',
  },
});
